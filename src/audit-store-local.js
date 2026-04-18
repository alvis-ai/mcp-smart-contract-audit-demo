import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { normalizeAuditResult } from "./analyzer.js";
import { getProjectRoot } from "./knowledge-base.js";

const dataDir = path.join(getProjectRoot(), "data");
const auditsFile = path.join(dataDir, "audits.json");
const databaseFile = path.join(dataDir, "audit-jobs.db");
const DEFAULT_LIST_LIMIT = 200;
const DEFAULT_MAX_ATTEMPTS = Math.max(1, Number(process.env.AUDIT_MAX_ATTEMPTS || 3));
const WORKER_STALE_AFTER_MS = Math.max(5000, Number(process.env.AUDIT_WORKER_STALE_AFTER_MS || 30000));

let database;

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function stripLargeFields(result) {
  const {
    code,
    ...rest
  } = result || {};

  return {
    ...rest,
    codeSize: typeof code === "string" ? code.length : 0
  };
}

function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  if (!columns.some((column) => column.name === columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function getDatabase() {
  if (database) {
    return database;
  }

  ensureDataDir();
  database = new DatabaseSync(databaseFile);
  database.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
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
      result_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      finished_at TEXT
    );
    CREATE TABLE IF NOT EXISTS audit_workers (
      worker_id TEXT PRIMARY KEY,
      pid INTEGER,
      status TEXT NOT NULL,
      concurrency INTEGER NOT NULL,
      started_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_jobs_created_at ON audit_jobs(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_jobs_status ON audit_jobs(status);
  `);

  ensureColumn(database, "audit_jobs", "attempts", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(database, "audit_jobs", "max_attempts", "INTEGER NOT NULL DEFAULT 3");
  ensureColumn(database, "audit_jobs", "next_attempt_at", "TEXT");
  ensureColumn(database, "audit_jobs", "worker_id", "TEXT");
  ensureColumn(database, "audit_jobs", "lease_until", "TEXT");
  ensureColumn(database, "audit_jobs", "last_heartbeat_at", "TEXT");

  migrateLegacyJsonAuditHistory(database);
  return database;
}

function migrateLegacyJsonAuditHistory(db) {
  const migratedKey = db.prepare("PRAGMA user_version").get();
  if (Number(migratedKey?.user_version || 0) >= 2) {
    return;
  }

  if (fs.existsSync(auditsFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(auditsFile, "utf8"));
      if (Array.isArray(parsed)) {
        const insert = db.prepare(`
          INSERT OR IGNORE INTO audit_jobs (
            id, input_type, target, chain_id, contract_type, status,
            summary, analysis_mode, error_message, result_json,
            created_at, updated_at, started_at, finished_at,
            attempts, max_attempts, next_attempt_at, worker_id, lease_until, last_heartbeat_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          )
        `);

        for (const item of parsed) {
          const result = item?.result || null;
          const timestamp = item.createdAt || nowIso();
          insert.run(
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
          );
        }
      }
    } catch {
      // ignore migration failure and continue with the sqlite store
    }
  }

  db.exec("PRAGMA user_version = 2");
}

function mapAuditJob(row) {
  if (!row) {
    return null;
  }

  const normalizedResult = normalizeAuditResult(row.result_json ? JSON.parse(row.result_json) : null, {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    workerId: row.worker_id,
    leaseUntil: row.lease_until,
    lastHeartbeatAt: row.last_heartbeat_at,
    result: normalizedResult
  };
}

export function createAuditJob(payload) {
  const db = getDatabase();
  const now = nowIso();
  const job = {
    id: randomUUID(),
    inputType: payload.inputType || "address",
    target: payload.target,
    chainId: payload.chainId ?? null,
    contractType: payload.contractType ?? null,
    status: "queued",
    summary: "Queued for analysis.",
    analysisMode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
    attempts: 0,
    maxAttempts: Math.max(1, Number(payload.maxAttempts || DEFAULT_MAX_ATTEMPTS)),
    nextAttemptAt: now,
    workerId: null,
    leaseUntil: null,
    lastHeartbeatAt: null,
    result: null
  };

  db.prepare(`
    INSERT INTO audit_jobs (
      id, input_type, target, chain_id, contract_type, status, summary,
      analysis_mode, error_message, result_json, created_at, updated_at,
      started_at, finished_at, attempts, max_attempts, next_attempt_at,
      worker_id, lease_until, last_heartbeat_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    job.id,
    job.inputType,
    job.target,
    job.chainId,
    job.contractType,
    job.status,
    job.summary,
    job.analysisMode,
    job.errorMessage,
    null,
    job.createdAt,
    job.updatedAt,
    job.startedAt,
    job.finishedAt,
    job.attempts,
    job.maxAttempts,
    job.nextAttemptAt,
    job.workerId,
    job.leaseUntil,
    job.lastHeartbeatAt
  );

  return job;
}

export function listAuditRuns(options = {}) {
  const db = getDatabase();
  const limit = Math.max(1, Number(options.limit || DEFAULT_LIST_LIMIT));
  return db.prepare(`
    SELECT * FROM audit_jobs
    ORDER BY datetime(created_at) DESC
    LIMIT ?
  `).all(limit).map(mapAuditJob);
}

export function getAuditRun(id) {
  const db = getDatabase();
  return mapAuditJob(db.prepare("SELECT * FROM audit_jobs WHERE id = ?").get(id));
}

export function countActiveAuditJobs() {
  const db = getDatabase();
  const row = db.prepare("SELECT COUNT(*) AS count FROM audit_jobs WHERE status IN ('queued', 'running')").get();
  return Number(row?.count || 0);
}

export function registerWorker(worker) {
  const db = getDatabase();
  const now = nowIso();
  db.prepare(`
    INSERT INTO audit_workers (worker_id, pid, status, concurrency, started_at, heartbeat_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(worker_id) DO UPDATE SET
      pid = excluded.pid,
      status = excluded.status,
      concurrency = excluded.concurrency,
      heartbeat_at = excluded.heartbeat_at,
      updated_at = excluded.updated_at
  `).run(
    worker.workerId,
    worker.pid,
    worker.status || "idle",
    worker.concurrency,
    now,
    now,
    now
  );
}

export function heartbeatWorker(workerId, status = "idle") {
  const db = getDatabase();
  const now = nowIso();
  db.prepare(`
    UPDATE audit_workers
    SET status = ?, heartbeat_at = ?, updated_at = ?
    WHERE worker_id = ?
  `).run(status, now, now, workerId);
}

export function unregisterWorker(workerId) {
  const db = getDatabase();
  db.prepare("DELETE FROM audit_workers WHERE worker_id = ?").run(workerId);
}

export function listActiveWorkers() {
  const db = getDatabase();
  const threshold = new Date(Date.now() - WORKER_STALE_AFTER_MS).toISOString();
  return db.prepare(`
    SELECT worker_id, pid, status, concurrency, started_at, heartbeat_at, updated_at
    FROM audit_workers
    WHERE datetime(heartbeat_at) >= datetime(?)
    ORDER BY datetime(updated_at) DESC
  `).all(threshold);
}

export function cleanupStaleWorkers() {
  const db = getDatabase();
  const threshold = new Date(Date.now() - WORKER_STALE_AFTER_MS).toISOString();
  db.prepare("DELETE FROM audit_workers WHERE datetime(heartbeat_at) < datetime(?)").run(threshold);
}

export function repairExpiredJobLeases() {
  const db = getDatabase();
  const now = nowIso();
  db.exec("BEGIN IMMEDIATE");
  try {
    const expired = db.prepare(`
      SELECT id, attempts, max_attempts
      FROM audit_jobs
      WHERE status = 'running'
        AND lease_until IS NOT NULL
        AND datetime(lease_until) < datetime(?)
    `).all(now);

    const requeue = db.prepare(`
      UPDATE audit_jobs
      SET status = 'queued',
          summary = 'Recovered expired worker lease. Retrying.',
          error_message = 'Recovered expired worker lease.',
          updated_at = ?,
          worker_id = NULL,
          lease_until = NULL,
          last_heartbeat_at = NULL,
          next_attempt_at = ?,
          finished_at = NULL
      WHERE id = ?
    `);

    const fail = db.prepare(`
      UPDATE audit_jobs
      SET status = 'failed',
          summary = 'Worker lease expired after max attempts.',
          error_message = 'Worker lease expired after max attempts.',
          updated_at = ?,
          worker_id = NULL,
          lease_until = NULL,
          last_heartbeat_at = NULL,
          finished_at = ?
      WHERE id = ?
    `);

    for (const job of expired) {
      if (Number(job.attempts || 0) >= Number(job.max_attempts || DEFAULT_MAX_ATTEMPTS)) {
        fail.run(now, now, job.id);
      } else {
        requeue.run(now, now, job.id);
      }
    }

    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function claimNextQueuedJob(workerId, leaseMs) {
  const db = getDatabase();
  const now = nowIso();
  const leaseUntil = new Date(Date.now() + leaseMs).toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    const next = db.prepare(`
      SELECT id
      FROM audit_jobs
      WHERE status = 'queued'
        AND datetime(COALESCE(next_attempt_at, created_at)) <= datetime(?)
      ORDER BY datetime(created_at) ASC
      LIMIT 1
    `).get(now);

    if (!next?.id) {
      db.exec("COMMIT");
      return null;
    }

    db.prepare(`
      UPDATE audit_jobs
      SET status = 'running',
          summary = 'Analysis is running.',
          updated_at = ?,
          started_at = COALESCE(started_at, ?),
          error_message = NULL,
          worker_id = ?,
          lease_until = ?,
          last_heartbeat_at = ?,
          attempts = attempts + 1
      WHERE id = ?
        AND status = 'queued'
    `).run(now, now, workerId, leaseUntil, now, next.id);

    db.exec("COMMIT");
    return getAuditRun(next.id);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function heartbeatRunningJob(id, workerId, leaseMs) {
  const db = getDatabase();
  const now = nowIso();
  const leaseUntil = new Date(Date.now() + leaseMs).toISOString();
  db.prepare(`
    UPDATE audit_jobs
    SET lease_until = ?, last_heartbeat_at = ?, updated_at = ?
    WHERE id = ? AND worker_id = ? AND status = 'running'
  `).run(leaseUntil, now, now, id, workerId);
}

export function markAuditJobSucceeded(id, workerId, result) {
  const db = getDatabase();
  const now = nowIso();
  const normalized = stripLargeFields(result);
  db.prepare(`
    UPDATE audit_jobs
    SET status = 'succeeded',
        summary = ?,
        analysis_mode = ?,
        result_json = ?,
        error_message = NULL,
        updated_at = ?,
        finished_at = ?,
        worker_id = ?,
        lease_until = NULL,
        last_heartbeat_at = ?
    WHERE id = ? AND worker_id = ?
  `).run(
    normalized.summary || "Analysis completed.",
    normalized.analysisMode || null,
    JSON.stringify(normalized),
    now,
    now,
    workerId,
    now,
    id,
    workerId
  );
  return getAuditRun(id);
}

export function requeueAuditJob(id, workerId, errorMessage, delayMs = 0) {
  const db = getDatabase();
  const now = nowIso();
  const nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
  db.prepare(`
    UPDATE audit_jobs
    SET status = 'queued',
        summary = 'Retry scheduled after analysis failure.',
        error_message = ?,
        updated_at = ?,
        finished_at = NULL,
        worker_id = NULL,
        lease_until = NULL,
        last_heartbeat_at = NULL,
        next_attempt_at = ?
    WHERE id = ? AND worker_id = ?
  `).run(errorMessage, now, nextAttemptAt, id, workerId);
  return getAuditRun(id);
}

export function markAuditJobFailed(id, workerId, errorMessage, status = "failed") {
  const db = getDatabase();
  const now = nowIso();
  db.prepare(`
    UPDATE audit_jobs
    SET status = ?,
        summary = ?,
        error_message = ?,
        updated_at = ?,
        finished_at = ?,
        worker_id = ?,
        lease_until = NULL,
        last_heartbeat_at = ?
    WHERE id = ? AND worker_id = ?
  `).run(
    status,
    status === "timeout" ? "Analysis timed out." : "Analysis failed.",
    errorMessage,
    now,
    now,
    workerId,
    now,
    id,
    workerId
  );
  return getAuditRun(id);
}

export function getAuditQueueStats() {
  const db = getDatabase();
  cleanupStaleWorkers();
  repairExpiredJobLeases();

  const counts = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM audit_jobs
    GROUP BY status
  `).all();

  const grouped = Object.fromEntries(
    counts.map((row) => [row.status, Number(row.count || 0)])
  );

  const workers = listActiveWorkers();
  return {
    queued: grouped.queued || 0,
    running: grouped.running || 0,
    succeeded: grouped.succeeded || 0,
    failed: grouped.failed || 0,
    timeout: grouped.timeout || 0,
    activeJobs: countActiveAuditJobs(),
    workers: {
      count: workers.length,
      items: workers
    }
  };
}
