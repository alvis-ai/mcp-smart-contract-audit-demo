import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { normalizeAuditResult } from "./analyzer.js";
import { withPgClient } from "./database.js";
import { getProjectRoot } from "./knowledge-base.js";

const dataDir = path.join(getProjectRoot(), "data");
const auditsFile = path.join(dataDir, "audits.json");
const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.AUDIT_MAX_ATTEMPTS || 3));
const WORKER_STALE_AFTER_MS = Math.max(5000, Number(process.env.AUDIT_WORKER_STALE_AFTER_MS || 30000));

let initializationPromise;

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function stripLargeFields(result) {
  const { code, ...rest } = result || {};
  return {
    ...rest,
    codeSize: typeof code === "string" ? code.length : 0
  };
}

function parseJson(value) {
  if (!value) {
    return null;
  }
  if (typeof value === "object") {
    return value;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mapAuditJobSummary(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    inputType: row.input_type,
    target: row.target,
    chainId: row.chain_id,
    contractType: row.contract_type,
    status: row.status,
    summary: row.summary,
    analysisMode: row.analysis_mode,
    errorMessage: row.error_message,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS),
    nextAttemptAt: toIso(row.next_attempt_at),
    workerId: row.worker_id,
    leaseUntil: toIso(row.lease_until),
    lastHeartbeatAt: toIso(row.last_heartbeat_at),
    progress: parseJson(row.progress_json) || null
  };
}

function mapAuditJob(row) {
  if (!row) {
    return null;
  }

  const normalizedResult = normalizeAuditResult(row.result_json || null, {
    contractType: row.contract_type || "",
    analysisMode: row.analysis_mode || ""
  });

  return {
    id: row.id,
    inputType: row.input_type,
    target: row.target,
    chainId: row.chain_id,
    contractType: row.contract_type,
    status: row.status,
    summary: normalizedResult?.summary || row.summary,
    analysisMode: normalizedResult?.analysisMode || row.analysis_mode,
    errorMessage: row.error_message,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    attempts: Number(row.attempts || 0),
    maxAttempts: Number(row.max_attempts || DEFAULT_MAX_ATTEMPTS),
    nextAttemptAt: toIso(row.next_attempt_at),
    workerId: row.worker_id,
    leaseUntil: toIso(row.lease_until),
    lastHeartbeatAt: toIso(row.last_heartbeat_at),
    progress: parseJson(row.progress_json) || null,
    result: normalizedResult
  };
}

async function migrateLegacyJsonAuditHistory(client) {
  const row = await client.query("SELECT COUNT(*)::int AS count FROM audit_jobs");
  if (Number(row.rows[0]?.count || 0) > 0 || !fs.existsSync(auditsFile)) {
    return;
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(auditsFile, "utf8"));
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return;
    }

    for (const item of parsed) {
      const result = item?.result || null;
      const timestamp = item.createdAt || nowIso();
      await client.query(`
        INSERT INTO audit_jobs (
          id, input_type, target, chain_id, contract_type, status,
          summary, analysis_mode, error_message, result_json,
          created_at, updated_at, started_at, finished_at,
          attempts, max_attempts, next_attempt_at, worker_id, lease_until, last_heartbeat_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6,
          $7, $8, $9, $10::jsonb,
          $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20
        )
        ON CONFLICT (id) DO NOTHING
      `, [
        item.id || randomUUID(),
        item.inputType || "address",
        item.target || "",
        item.chainId ?? null,
        item.contractType ?? null,
        "succeeded",
        result?.summary || null,
        result?.analysisMode || null,
        null,
        result ? JSON.stringify(result) : null,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
        1,
        DEFAULT_MAX_ATTEMPTS,
        timestamp,
        null,
        null,
        timestamp
      ]);
    }
  } catch {
    // ignore malformed legacy data
  }
}

