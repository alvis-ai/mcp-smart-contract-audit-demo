import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./knowledge-base.js";
import {
  fetchDeployedBytecode,
  fetchVerifiedContractSource
} from "./verified-source.js";
import {
  groupAnalyzerIssues,
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

function buildSummary(summaryKey, summaryParams, summary) {
  return {
    summaryKey,
    summaryParams,
    summary
  };
}

function classifyFindingCategory(issue) {
  const title = String(issue?.title || "").trim();
  if (["naming-convention", "external-function", "immutable-states", "write-after-write"].includes(title)) {
    return "advisory";
  }
  return "security";
}

function normalizeIssueTitle(issue, engine = "") {
  const title = String(issue?.title || "").trim();
  if (title && title.toLowerCase() !== "unnamed issue") {
    return title;
  }

  if (engine !== "mythril") {
    return title || "Unnamed issue";
  }

  return {
    "SWC-104": "Unchecked external call result",
    "SWC-107": "Reentrancy",
    "SWC-110": "Assert violation risk",
    "SWC-112": "Untrusted delegatecall target",
    "SWC-115": "Dangerous tx.origin authorization",
    "SWC-116": "Timestamp dependence",
    "SWC-124": "Arbitrary storage write"
  }[String(issue?.swcId || "").trim()] || "Unnamed issue";
}

function buildEngineSummary(analysis) {
  const engineName = analysis.engine === "mythril"
    ? "Mythril"
    : analysis.engine === "slither"
      ? "Slither"
      : (analysis.title || analysis.engine || "External analysis");

  if (analysis.status === "ok") {
    if ((analysis.issueCount || 0) > 0) {
      return {
        summaryKey: "engine.reportedIssues",
        summaryParams: { engine: engineName, issueCount: analysis.issueCount || 0 },
        summary: `${engineName} reported ${analysis.issueCount || 0} issue(s).`
      };
    }

    return {
      summaryKey: "engine.noIssues",
      summaryParams: { engine: engineName },
      summary: `${engineName} completed without reporting issues.`
    };
  }

  if (analysis.summaryKey) {
    return {
      summaryKey: analysis.summaryKey,
      summaryParams: analysis.summaryParams || null,
      summary: analysis.summary || ""
    };
  }

  return {
    summaryKey: "",
    summaryParams: null,
    summary: analysis.summary || ""
  };
}

function normalizeExternalAnalyses(externalAnalyses) {
  return (externalAnalyses || []).map((analysis) => {
    const issues = groupAnalyzerIssues(
      analysis.engine || "engine",
      (Array.isArray(analysis.issues) ? analysis.issues : []).map((issue) => ({
        ...issue,
        title: normalizeIssueTitle(issue, analysis.engine || "")
      }))
    );
    const issueCount = issues.length;
    const engineSummary = buildEngineSummary({
      ...analysis,
      issueCount
    });

    return {
      ...analysis,
      issueCount,
      issues,
      ...engineSummary
    };
  });
}

function getFindingGuidance(issue) {
  const key = String(issue?.title || "").trim();
  const swcId = String(issue?.swcId || "").trim();
  const guidance = {
    "tx-origin": {
      rationaleKey: "finding.txOrigin.why",
      recommendationKey: "finding.txOrigin.fix"
    },
    "solc-version": {
      rationaleKey: "finding.solcVersion.why",
      recommendationKey: "finding.solcVersion.fix"
    },
    "immutable-states": {
      rationaleKey: "finding.immutableStates.why",
      recommendationKey: "finding.immutableStates.fix"
    },
    "unchecked-lowlevel": {
      rationaleKey: "finding.uncheckedLowLevel.why",
      recommendationKey: "finding.uncheckedLowLevel.fix"
    },
    "missing-zero-check": {
      rationaleKey: "finding.missingZeroCheck.why",
      recommendationKey: "finding.missingZeroCheck.fix"
    },
    "low-level-calls": {
      rationaleKey: "finding.lowLevelCalls.why",
      recommendationKey: "finding.lowLevelCalls.fix"
    },
    "reentrancy-balance": {
      rationaleKey: "finding.reentrancyBalance.why",
      recommendationKey: "finding.reentrancyBalance.fix"
    },
    "reentrancy-no-eth": {
      rationaleKey: "finding.reentrancyNoEth.why",
      recommendationKey: "finding.reentrancyNoEth.fix"
    },
    "unchecked-transfer": {
      rationaleKey: "finding.uncheckedTransfer.why",
      recommendationKey: "finding.uncheckedTransfer.fix"
    },
    "unused-return": {
      rationaleKey: "finding.unusedReturn.why",
      recommendationKey: "finding.unusedReturn.fix"
    },
    "arbitrary-send-erc20": {
      rationaleKey: "finding.arbitrarySendErc20.why",
      recommendationKey: "finding.arbitrarySendErc20.fix"
    },
    "write-after-write": {
      rationaleKey: "finding.writeAfterWrite.why",
      recommendationKey: "finding.writeAfterWrite.fix"
    },
    "costly-loop": {
      rationaleKey: "finding.costlyLoop.why",
      recommendationKey: "finding.costlyLoop.fix"
    },
    "calls-loop": {
      rationaleKey: "finding.callsLoop.why",
      recommendationKey: "finding.callsLoop.fix"
    },
    "external-function": {
      rationaleKey: "finding.externalFunction.why",
      recommendationKey: "finding.externalFunction.fix"
    },
    "naming-convention": {
      rationaleKey: "finding.namingConvention.why",
      recommendationKey: "finding.namingConvention.fix"
    },
    "weak-prng": {
      rationaleKey: "finding.weakPrng.why",
      recommendationKey: "finding.weakPrng.fix"
    },
    "timestamp": {
      rationaleKey: "finding.timestampDependence.why",
      recommendationKey: "finding.timestampDependence.fix"
    },
    "Dangerous tx.origin authorization": {
      rationaleKey: "finding.txOrigin.why",
      recommendationKey: "finding.txOrigin.fix"
    },
    "Timestamp dependence": {
      rationaleKey: "finding.timestampDependence.why",
      recommendationKey: "finding.timestampDependence.fix"
    },
    "Assert violation risk": {
      rationaleKey: "finding.assertViolation.why",
      recommendationKey: "finding.assertViolation.fix"
    }
  }[key];

  if (guidance) {
    return guidance;
  }

  const swcGuidance = {
    "SWC-110": {
      rationaleKey: "finding.assertViolation.why",
      recommendationKey: "finding.assertViolation.fix"
    },
    "SWC-115": {
      rationaleKey: "finding.txOrigin.why",
      recommendationKey: "finding.txOrigin.fix"
    },
    "SWC-116": {
      rationaleKey: "finding.timestampDependence.why",
      recommendationKey: "finding.timestampDependence.fix"
    }
  }[swcId];

  if (swcGuidance) {
    return swcGuidance;
  }

  return {
    rationaleKey: "finding.generic.why",
    recommendationKey: "finding.generic.fix"
  };
}

function collectDetectedFindings(externalAnalyses) {
  return externalAnalyses.flatMap((analysis) => (analysis.issues || []).map((issue, index) => ({
    id: `${analysis.engine || "engine"}-${issue.swcId || issue.title || "issue"}-${issue.functionName || issue.sourcePath || issue.pc || index}`,
    severity: issue.severity || "info",
    category: classifyFindingCategory(issue),
    title: issue.title || "Unnamed issue",
    rationale: issue.description || analysis.summary || "The external analyzer reported this issue without additional detail.",
    recommendation: "Review the affected path, confirm exploitability manually, and patch the underlying contract logic before deployment.",
    ...getFindingGuidance(issue),
    engine: analysis.engine || "engine",
    engineTitle: analysis.title || analysis.engine || "External analysis",
    swcId: issue.swcId || "",
    functionName: issue.functionName || "",
    sourcePath: issue.sourcePath || "",
    line: Number.isFinite(Number(issue.line)) ? Number(issue.line) : null,
    pc: typeof issue.pc === "number" ? issue.pc : null,
    instanceCount: Number.isFinite(Number(issue.instanceCount)) ? Number(issue.instanceCount) : 1,
    instances: Array.isArray(issue.instances) ? issue.instances : []
  })));
}

// The summary is short by design because IDE integrations surface it first and
// full findings are rendered below.
function makeSummary(contractType, findings, externalAnalyses, analysisMode, sourceAvailable) {
  const severeCount = countSevere(findings);
  const externalIssueCount = countExternalIssues(externalAnalyses);
  const availableEngineCount = externalAnalyses.filter((analysis) => analysis.status === "ok").length;

  if (availableEngineCount === 0) {
    return buildSummary(
      "audit.noEngine",
      { contractType, analysisMode },
      `${contractType} contract analysis could not run any third-party engine in ${analysisMode} mode. Check Slither/Mythril configuration before trusting the result.`
    );
  }

  if (findings.length === 0) {
    return buildSummary(
      "audit.noIssues",
      { contractType, analysisMode, sourceAvailable: sourceAvailable ? "true" : "false" },
      `${contractType} contract analysis completed in ${analysisMode} mode${sourceAvailable ? " with verified source" : ""}. Third-party engines reported no issues, but manual review is still required.`
    );
  }

  return buildSummary(
    "audit.withIssues",
    {
      contractType,
      analysisMode,
      issueCount: externalIssueCount,
      highSeverityCount: severeCount,
      engineCount: availableEngineCount
    },
    `${contractType} contract analysis completed in ${analysisMode} mode with ${externalIssueCount} issue(s), including ${severeCount} high-severity item(s), from ${availableEngineCount} third-party engine(s).`
  );
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
  const summary = makeSummary(contractType, findings, externalAnalyses, "source-static", true);

  return {
    contractType,
    summary: summary.summary,
    summaryCode: summary.summaryKey,
    summaryParams: summary.summaryParams,
    findings,
    externalAnalyses,
    analysisMode: "source-static",
    hasVerifiedSource: true
  };
}

export function normalizeAuditResult(result, auditMeta = {}) {
  if (!result || typeof result !== "object") {
    return result;
  }

  if (!Array.isArray(result.externalAnalyses)) {
    return result;
  }

  const externalAnalyses = normalizeExternalAnalyses(result.externalAnalyses);
  const findings = collectDetectedFindings(externalAnalyses);
  const contractType = result.contractType || auditMeta.contractType || "general";
  const analysisMode = result.analysisMode || auditMeta.analysisMode || "unknown";
  const hasVerifiedSource = typeof result.hasVerifiedSource === "boolean"
    ? result.hasVerifiedSource
    : Boolean(result.code || result.sourceRepository || (Array.isArray(result.sourceFiles) && result.sourceFiles.length > 0));

  const summary = result.summaryCode
    ? {
      summaryKey: result.summaryCode,
      summaryParams: result.summaryParams || null,
      summary: result.summary || ""
    }
    : makeSummary(contractType, findings, externalAnalyses, analysisMode, hasVerifiedSource);

  return {
    ...result,
    contractType,
    analysisMode,
    hasVerifiedSource,
    findings,
    externalAnalyses,
    summary: summary.summary,
    summaryCode: summary.summaryKey,
    summaryParams: summary.summaryParams
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
  const summary = makeSummary(
    contractType,
    findings,
    externalAnalyses,
    analysisMode,
    Boolean(sourceContract)
  );

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
    summary: summary.summary,
    summaryCode: summary.summaryKey,
    summaryParams: summary.summaryParams
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
