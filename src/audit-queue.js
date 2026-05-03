import os from "node:os";
import { randomUUID } from "node:crypto";
import { auditAddress } from "./analyzer.js";
import {
  claimNextQueuedJob,
  countActiveAuditJobs,
  createAuditJob,
  getAuditQueueStats as auditStoreGetAuditQueueStats,
  heartbeatRunningJob,
  heartbeatWorker,
  markAuditJobFailed,
  markAuditJobSucceeded,
  registerWorker,
  requeueAuditJob,
  repairExpiredJobLeases,
  updateAuditJobProgress,
  unregisterWorker
} from "./audit-store.js";

const WORKER_CONCURRENCY = Math.max(1, Number(process.env.AUDIT_WORKER_CONCURRENCY || 1));
const MAX_PENDING_JOBS = Math.max(1, Number(process.env.AUDIT_MAX_PENDING_JOBS || 50));
const JOB_TIMEOUT_MS = Math.max(1000, Number(process.env.AUDIT_JOB_TIMEOUT_MS || 180000));
const JOB_LEASE_MS = Math.max(JOB_TIMEOUT_MS + 30000, Number(process.env.AUDIT_JOB_LEASE_MS || (JOB_TIMEOUT_MS + 30000)));
const RETRY_DELAY_MS = Math.max(1000, Number(process.env.AUDIT_RETRY_DELAY_MS || 15000));
const WORKER_POLL_MS = Math.max(250, Number(process.env.AUDIT_WORKER_POLL_MS || 1500));
const WORKER_HEARTBEAT_MS = Math.max(1000, Number(process.env.AUDIT_WORKER_HEARTBEAT_MS || 5000));

function logEvent(event, payload = {}) {
  process.stdout.write(`${JSON.stringify({
    ts: new Date().toISOString(),
    service: "audit-worker",
    event,
    ...payload
  })}\n`);
}

function withTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Analysis exceeded timeout (${timeoutMs} ms).`));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isRetryableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return [
    "timeout",
    "request failed",
    "http 429",
    "http 500",
    "http 502",
    "http 503",
    "http 504",
    "eof",
    "network",
    "rate limit",
    "too many requests"
  ].some((fragment) => message.includes(fragment));
}

function createProgressTracker(job, workerId) {
  const startedAt = new Date().toISOString();
  const stages = new Map();
  const stageOrder = [
    "source_fetch",
    "cache_check",
    "bytecode_fetch",
    "tool_analysis",
    "ai_source_review",
    "ai_final_report",
    "ai_translation",
    "knowledge_store"
  ];

  const snapshot = (currentStage = "") => ({
    currentStage,
    startedAt,
    updatedAt: new Date().toISOString(),
    stages: stageOrder
      .filter((id) => stages.has(id))
      .map((id) => stages.get(id))
  });

  return async function onProgress(event = {}) {
    const id = event.stage;
    if (!id) {
      return;
    }
    const now = new Date();
    const previous = stages.get(id) || {
      id,
      status: "pending",
      startedAt: null,
      finishedAt: null,
      durationMs: null,
      detail: ""
    };
    const next = {
      ...previous,
      status: event.status || previous.status,
      detail: event.detail || previous.detail || ""
    };
    if (event.status === "running" && !next.startedAt) {
      next.startedAt = now.toISOString();
    }
    if (["completed", "failed", "skipped"].includes(event.status)) {
      next.finishedAt = now.toISOString();
      if (next.startedAt) {
        next.durationMs = now.getTime() - new Date(next.startedAt).getTime();
      }
    }
    if (event.durationMs != null) {
      next.durationMs = event.durationMs;
    }
    stages.set(id, next);
    await updateAuditJobProgress(job.id, workerId, snapshot(id)).catch(() => {});
  };
}

export async function enqueueAddressAuditJob(payload) {
  if ((await countActiveAuditJobs()) >= MAX_PENDING_JOBS) {
    throw new Error(`Audit queue is full (${MAX_PENDING_JOBS} active jobs). Try again later.`);
  }

  return createAuditJob({
    inputType: "address",
    target: payload.address,
    chainId: payload.chainId ?? null,
    contractType: payload.contractType ?? null
  });
}

export async function getAuditQueueStats() {
  return auditStoreGetAuditQueueStats();
}

async function processJob(workerId, job) {
  const startedAt = Date.now();
  const onProgress = createProgressTracker(job, workerId);
  logEvent("job_started", {
    jobId: job.id,
    target: job.target,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts
  });

  try {
    await onProgress({ stage: "source_fetch", status: "running", detail: "Starting verified source resolution." });
    const result = await withTimeout(auditAddress(job.target, {
      chainId: job.chainId ?? undefined,
      contractType: job.contractType ?? undefined,
      onProgress
    }), JOB_TIMEOUT_MS);
    await markAuditJobSucceeded(job.id, workerId, result);
    logEvent("job_succeeded", {
      jobId: job.id,
      target: job.target,
      analysisMode: result.analysisMode || null,
      cache: result.cache?.status || "none",
      ai: result.ai?.status || "none",
      durationMs: Date.now() - startedAt,
      analyzers: (result.externalAnalyses || []).map((analysis) => ({
        engine: analysis.engine || "engine",
        status: analysis.status || "",
        durationMs: analysis.durationMs ?? null
      }))
    });
  } catch (error) {
    const canRetry = isRetryableError(error) && Number(job.attempts || 0) < Number(job.maxAttempts || 1);
    if (canRetry) {
      const delayMs = RETRY_DELAY_MS * Math.max(1, Number(job.attempts || 1));
      await requeueAuditJob(job.id, workerId, error.message, delayMs);
      logEvent("job_requeued", {
        jobId: job.id,
        target: job.target,
        attempts: job.attempts,
        retryDelayMs: delayMs,
        durationMs: Date.now() - startedAt,
        error: error.message
      });
      return;
    }

    const status = String(error.message || "").toLowerCase().includes("timeout") ? "timeout" : "failed";
    await markAuditJobFailed(job.id, workerId, error.message, status);
    logEvent("job_failed", {
      jobId: job.id,
      target: job.target,
      status,
      durationMs: Date.now() - startedAt,
      error: error.message
    });
  }
}

export async function runAuditWorker(options = {}) {
  const workerId = options.workerId || process.env.AUDIT_WORKER_ID || `worker-${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
  const concurrency = Math.max(1, Number(options.concurrency || WORKER_CONCURRENCY));
  const pollMs = Math.max(250, Number(options.pollMs || WORKER_POLL_MS));
  const once = Boolean(options.once);
  const inFlight = new Map();
  let stopping = false;

  const updateHeartbeat = () => {
    const tasks = [heartbeatWorker(workerId, inFlight.size > 0 ? "busy" : "idle")];
    for (const jobId of inFlight.keys()) {
      tasks.push(heartbeatRunningJob(jobId, workerId, JOB_LEASE_MS));
    }
    return Promise.all(tasks);
  };

  const stop = () => {
    stopping = true;
  };

  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await repairExpiredJobLeases();
  await registerWorker({
    workerId,
    pid: process.pid,
    concurrency,
    status: "idle"
  });

  logEvent("worker_started", {
    workerId,
    concurrency,
    pollMs,
    jobTimeoutMs: JOB_TIMEOUT_MS,
    jobLeaseMs: JOB_LEASE_MS
  });

  try {
    while (!stopping) {
      await updateHeartbeat();

      while (inFlight.size < concurrency) {
        const claimed = await claimNextQueuedJob(workerId, JOB_LEASE_MS);
        if (!claimed) {
          break;
        }

        const task = processJob(workerId, claimed)
          .catch((error) => {
            logEvent("worker_process_error", { workerId, error: error.message });
          })
          .finally(() => {
            inFlight.delete(claimed.id);
          });

        inFlight.set(claimed.id, task);
      }

      if (once && inFlight.size === 0) {
        const stats = await getAuditQueueStats();
        if (stats.queued === 0 && stats.running === 0) {
          break;
        }
      }

      if (inFlight.size === 0) {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      } else {
        await Promise.race([
          Promise.allSettled([...inFlight.values()]),
          new Promise((resolve) => setTimeout(resolve, WORKER_HEARTBEAT_MS))
        ]);
      }
    }

    await Promise.allSettled([...inFlight.values()]);
  } finally {
    await unregisterWorker(workerId);
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
    logEvent("worker_stopped", { workerId });
  }
}
