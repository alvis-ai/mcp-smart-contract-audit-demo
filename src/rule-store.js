import { getStorageDriver } from "./database.js";
import * as localStore from "./rule-store-local.js";
import * as postgresStore from "./rule-store-postgres.js";

export const editableRuleSchema = localStore.editableRuleSchema;
export const defaultRules = localStore.defaultRules;

function getStore() {
  return getStorageDriver() === "postgres" ? postgresStore : localStore;
}

export function getRuleStorageMode() {
  return getStorageDriver();
}

export async function getRules() {
  return getStore().getRules();
}

export async function saveRules(rules) {
  if (getStorageDriver() === "postgres") {
    throw new Error("saveRules is not supported in PostgreSQL mode. Use createRule/updateRule/deleteRule.");
  }
  return localStore.saveRules(rules);
}

export async function createRule(input) {
  return getStore().createRule(input);
}

export async function updateRule(id, input) {
  return getStore().updateRule(id, input);
}

export async function deleteRule(id) {
  return getStore().deleteRule(id);
}
