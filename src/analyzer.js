import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./knowledge-base.js";
import {
  fetchDeployedBytecode,
  fetchVerifiedContractSource
} from "./verified-source.js";
import {
  runExternalAddressAnalyses,
  runExternalSourceAnalyses
} from "./external-analyzers.js";

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

function countSevere(findings) {
  return findings.filter((item) => item.severity === "critical" || item.severity === "high").length;
}

function countExternalIssues(externalAnalyses) {
  return externalAnalyses
    .filter((analysis) => analysis.status === "ok")
    .reduce((count, analysis) => count + (analysis.issueCount || 0), 0);
}

function collectDetectedFindings(externalAnalyses) {
  return externalAnalyses.flatMap((analysis) => (analysis.issues || []).map((issue, index) => ({
    id: `${analysis.engine || "engine"}-${issue.swcId || issue.functionName || issue.pc || index}`,
    severity: issue.severity || "info",
    title: issue.title || "Unnamed issue",
    rationale: issue.description || analysis.summary || "The external analyzer reported this issue without additional detail.",
    recommendation: "Review the affected path, confirm exploitability manually, and patch the underlying contract logic before deployment.",
    engine: analysis.engine || "engine",
    engineTitle: analysis.title || analysis.engine || "External analysis",
    swcId: issue.swcId || "",
    functionName: issue.functionName || "",
    pc: typeof issue.pc === "number" ? issue.pc : null
  })));
}

// The summary is short by design because IDE integrations surface it first and
// full findings are rendered below.
function makeSummary(contractType, findings, externalAnalyses, analysisMode, sourceAvailable) {
  const severeCount = countSevere(findings);
  const externalIssueCount = countExternalIssues(externalAnalyses);
  const availableEngineCount = externalAnalyses.filter((analysis) => analysis.status === "ok").length;

  if (availableEngineCount === 0) {
    return `${contractType} contract analysis could not run any third-party engine in ${analysisMode} mode. Check Slither/Mythril configuration before trusting the result.`;
  }

  if (findings.length === 0) {
    return `${contractType} contract analysis completed in ${analysisMode} mode${sourceAvailable ? " with verified source" : ""}. Third-party engines reported no issues, but manual review is still required.`;
  }

  return `${contractType} contract analysis completed in ${analysisMode} mode with ${externalIssueCount} issue(s), including ${severeCount} high-severity item(s), from ${availableEngineCount} third-party engine(s).`;
}

export async function auditCode(code, options = {}) {
  // Source-code audit is intentionally delegated to third-party analyzers so
  // the demo moves closer to real static-analysis workflows.
  const contractType = detectContractType(code, options.contractType);
  const externalAnalyses = await runExternalSourceAnalyses({
    sourceCode: code,
    contractName: options.contractName || "",
    primarySourcePath: options.primarySourcePath || ""
  });
  const findings = collectDetectedFindings(externalAnalyses);

  return {
    contractType,
    summary: makeSummary(contractType, findings, externalAnalyses, "source-static", true),
    findings,
    externalAnalyses,
    analysisMode: "source-static",
    hasVerifiedSource: true
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
    ...(await auditCode(code, {
      ...options,
      contractName: path.basename(safePath, path.extname(safePath)),
      primarySourcePath: safePath
    }))
  };
}

export async function auditAddress(address, options = {}) {
  // Address-based audit now supports two parallel evidence sources:
  // 1. verified source code, passed to source analyzers such as Slither
  // 2. deployed bytecode + optional bytecode analyzers such as Mythril
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
  const analysisAddress = sourceContract?.sourceAddress || sourceContract?.implementationAddress || address;

  try {
    bytecodeContract = await fetchDeployedBytecode(analysisAddress, { chainId: preferredChainId });
  } catch (error) {
    bytecodeError = error.message;
  }

  const resolvedChainId = sourceContract?.chainId || bytecodeContract?.chainId || null;
  const resolvedRpcUrl = bytecodeContract?.rpcUrl || null;
  const externalAnalyses = await runExternalAddressAnalyses(analysisAddress, {
    chainId: resolvedChainId,
    rpcUrl: resolvedRpcUrl,
    sourceCode: sourceContract?.code || "",
    contractName: sourceContract?.contractName || "",
    primarySourcePath: sourceContract?.primarySourcePath || ""
  });

  if (!sourceContract && !bytecodeContract && externalAnalyses.every((analysis) => analysis.status !== "ok")) {
    throw new Error(sourceError || bytecodeError || "Unable to audit the contract address with either source-based or bytecode-based analysis.");
  }

  const contractType = sourceContract
    ? detectContractType(sourceContract.code, options.contractType)
    : (options.contractType || "general");
  const findings = collectDetectedFindings(externalAnalyses);

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
      bytecodeAddress: bytecodeContract.address,
      bytecodeSize: bytecodeContract.bytecodeSize,
      bytecodeHash: bytecodeContract.bytecodeHash,
      bytecodeProvider: bytecodeContract.provider
    } : {}),
    analysisAddress,
    contractType,
    findings,
    externalAnalyses,
    analysisMode,
    hasVerifiedSource: Boolean(sourceContract),
    sourceFetchError: sourceError || null,
    bytecodeFetchError: bytecodeError || null,
    summary: makeSummary(
      contractType,
      findings,
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
