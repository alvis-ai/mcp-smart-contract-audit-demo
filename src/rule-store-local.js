import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getProjectRoot } from "./knowledge-base.js";

const dataDir = path.join(getProjectRoot(), "data");
const rulesFile = path.join(dataDir, "rules.json");

const severitySchema = z.enum(["critical", "high", "medium", "low"]);
const contractTypeSchema = z.enum(["general", "launchpad", "nft", "staking", "lending"]);
const patternSchema = z.object({
  type: z.enum(["includes", "regex"]),
  value: z.string().min(1),
  flags: z.string().optional().default("")
});

const ruleShape = {
  id: z.string().min(1),
  enabled: z.boolean().default(true),
  severity: severitySchema,
  title: z.string().min(1),
  rationale: z.string().min(1),
  recommendation: z.string().min(1),
  contractTypes: z.array(contractTypeSchema).default([]),
  allPatterns: z.array(patternSchema).default([]),
  anyPatterns: z.array(patternSchema).default([]),
  nonePatterns: z.array(patternSchema).default([])
};

const ruleSchema = z.object(ruleShape).superRefine((rule, context) => {
  if (rule.allPatterns.length === 0 && rule.anyPatterns.length === 0 && rule.nonePatterns.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rule must define at least one matcher in allPatterns, anyPatterns or nonePatterns."
    });
  }
});

export const editableRuleSchema = z.object({
  id: z.string().min(1).optional(),
  enabled: z.boolean().default(true),
  severity: severitySchema,
  title: z.string().min(1),
  rationale: z.string().min(1),
  recommendation: z.string().min(1),
  contractTypes: z.array(contractTypeSchema).default([]),
  allPatterns: z.array(patternSchema).default([]),
  anyPatterns: z.array(patternSchema).default([]),
  nonePatterns: z.array(patternSchema).default([])
}).superRefine((rule, context) => {
  if (rule.allPatterns.length === 0 && rule.anyPatterns.length === 0 && rule.nonePatterns.length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Rule must define at least one matcher in allPatterns, anyPatterns or nonePatterns."
    });
  }
});

function loadDefaultRules() {
  try {
    const parsed = JSON.parse(fs.readFileSync(rulesFile, "utf8"));
    return z.array(ruleSchema).parse(parsed).map((rule) => ruleSchema.parse(rule));
  } catch (error) {
    throw new Error(`Failed to load bundled rules from ${rulesFile}: ${error.message}`);
  }
}

export const defaultRules = loadDefaultRules();

function ensureDataDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function ensureRulesFile() {
  ensureDataDir();
  if (!fs.existsSync(rulesFile)) {
    fs.writeFileSync(rulesFile, `${JSON.stringify(defaultRules, null, 2)}\n`, "utf8");
  }
}

function normalizeRule(rule) {
  return ruleSchema.parse(rule);
}

export function getRules() {
  ensureRulesFile();
  const parsed = JSON.parse(fs.readFileSync(rulesFile, "utf8"));
  return z.array(ruleSchema).parse(parsed).map(normalizeRule);
}

export function saveRules(rules) {
  ensureRulesFile();
  const normalized = z.array(ruleSchema).parse(rules).map(normalizeRule);
  fs.writeFileSync(rulesFile, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
  return normalized;
}

export function createRule(input) {
  const rules = getRules();
  const prepared = editableRuleSchema.parse(input);
  const id = prepared.id || `RULE-${randomUUID()}`;
  if (rules.some((rule) => rule.id === id)) {
    throw new Error(`Rule with id ${id} already exists.`);
  }
  const next = normalizeRule({
    ...prepared,
    id
  });
  return saveRules([...rules, next]).find((rule) => rule.id === id);
}

export function updateRule(id, input) {
  const rules = getRules();
  const prepared = editableRuleSchema.parse({
    ...input,
    id
  });
  const next = normalizeRule(prepared);
  const index = rules.findIndex((rule) => rule.id === id);
  if (index === -1) {
    throw new Error(`Rule with id ${id} does not exist.`);
  }
  rules[index] = next;
  return saveRules(rules)[index];
}

export function deleteRule(id) {
  const rules = getRules();
  const next = rules.filter((rule) => rule.id !== id);
  if (next.length === rules.length) {
    throw new Error(`Rule with id ${id} does not exist.`);
  }
  saveRules(next);
}