async function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = withPgClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_jobs (
          id TEXT PRIMARY KEY,
          input_type TEXT NOT NULL,
          target TEXT NOT NULL,
          chain_id INTEGER,
          contract_type TEXT,
          status TEXT NOT NULL,
          summary TEXT,
          analysis_mode TEXT,
          error_message TEXT,
          result_json JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          started_at TIMESTAMPTZ,
          finished_at TIMESTAMPTZ,
          attempts INTEGER NOT NULL DEFAULT 0,
          max_attempts INTEGER NOT NULL DEFAULT 3,
          next_attempt_at TIMESTAMPTZ,
          worker_id TEXT,
          lease_until TIMESTAMPTZ,
          last_heartbeat_at TIMESTAMPTZ,
          progress_json JSONB
        );
        CREATE TABLE IF NOT EXISTS audit_workers (
          worker_id TEXT PRIMARY KEY,
          pid INTEGER,
          status TEXT NOT NULL,
          concurrency INTEGER NOT NULL,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_jobs_created_at ON audit_jobs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_audit_jobs_status ON audit_jobs(status);
        CREATE INDEX IF NOT EXISTS idx_audit_jobs_next_attempt_at ON audit_jobs(next_attempt_at);
        CREATE INDEX IF NOT EXISTS idx_audit_jobs_lease_until ON audit_jobs(lease_until);
        CREATE INDEX IF NOT EXISTS idx_audit_workers_heartbeat_at ON audit_workers(heartbeat_at DESC);
      `);

      await migrateLegacyJsonAuditHistory(client);
      await client.query("ALTER TABLE audit_jobs ADD COLUMN IF NOT EXISTS progress_json JSONB");
    });
  }

  await initializationPromise;
}

export async function createAuditJob(payload) {
  await ensureInitialized();
  const jobId = randomUUID();
  const result = await withPgClient(async (client) => client.query(`
    INSERT INTO audit_jobs (
      id, input_type, target, chain_id, contract_type, status, summary,
      analysis_mode, error_message, result_json, created_at, updated_at,
      started_at, finished_at, attempts, max_attempts, next_attempt_at,
      worker_id, lease_until, last_heartbeat_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'queued', 'Queued for analysis.',
      NULL, NULL, NULL, NOW(), NOW(),
      NULL, NULL, 0, $6, NOW(),
      NULL, NULL, NULL
    )
    RETURNING *
  `, [
    jobId,
    payload.inputType || "address",
    payload.target,
    payload.chainId ?? null,
    payload.contractType ?? null,
    Math.max(1, Number(payload.maxAttempts || DEFAULT_MAX_ATTEMPTS))
  ]));

  return mapAuditJob(result.rows[0]);
}

export async function listAuditRuns(options = {}) {
  await ensureInitialized();
  const limit = Math.max(1, Number(options.limit || DEFAULT_LIST_LIMIT));
  const includeResult = options.includeResult !== false;
  return withPgClient(async (client) => {
    const result = await client.query(`
      SELECT ${includeResult ? "*" : `
        id, input_type, target, chain_id, contract_type, status,
        summary, analysis_mode, error_message, created_at, updated_at,
        started_at, finished_at, attempts, max_attempts, next_attempt_at,
        worker_id, lease_until, last_heartbeat_at, progress_json
      `}
      FROM audit_jobs
      ORDER BY created_at DESC
      LIMIT $1
    `, [limit]);
    return result.rows.map(includeResult ? mapAuditJob : mapAuditJobSummary);
  });
}

export async function getAuditRun(id) {
  await ensureInitialized();
  return withPgClient(async (client) => {
    const result = await client.query("SELECT * FROM audit_jobs WHERE id = $1", [id]);
    return mapAuditJob(result.rows[0]);
  });
}

export async function countActiveAuditJobs() {
  await ensureInitialized();
  return withPgClient(async (client) => {
    const result = await client.query("SELECT COUNT(*)::int AS count FROM audit_jobs WHERE status IN ('queued', 'running')");
    return Number(result.rows[0]?.count || 0);
  });
}

export async function registerWorker(worker) {
  await ensureInitialized();
  await withPgClient(async (client) => {
    await client.query(`
      INSERT INTO audit_workers (worker_id, pid, status, concurrency, started_at, heartbeat_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW(), NOW())
      ON CONFLICT (worker_id) DO UPDATE SET
        pid = EXCLUDED.pid,
        status = EXCLUDED.status,
        concurrency = EXCLUDED.concurrency,
        heartbeat_at = NOW(),
        updated_at = NOW()
    `, [
      worker.workerId,
      worker.pid,
      worker.status || "idle",
      worker.concurrency
    ]);
  });
}

export async function heartbeatWorker(workerId, status = "idle") {
  await ensureInitialized();
  await withPgClient(async (client) => {
    await client.query(`
      UPDATE audit_workers
      SET status = $2, heartbeat_at = NOW(), updated_at = NOW()
      WHERE worker_id = $1
    `, [workerId, status]);
  });
}

export async function unregisterWorker(workerId) {
  await ensureInitialized();
  await withPgClient(async (client) => {
    await client.query("DELETE FROM audit_workers WHERE worker_id = $1", [workerId]);
  });
}

export async function listActiveWorkers() {
  await ensureInitialized();
  const threshold = new Date(Date.now() - WORKER_STALE_AFTER_MS);
  return withPgClient(async (client) => {
    const result = await client.query(`
      SELECT worker_id, pid, status, concurrency, started_at, heartbeat_at, updated_at
      FROM audit_workers
      WHERE heartbeat_at >= $1
      ORDER BY updated_at DESC
    `, [threshold]);

    return result.rows.map((row) => ({
      worker_id: row.worker_id,
      pid: row.pid,
      status: row.status,
      concurrency: row.concurrency,
      started_at: toIso(row.started_at),
      heartbeat_at: toIso(row.heartbeat_at),
      updated_at: toIso(row.updated_at)
    }));
  });
}

export async function cleanupStaleWorkers() {
  await ensureInitialized();
  const threshold = new Date(Date.now() - WORKER_STALE_AFTER_MS);
  await withPgClient(async (client) => {
    await client.query("DELETE FROM audit_workers WHERE heartbeat_at < $1", [threshold]);
  });
}

export async function repairExpiredJobLeases() {
  await ensureInitialized();
  await withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(`
        UPDATE audit_jobs
        SET status = 'failed',
            summary = 'Worker lease expired after max attempts.',
            error_message = 'Worker lease expired after max attempts.',
            updated_at = NOW(),
            worker_id = NULL,
            lease_until = NULL,
            last_heartbeat_at = NULL,
            finished_at = NOW()
        WHERE status = 'running'
          AND lease_until IS NOT NULL
          AND lease_until < NOW()
          AND attempts >= max_attempts
      `);

      await client.query(`
        UPDATE audit_jobs
        SET status = 'queued',
            summary = 'Recovered expired worker lease. Retrying.',
            error_message = 'Recovered expired worker lease.',
            updated_at = NOW(),
            worker_id = NULL,
            lease_until = NULL,
            last_heartbeat_at = NULL,
            next_attempt_at = NOW(),
            finished_at = NULL
        WHERE status = 'running'
          AND lease_until IS NOT NULL
          AND lease_until < NOW()
          AND attempts < max_attempts
      `);

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function claimNextQueuedJob(workerId, leaseMs) {
  await ensureInitialized();
  return withPgClient(async (client) => {
    await client.query("BEGIN");
    try {
      const next = await client.query(`
        SELECT id
        FROM audit_jobs
        WHERE status = 'queued'
          AND COALESCE(next_attempt_at, created_at) <= NOW()
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      `);

      if (next.rowCount === 0) {
        await client.query("COMMIT");
        return null;
      }

      const leaseUntil = new Date(Date.now() + leaseMs);
      const updated = await client.query(`
        UPDATE audit_jobs
        SET status = 'running',
            summary = 'Analysis is running.',
            updated_at = NOW(),
            started_at = COALESCE(started_at, NOW()),
            error_message = NULL,
            worker_id = $1,
            lease_until = $2,
            last_heartbeat_at = NOW(),
            progress_json = NULL,
            attempts = attempts + 1
        WHERE id = $3
          AND status = 'queued'
        RETURNING *
      `, [workerId, leaseUntil, next.rows[0].id]);

      await client.query("COMMIT");
      return mapAuditJob(updated.rows[0]);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function heartbeatRunningJob(id, workerId, leaseMs) {
  await ensureInitialized();
  const leaseUntil = new Date(Date.now() + leaseMs);
  await withPgClient(async (client) => {
    await client.query(`
      UPDATE audit_jobs
      SET lease_until = $3,
          last_heartbeat_at = NOW(),
          updated_at = NOW()
      WHERE id = $1 AND worker_id = $2 AND status = 'running'
    `, [id, workerId, leaseUntil]);
  });
}

export async function updateAuditJobProgress(id, workerId, progress) {
  await ensureInitialized();
  await withPgClient(async (client) => {
    await client.query(`
      UPDATE audit_jobs
      SET progress_json = $3::jsonb,
          updated_at = NOW(),
          last_heartbeat_at = NOW()
      WHERE id = $1 AND worker_id = $2 AND status = 'running'
    `, [id, workerId, JSON.stringify(progress || null)]);
  });
}

export async function markAuditJobSucceeded(id, workerId, result) {
  await ensureInitialized();
  const normalized = stripLargeFields(result);
  return withPgClient(async (client) => {
    const updated = await client.query(`
      UPDATE audit_jobs
      SET status = 'succeeded',
          summary = $3,
          analysis_mode = $4,
          result_json = $5::jsonb,
          progress_json = NULL,
          error_message = NULL,
          updated_at = NOW(),
          finished_at = NOW(),
          worker_id = $2,
          lease_until = NULL,
          last_heartbeat_at = NOW()
      WHERE id = $1 AND worker_id = $2
      RETURNING *
    `, [
      id,
      workerId,
      normalized.summary || "Analysis completed.",
      normalized.analysisMode || null,
      JSON.stringify(normalized)
    ]);

    return mapAuditJob(updated.rows[0]);
  });
}

export async function requeueAuditJob(id, workerId, errorMessage, delayMs = 0) {
  await ensureInitialized();
  const nextAttemptAt = new Date(Date.now() + delayMs);
  return withPgClient(async (client) => {
    const updated = await client.query(`
      UPDATE audit_jobs
      SET status = 'queued',
          summary = 'Retry scheduled after analysis failure.',
          error_message = $3,
          updated_at = NOW(),
          finished_at = NULL,
          worker_id = NULL,
          lease_until = NULL,
        last_heartbeat_at = NULL,
        progress_json = NULL,
        next_attempt_at = $4
      WHERE id = $1 AND worker_id = $2
      RETURNING *
    `, [id, workerId, errorMessage, nextAttemptAt]);

    return mapAuditJob(updated.rows[0]);
  });
}

export async function markAuditJobFailed(id, workerId, errorMessage, status = "failed") {
  await ensureInitialized();
  return withPgClient(async (client) => {
    const updated = await client.query(`
      UPDATE audit_jobs
      SET status = $3,
          summary = $4,
          error_message = $5,
          updated_at = NOW(),
          finished_at = NOW(),
        worker_id = $2,
        lease_until = NULL,
        last_heartbeat_at = NOW(),
        progress_json = NULL
      WHERE id = $1 AND worker_id = $2
      RETURNING *
    `, [
      id,
      workerId,
      status,
      status === "timeout" ? "Analysis timed out." : "Analysis failed.",
      errorMessage
    ]);

    return mapAuditJob(updated.rows[0]);
  });
}

export async function getAuditQueueStats() {
  await cleanupStaleWorkers();
  await repairExpiredJobLeases();

  return withPgClient(async (client) => {
    const counts = await client.query(`
      SELECT status, COUNT(*)::int AS count
      FROM audit_jobs
      GROUP BY status
    `);

    const grouped = Object.fromEntries(
      counts.rows.map((row) => [row.status, Number(row.count || 0)])
    );

    const workers = await listActiveWorkers();
    return {
      queued: grouped.queued || 0,
      running: grouped.running || 0,
      succeeded: grouped.succeeded || 0,
      failed: grouped.failed || 0,
      timeout: grouped.timeout || 0,
      activeJobs: (grouped.queued || 0) + (grouped.running || 0),
      workers: {
        count: workers.length,
        items: workers
      }
    };
  });
}
