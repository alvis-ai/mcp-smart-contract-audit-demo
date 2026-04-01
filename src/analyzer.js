import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./knowledge-base.js";
import {
  fetchDeployedBytecode,
  fetchVerifiedContractSource
} from "./verified-source.js";
import { getRules } from "./rule-store.js";
import { runExternalAddressAnalyses } from "./external-analyzers.js";

// Domain auto-detection is best-effort only. It exists to choose a more useful
// checklist / finding context when the caller does not provide a contractType.
function detectContractType(code, fallbackType = "") {
  if (fallbackType) {
    return fallbackType;
  }
  const normalized = code.toLowerCase();
  if (normalized.includes("whitelist") || normalized.includes("claim") || normalized.includes("sale")) {
    return "launchpad";
  }
  if (normalized.includes("bid") || normalized.includes("mint") || normalized.includes("tokenuri")) {
    return "nft";
  }
  if (normalized.includes("stake") || normalized.includes("reward")) {
    return "staking";
  }
  if (normalized.includes("borrow") || normalized.includes("collateral") || normalized.includes("liquidat")) {
    return "lending";
  }
  return "general";
}

// The summary is short by design because IDE integrations surface it first and
// full findings are rendered below.
function makeSummary(contractType, findings) {
  const severeCount = findings.filter((item) => item.severity === "critical" || item.severity === "high").length;
  if (findings.length === 0) {
    return `No rule-based findings were triggered. ${contractType} contract still requires manual business-logic review.`;
  }
  return `${contractType} contract audit finished with ${findings.length} findings, including ${severeCount} high-severity items.`;
}

function makeAddressSummary(contractType, findings, externalAnalyses, analysisMode, sourceAvailable) {
  const severeCount = findings.filter((item) => item.severity === "critical" || item.severity === "high").length;
  const externalIssueCount = externalAnalyses
    .filter((analysis) => analysis.status === "ok")
    .reduce((count, analysis) => count + (analysis.issueCount || 0), 0);

  if (sourceAvailable) {
    return `${contractType} contract audit finished in ${analysisMode} mode with ${findings.length} local findings, ${severeCount} high-severity local items, and ${externalIssueCount} external engine issue(s).`;
  }

  return `${contractType} contract audit finished in ${analysisMode} mode without verified source. Local rules were skipped, and external engines reported ${externalIssueCount} issue(s).`;
}

function matchesPattern(code, pattern) {
  if (pattern.type === "includes") {
    return code.includes(pattern.value);
  }

  return new RegExp(pattern.value, pattern.flags || "").test(code);
}

function matchesRule(rule, code, contractType) {
  if (!rule.enabled) {
    return false;
  }

  if (rule.contractTypes.length > 0 && !rule.contractTypes.includes(contractType)) {
    return false;
  }

  const allPass = rule.allPatterns.every((pattern) => matchesPattern(code, pattern));
  const anyPass = rule.anyPatterns.length === 0 || rule.anyPatterns.some((pattern) => matchesPattern(code, pattern));
  const nonePass = rule.nonePatterns.every((pattern) => !matchesPattern(code, pattern));

  return allPass && anyPass && nonePass;
}

export async function auditCode(code, options = {}) {
  // Evaluate every rule against the same source blob, then normalize to a
  // compact structure that works for CLI, custom MCP and SDK MCP outputs.
  const contractType = detectContractType(code, options.contractType);
  const findings = (await getRules())
    .filter((rule) => matchesRule(rule, code, contractType))
    .map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      title: rule.title,
      rationale: rule.rationale,
      recommendation: rule.recommendation
    }));

  return {
    contractType,
    summary: makeSummary(contractType, findings),
    findings
  };
}

export async function auditFile(relativePath, options = {}) {
  // Constrain file access to the project root so MCP callers cannot use the
  // tool to read arbitrary files on the machine.
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(getProjectRoot(), safePath);
  if (!fullPath.startsWith(getProjectRoot())) {
    throw new Error("Path escapes project root.");
  }
  const code = fs.readFileSync(fullPath, "utf8");
  return {
    path: safePath,
    code,
    ...(await auditCode(code, options))
  };
}

