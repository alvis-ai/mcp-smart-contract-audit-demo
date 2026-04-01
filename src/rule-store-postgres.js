import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { editableRuleSchema, defaultRules } from "./rule-store-local.js";
import { withPgClient } from "./database.js";
import { getProjectRoot } from "./knowledge-base.js";

const dataDir = path.join(getProjectRoot(), "data");
const rulesFile = path.join(dataDir, "rules.json");

let initializationPromise;

function normalizeRule(rule) {
  return editableRuleSchema.parse({
    ...rule,
    id: rule.id
  });
}

function mapRuleRow(row) {
  if (!row) {
    return null;
  }

  return normalizeRule({
    id: row.id,
    enabled: row.enabled,
    severity: row.severity,
    title: row.title,
    rationale: row.rationale,
    recommendation: row.recommendation,
    contractTypes: row.contract_types || [],
    allPatterns: row.all_patterns || [],
    anyPatterns: row.any_patterns || [],
    nonePatterns: row.none_patterns || []
  });
}

async function seedRules(client) {
  const existing = await client.query("SELECT COUNT(*)::int AS count FROM audit_rules");
  if (Number(existing.rows[0]?.count || 0) > 0) {
    return;
  }

  let sourceRules = defaultRules;
  if (fs.existsSync(rulesFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(rulesFile, "utf8"));
      if (Array.isArray(parsed) && parsed.length > 0) {
        sourceRules = parsed;
      }
    } catch {
      // ignore malformed local bootstrap data and fall back to built-in rules
    }
  }

  for (const rule of sourceRules) {
    const normalized = normalizeRule(rule);
    await client.query(`
      INSERT INTO audit_rules (
        id, enabled, severity, title, rationale, recommendation,
        contract_types, all_patterns, any_patterns, none_patterns,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
        NOW(), NOW()
      )
      ON CONFLICT (id) DO NOTHING
    `, [
      normalized.id,
      normalized.enabled,
      normalized.severity,
      normalized.title,
      normalized.rationale,
      normalized.recommendation,
      JSON.stringify(normalized.contractTypes),
      JSON.stringify(normalized.allPatterns),
      JSON.stringify(normalized.anyPatterns),
      JSON.stringify(normalized.nonePatterns)
    ]);
  }
}

async function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = withPgClient(async (client) => {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_rules (
          id TEXT PRIMARY KEY,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          rationale TEXT NOT NULL,
          recommendation TEXT NOT NULL,
          contract_types JSONB NOT NULL DEFAULT '[]'::jsonb,
          all_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
          any_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
          none_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_audit_rules_enabled ON audit_rules(enabled);
        CREATE INDEX IF NOT EXISTS idx_audit_rules_updated_at ON audit_rules(updated_at DESC);
      `);

      await seedRules(client);
    });
  }

  await initializationPromise;
}

export async function getRules() {
  await ensureInitialized();
  return withPgClient(async (client) => {
    const result = await client.query(`
      SELECT *
      FROM audit_rules
      ORDER BY created_at ASC, id ASC
    `);
    return result.rows.map(mapRuleRow);
  });
}

export async function createRule(input) {
  await ensureInitialized();
  const prepared = editableRuleSchema.parse(input);
  const id = prepared.id || `RULE-${randomUUID()}`;
  const normalized = normalizeRule({
    ...prepared,
    id
  });

  return withPgClient(async (client) => {
    const existing = await client.query("SELECT 1 FROM audit_rules WHERE id = $1", [id]);
    if (existing.rowCount > 0) {
      throw new Error(`Rule with id ${id} already exists.`);
    }

    const result = await client.query(`
      INSERT INTO audit_rules (
        id, enabled, severity, title, rationale, recommendation,
        contract_types, all_patterns, any_patterns, none_patterns,
        created_at, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6,
        $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb,
        NOW(), NOW()
      )
      RETURNING *
    `, [
      normalized.id,
      normalized.enabled,
      normalized.severity,
      normalized.title,
      normalized.rationale,
      normalized.recommendation,
      JSON.stringify(normalized.contractTypes),
      JSON.stringify(normalized.allPatterns),
      JSON.stringify(normalized.anyPatterns),
      JSON.stringify(normalized.nonePatterns)
    ]);

    return mapRuleRow(result.rows[0]);
  });
}

export async function updateRule(id, input) {
  await ensureInitialized();
  const normalized = normalizeRule({
    ...editableRuleSchema.parse({
      ...input,
      id
    }),
    id
  });

  return withPgClient(async (client) => {
    const result = await client.query(`
      UPDATE audit_rules
      SET enabled = $2,
          severity = $3,
          title = $4,
          rationale = $5,
          recommendation = $6,
          contract_types = $7::jsonb,
          all_patterns = $8::jsonb,
          any_patterns = $9::jsonb,
          none_patterns = $10::jsonb,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [
      id,
      normalized.enabled,
      normalized.severity,
      normalized.title,
      normalized.rationale,
      normalized.recommendation,
      JSON.stringify(normalized.contractTypes),
      JSON.stringify(normalized.allPatterns),
      JSON.stringify(normalized.anyPatterns),
      JSON.stringify(normalized.nonePatterns)
    ]);

    if (result.rowCount === 0) {
      throw new Error(`Rule with id ${id} does not exist.`);
    }

    return mapRuleRow(result.rows[0]);
  });
}

export async function deleteRule(id) {
  await ensureInitialized();
  await withPgClient(async (client) => {
    const result = await client.query("DELETE FROM audit_rules WHERE id = $1", [id]);
    if (result.rowCount === 0) {
      throw new Error(`Rule with id ${id} does not exist.`);
    }
  });
}
