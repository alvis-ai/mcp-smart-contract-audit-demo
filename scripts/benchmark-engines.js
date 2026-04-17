import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditFile } from "../src/analyzer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const benchmarkFile = path.join(projectRoot, "data", "benchmark-cases.json");

function loadCases() {
  return JSON.parse(fs.readFileSync(benchmarkFile, "utf8"));
}

async function runCase(testCase) {
  if (testCase.kind !== "file") {
    throw new Error(`Unsupported benchmark kind: ${testCase.kind}`);
  }

  const result = await auditFile(testCase.path, {
    contractType: testCase.contractType
  });
  const analysis = (result.externalAnalyses || []).find((item) => item.engine === testCase.requiredEngine);

  if (!analysis) {
    throw new Error(`${testCase.id}: engine ${testCase.requiredEngine} did not run.`);
  }

  if (analysis.status !== "ok") {
    throw new Error(`${testCase.id}: engine ${testCase.requiredEngine} status is ${analysis.status}. ${analysis.summary}`);
  }

  if ((analysis.issueCount || 0) < testCase.minIssueCount) {
    throw new Error(`${testCase.id}: expected at least ${testCase.minIssueCount} issue(s), got ${analysis.issueCount || 0}.`);
  }

  return {
    id: testCase.id,
    engine: analysis.engine,
    issueCount: analysis.issueCount || 0,
    summary: result.summary
  };
}

async function main() {
  const cases = loadCases();
  const results = [];

  for (const testCase of cases) {
    const result = await runCase(testCase);
    results.push(result);
    process.stdout.write(`PASS ${result.id}: ${result.engine} -> ${result.issueCount} issue(s)\n`);
  }

  process.stdout.write(`\nValidated ${results.length} benchmark case(s).\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