export async function auditAddress(address, options = {}) {
  // Address-based audit now supports two parallel evidence sources:
  // 1. verified source code, used for local rules
  // 2. deployed bytecode + optional external engines such as Mythril
  let sourceContract = null;
  let sourceError = "";

  try {
    sourceContract = await fetchVerifiedContractSource(address, options);
  } catch (error) {
    sourceError = error.message;
  }

  let bytecodeContract = null;
  let bytecodeError = "";
  const preferredChainId = sourceContract?.chainId || options.chainId;

  try {
    bytecodeContract = await fetchDeployedBytecode(address, { chainId: preferredChainId });
  } catch (error) {
    bytecodeError = error.message;
  }

  const resolvedChainId = sourceContract?.chainId || bytecodeContract?.chainId || null;
  const resolvedRpcUrl = bytecodeContract?.rpcUrl || null;
  const externalAnalyses = await runExternalAddressAnalyses(address, {
    chainId: resolvedChainId,
    rpcUrl: resolvedRpcUrl,
    sourceCode: sourceContract?.code || "",
    contractName: sourceContract?.contractName || "",
    primarySourcePath: sourceContract?.primarySourcePath || ""
  });

  if (!sourceContract && !bytecodeContract && externalAnalyses.every((analysis) => analysis.status !== "ok")) {
    throw new Error(sourceError || bytecodeError || "Unable to audit the contract address with either source-based or bytecode-based analysis.");
  }

  const localAudit = sourceContract
    ? await auditCode(sourceContract.code, options)
    : {
        contractType: options.contractType || "general",
        findings: []
      };

  const analysisMode = sourceContract
    ? (bytecodeContract ? "source-and-bytecode" : "source-only")
    : "bytecode-only";

  return {
    ...(sourceContract || {
      address,
      chainId: bytecodeContract?.chainId || null,
      chainName: bytecodeContract?.chainName || "unknown",
      sourceRepository: null,
      sourceFiles: [],
      missingSourceFiles: [],
      matchType: "bytecode-only"
    }),
    ...(bytecodeContract ? {
      bytecodeSize: bytecodeContract.bytecodeSize,
      bytecodeHash: bytecodeContract.bytecodeHash,
      bytecodeProvider: bytecodeContract.provider
    } : {}),
    contractType: localAudit.contractType,
    findings: localAudit.findings,
    externalAnalyses,
    analysisMode,
    hasVerifiedSource: Boolean(sourceContract),
    sourceFetchError: sourceError || null,
    bytecodeFetchError: bytecodeError || null,
    summary: makeAddressSummary(
      localAudit.contractType,
      localAudit.findings,
      externalAnalyses,
      analysisMode,
      Boolean(sourceContract)
    )
  };
}

export function generateChecklist(projectType) {
  // Checklist generation is deliberately opinionated: the base section stays
  // stable while domain sections add review items for common protocol classes.
  const base = [
    "Confirm admin-only functions use explicit access control.",
    "Review signature flows for nonce, deadline and replay protection.",
    "Check external-call order and reentrancy protections.",
    "Confirm critical state changes emit events.",
    "Inspect storage writes and repeated reads for gas waste."
  ];

  const domain = {
    launchpad: [
      "Verify allocation, refund and claim paths are mutually exclusive.",
      "Review whitelist and purchase limits for duplicate participation."
    ],
    nft: [
      "Review mint quota, whitelist mint and auction settlement logic.",
      "Confirm royalty and fee distributions are precise and access-controlled."
    ],
    staking: [
      "Validate reward accrual formula and emergency withdraw behavior.",
      "Review pause and admin parameter updates."
    ],
    lending: [
      "Validate collateral ratio, liquidation thresholds and debt accounting.",
      "Review oracle and admin control surfaces."
    ]
  };

  return [...base, ...(domain[projectType] || [])];
}
