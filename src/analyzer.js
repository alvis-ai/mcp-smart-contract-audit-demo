import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./knowledge-base.js";

const rules = [
  {
    id: "AUTH-TXORIGIN",
    severity: "high",
    title: "Avoid using tx.origin for authentication",
    test: (code) => code.includes("tx.origin"),
    rationale: "tx.origin can be abused through phishing-style call chains and should not be used for authorization.",
    recommendation: "Use msg.sender plus explicit role checks or AccessControl."
  },
  {
    id: "ACCESS-ADMIN-SETTER",
    severity: "high",
    title: "Sensitive setter appears to be missing access control",
    test: (code) => /function\s+set[A-Z]\w*\s*\([^)]*\)\s+external/.test(code) && !/onlyOwner|AccessControl|require\s*\(\s*msg\.sender\s*==\s*owner/.test(code),
    rationale: "Admin configuration functions should be restricted to privileged roles.",
    recommendation: "Protect privileged configuration with onlyOwner, AccessControl, or explicit admin checks."
  },
  {
    id: "REENTRANCY-CALL-FIRST",
    severity: "critical",
    title: "External call is executed before state reset",
    test: (code) => /call\{value:[^}]+\}\(""\).*purchased\[msg\.sender\]\s*=\s*0/s.test(code),
    rationale: "Calling an external address before clearing state opens a classical reentrancy window.",
    recommendation: "Apply checks-effects-interactions and clear state before the external call, or use ReentrancyGuard."
  },
  {
    id: "CALL-LOWLEVEL",
    severity: "medium",
    title: "Low-level call detected",
    test: (code) => /\.call\{/.test(code),
    rationale: "Low-level call usage deserves careful review for reentrancy and error-handling paths.",
    recommendation: "Prefer pull-based withdrawals with reentrancy protection and ensure failure paths are explicit."
  },
  {
    id: "RNG-BLOCK-TIMESTAMP",
    severity: "medium",
    title: "Block timestamp used as a randomness source",
    test: (code) => /block\.timestamp|block\.prevrandao/.test(code),
    rationale: "Block properties are not secure randomness sources for adversarial settings such as lotteries or NFT mint randomness.",
    recommendation: "Use a verifiable randomness solution such as Chainlink VRF or an off-chain commit-reveal design."
  },
  {
    id: "EVENTS-MISSING",
    severity: "low",
    title: "No event definitions found",
    test: (code) => !/\bevent\s+[A-Z]\w*/.test(code),
    rationale: "Key state changes should emit events to support monitoring, analytics and incident response.",
    recommendation: "Emit events for config changes, purchases, claims, draws, staking changes and admin actions."
  },
  {
    id: "WHITELIST-WEAK",
    severity: "medium",
    title: "Whitelist flow does not show nonce or deadline protection",
    test: (code, contractType) => contractType === "launchpad" && /whitelist/i.test(code) && !/nonce|deadline|chainid|ecrecover|ECDSA/.test(code),
    rationale: "LaunchPad whitelist flows typically need replay protection and explicit signature domain binding.",
    recommendation: "Include signer, chainId, nonce, deadline and claimed status in whitelist verification logic."
  }
];

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

function makeSummary(contractType, findings) {
  const severeCount = findings.filter((item) => item.severity === "critical" || item.severity === "high").length;
  if (findings.length === 0) {
    return `No rule-based findings were triggered. ${contractType} contract still requires manual business-logic review.`;
  }
  return `${contractType} contract audit finished with ${findings.length} findings, including ${severeCount} high-severity items.`;
}

export function auditCode(code, options = {}) {
  const contractType = detectContractType(code, options.contractType);
  const findings = rules
    .filter((rule) => rule.test(code, contractType))
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

export function auditFile(relativePath, options = {}) {
  const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const fullPath = path.join(getProjectRoot(), safePath);
  if (!fullPath.startsWith(getProjectRoot())) {
    throw new Error("Path escapes project root.");
  }
  const code = fs.readFileSync(fullPath, "utf8");
  return {
    path: safePath,
    code,
    ...auditCode(code, options)
  };
}

export function generateChecklist(projectType) {
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

export function resumeAlignment(projectType) {
  const mapped = {
    launchpad: ["LaunchPad / IDO", "白名单签名", "Claim / Refund", "权限控制"],
    nft: ["NFT Marketplace", "Mint / Auction", "白名单活动", "Gas 优化"],
    staking: ["Staking", "奖励分发", "紧急提取", "事件监听"],
    lending: ["Lending", "抵押率与清算", "资产安全", "后端索引"]
  };
  return mapped[projectType] || ["权限控制", "重入检查", "事件日志", "知识库驱动审计"];
}
