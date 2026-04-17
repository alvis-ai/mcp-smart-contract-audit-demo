import { auditAddress } from "../src/analyzer.js";

const CONTRACT_TYPES = new Set(["general", "launchpad", "nft", "staking", "lending"]);

// Lightweight human-facing CLI for local debugging. The structured MCP output
// is great for IDEs, but direct terminal use benefits from plain text.
function printUsage() {
  console.error("Usage: node scripts/audit-address.js <address> [chainId] [contractType]");
  console.error("Example: node scripts/audit-address.js 0x1234567890abcdef1234567890abcdef12345678 1 launchpad");
  console.error("You can also run: npm run audit:address -- <address> [chainId] [contractType]");
}

function parseArgs(argv) {
  const [address, chainIdArg, contractType] = argv;
  if (!address || address === "-h" || address === "--help") {
    printUsage();
    process.exit(address ? 0 : 1);
  }

  let chainId;
  if (typeof chainIdArg !== "undefined" && chainIdArg !== "") {
    chainId = Number(chainIdArg);
    if (!Number.isInteger(chainId) || chainId <= 0) {
      throw new Error(`Invalid chainId: ${chainIdArg}`);
    }
  }

  if (contractType && !CONTRACT_TYPES.has(contractType)) {
    throw new Error(`Invalid contractType: ${contractType}. Expected one of ${[...CONTRACT_TYPES].join(", ")}.`);
  }

  return {
    address,
    options: {
      ...(typeof chainId !== "undefined" ? { chainId } : {}),
      ...(contractType ? { contractType } : {})
    }
  };
}

function formatFindings(result) {
  const lines = [
    `Address: ${result.address}`,
    `Chain: ${result.chainName || "unknown"} (${result.chainId})`,
    `Contract: ${result.contractName}`,
    `Compiler: ${result.compilerVersion}`,
    `Match: ${result.matchType}`,
    `Analysis mode: ${result.analysisMode || "source-only"}`,
    `Analysis target: ${result.analysisAddress || result.address}`,
    `Contract type: ${result.contractType}`,
    `Summary: ${result.summary}`,
    "",
    "Detected Issues:"
  ];

  if (result.findings.length === 0) {
    lines.push("- No issues were reported by the configured third-party analyzers.");
  } else {
    for (const finding of result.findings) {
      lines.push(`- [${finding.severity.toUpperCase()}] ${finding.title}${finding.engine ? ` (${finding.engine})` : ""}`);
      lines.push(`  Why: ${finding.rationale}`);
      lines.push(`  Fix: ${finding.recommendation}`);
    }
  }

  if (result.sourceFiles?.length) {
    lines.push("");
    lines.push(`Source files: ${result.sourceFiles.join(", ")}`);
  }

  if (result.missingSourceFiles?.length) {
    lines.push(`Missing source files: ${result.missingSourceFiles.join(", ")}`);
  }

  if (Array.isArray(result.externalAnalyses) && result.externalAnalyses.length > 0) {
    lines.push("");
    lines.push("External Engines:");
    for (const analysis of result.externalAnalyses) {
      lines.push(`- ${analysis.engine} (${analysis.driver || "n/a"}): ${analysis.summary}`);
      if (Array.isArray(analysis.issues) && analysis.issues.length > 0) {
        for (const issue of analysis.issues) {
          lines.push(`  - [${String(issue.severity || "info").toUpperCase()}] ${issue.title}`);
        }
      } else {
        lines.push("  - No issues reported.");
      }
    }
  }

  return lines.join("\n");
}

async function main() {
  const { address, options } = parseArgs(process.argv.slice(2));
  const result = await auditAddress(address, options);
  process.stdout.write(`${formatFindings(result)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
