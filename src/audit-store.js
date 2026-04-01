import { getStorageDriver } from "./database.js";
import * as localStore from "./audit-store-local.js";
import * as postgresStore from "./audit-store-postgres.js";

function getStore() {
  return getStorageDriver() === "postgres" ? postgresStore : localStore;
}

export function getAuditStorageMode() {
  return getStorageDriver();
}

export async function createAuditJob(payload) {
  return getStore().createAuditJob(payload);
}

export async function listAuditRuns(options = {}) {
  return getStore().listAuditRuns(options);
}

export async function getAuditRun(id) {
  return getStore().getAuditRun(id);
}

export async function countActiveAuditJobs() {
  return getStore().countActiveAuditJobs();
}

export async function registerWorker(worker) {
  return getStore().registerWorker(worker);
}

export async function heartbeatWorker(workerId, status = "idle") {
  return getStore().heartbeatWorker(workerId, status);
}

export async function unregisterWorker(workerId) {
  return getStore().unregisterWorker(workerId);
}

export async function listActiveWorkers() {
  return getStore().listActiveWorkers();
}

export async function cleanupStaleWorkers() {
  return getStore().cleanupStaleWorkers();
}

export async function repairExpiredJobLeases() {
  return getStore().repairExpiredJobLeases();
}

export async function claimNextQueuedJob(workerId, leaseMs) {
  return getStore().claimNextQueuedJob(workerId, leaseMs);
}

export async function heartbeatRunningJob(id, workerId, leaseMs) {
  return getStore().heartbeatRunningJob(id, workerId, leaseMs);
}

export async function markAuditJobSucceeded(id, workerId, result) {
  return getStore().markAuditJobSucceeded(id, workerId, result);
}

export async function requeueAuditJob(id, workerId, errorMessage, delayMs = 0) {
  return getStore().requeueAuditJob(id, workerId, errorMessage, delayMs);
}

export async function markAuditJobFailed(id, workerId, errorMessage, status = "failed") {
  return getStore().markAuditJobFailed(id, workerId, errorMessage, status);
}

export async function getAuditQueueStats() {
  return getStore().getAuditQueueStats();
}
