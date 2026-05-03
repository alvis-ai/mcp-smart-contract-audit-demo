import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./knowledge-base.js";

const DEFAULT_DOCKER_BIN = process.env.AUDIT_DOCKER_BIN || "docker";
const DEFAULT_MYTHRIL_DOCKER_IMAGE = process.env.AUDIT_MYTHRIL_DOCKER_IMAGE || "mythril/myth";
const DEFAULT_MYTHRIL_TIMEOUT = Math.max(1, Number(process.env.AUDIT_MYTHRIL_TIMEOUT || 90));
const DEFAULT_MYTHRIL_MAX_BYTECODE_BYTES = Math.max(0, Number(process.env.AUDIT_MYTHRIL_MAX_BYTECODE_BYTES || 16000));
const DEFAULT_SLITHER_DOCKER_IMAGE = process.env.AUDIT_SLITHER_DOCKER_IMAGE || "smart-contract-audit-slither:local";
const DEFAULT_SLITHER_DOCKER_PLATFORM = process.env.AUDIT_SLITHER_DOCKER_PLATFORM || "";
const DEFAULT_SLITHER_TIMEOUT = Math.max(1, Number(process.env.AUDIT_SLITHER_TIMEOUT || 90));
const DEFAULT_ADERYN_DOCKER_IMAGE = process.env.AUDIT_ADERYN_DOCKER_IMAGE || "smart-contract-audit-aderyn:local";
const DEFAULT_ADERYN_DOCKER_PLATFORM = process.env.AUDIT_ADERYN_DOCKER_PLATFORM || "";
const DEFAULT_ADERYN_TIMEOUT = Math.max(1, Number(process.env.AUDIT_ADERYN_TIMEOUT || 60));
const MYTHRIL_SWC_TITLES = {
  "SWC-104": "Unchecked external call result",
  "SWC-107": "Reentrancy",
  "SWC-110": "Assert violation risk",
  "SWC-112": "Untrusted delegatecall target",
  "SWC-115": "Dangerous tx.origin authorization",
  "SWC-116": "Timestamp dependence",
  "SWC-124": "Arbitrary storage write"
};

function getMythrilBinaryCandidates() {
  const candidates = [];
  if (process.env.AUDIT_MYTHRIL_BIN) {
    candidates.push(process.env.AUDIT_MYTHRIL_BIN);
  }
  candidates.push("myth");
  if (process.env.HOME) {
    candidates.push(path.join(process.env.HOME, ".local", "bin", "myth"));
  }
  return [...new Set(candidates)];
}

function getDockerBinaryCandidates() {
  const candidates = [];
  if (process.env.AUDIT_DOCKER_BIN) {
    candidates.push(process.env.AUDIT_DOCKER_BIN);
  }
  candidates.push(DEFAULT_DOCKER_BIN);
  candidates.push("/usr/bin/docker");
  candidates.push("/usr/local/bin/docker");
  candidates.push("/Applications/Docker.app/Contents/Resources/bin/docker");
  return [...new Set(candidates)];
}

function normalizeSeverity(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized.includes("critical")) {
    return "critical";
  }
  if (normalized.includes("high")) {
    return "high";
  }
  if (normalized.includes("medium")) {
    return "medium";
  }
  if (normalized.includes("low")) {
    return "low";
  }
  return "info";
}

function normalizeTextKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSourcePath(input, fallbackName = "Contract.sol") {
  const candidate = String(input || "").trim() || fallbackName;
  const normalized = path.posix.normalize(candidate.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("..")) {
    return fallbackName;
  }
  return normalized;
}

function resolveMythrilIssueTitle(issue) {
  const rawTitle = String(
    issue?.title || issue?.shortDescription?.headline || issue?.description?.headline || issue?.check || ""
  ).trim();

  if (rawTitle && rawTitle.toLowerCase() !== "unnamed issue") {
    return rawTitle;
  }

  const swcId = String(issue?.swcID || issue?.swcId || issue?.swc_id || "").trim();
  return MYTHRIL_SWC_TITLES[swcId] || "Unnamed issue";
}

function uniqueInstances(instances) {
  const seen = new Set();
  const result = [];
  for (const instance of instances) {
    const key = JSON.stringify([
      instance.functionName || "",
      instance.sourcePath || "",
      instance.line ?? "",
      instance.pc ?? "",
      normalizeTextKey(instance.description || "")
    ]);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(instance);
  }
  return result;
}

export function groupAnalyzerIssues(engine, issues) {
  const groups = new Map();

  for (const issue of issues || []) {
    const locationKey = issue.functionName
      ? `fn:${issue.functionName}`
      : issue.sourcePath
        ? `src:${issue.sourcePath}:${issue.line || ""}`
        : "";
    const fallbackKey = locationKey
      ? ""
      : normalizeTextKey(issue.description || "").slice(0, 160);
    const groupKey = JSON.stringify([
      engine,
      issue.swcId || "",
      issue.title || "",
      issue.severity || "",
      locationKey,
      fallbackKey
    ]);

    const current = groups.get(groupKey);
    if (!current) {
      groups.set(groupKey, {
        ...issue,
        instances: uniqueInstances([{
          functionName: issue.functionName || "",
          sourcePath: issue.sourcePath || "",
          line: issue.line ?? null,
          pc: issue.pc ?? null,
          description: issue.description || ""
        }]),
        instanceCount: 1
      });
      continue;
    }

    current.instances = uniqueInstances([
      ...current.instances,
      {
        functionName: issue.functionName || "",
        sourcePath: issue.sourcePath || "",
        line: issue.line ?? null,
        pc: issue.pc ?? null,
        description: issue.description || ""
      }
    ]);
    current.instanceCount = current.instances.length;

    if (!current.functionName && issue.functionName) {
      current.functionName = issue.functionName;
    }
    if (!current.sourcePath && issue.sourcePath) {
      current.sourcePath = issue.sourcePath;
    }
    if (!current.line && issue.line) {
      current.line = issue.line;
    }
    if (current.pc == null && issue.pc != null) {
      current.pc = issue.pc;
    }
  }

  return [...groups.values()];
}

function withSummary(summaryKey, summaryParams, summary) {
  return {
    summaryKey,
    summaryParams,
    summary
  };
}

function resolveMythrilMode() {
  const mode = String(process.env.AUDIT_MYTHRIL_MODE || "auto").toLowerCase();
  if (["off", "binary", "docker", "auto"].includes(mode)) {
    return mode;
  }
  return "auto";
}

function resolveSlitherMode() {
  const mode = String(process.env.AUDIT_SLITHER_MODE || "off").toLowerCase();
  if (["off", "docker", "auto"].includes(mode)) {
    return mode;
  }
  return "off";
}

function resolveAderynMode() {
  const mode = String(process.env.AUDIT_ADERYN_MODE || "docker").toLowerCase();
  if (["off", "docker", "auto"].includes(mode)) {
    return mode;
  }
  return "docker";
}

function runCommand(command, args, options = {}) {
  const solcxDir = process.env.SOLCX_BINARY_PATH || path.join(getProjectRoot(), "data", "solcx");
  const mplDir = process.env.MPLCONFIGDIR || path.join(getProjectRoot(), "data", "mpl");
  const cacheDir = process.env.XDG_CACHE_HOME || path.join(getProjectRoot(), "data", "cache");
  const pythonWarnings = process.env.PYTHONWARNINGS
    ? `${process.env.PYTHONWARNINGS},ignore:pkg_resources is deprecated as an API:UserWarning`
    : "ignore:pkg_resources is deprecated as an API:UserWarning";
  fs.mkdirSync(solcxDir, { recursive: true });
  fs.mkdirSync(mplDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeoutTimer;
    let forceKillTimer;
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        SOLCX_BINARY_PATH: solcxDir,
        MPLCONFIGDIR: mplDir,
        XDG_CACHE_HOME: cacheDir,
        PYTHONWARNINGS: pythonWarnings
      }
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      callback(value);
    };

    if (options.timeoutMs) {
      timeoutTimer = setTimeout(() => {
        const message = `${command} ${args.join(" ")} timed out after ${options.timeoutMs} ms`;
        child.kill("SIGTERM");
        forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2000);
        finish(reject, new Error(message));
      }, options.timeoutMs);
    }

    child.on("error", (error) => finish(reject, error));
    child.on("close", (code) => {
      finish(resolve, { code, stdout, stderr });
    });
  });
}

async function withDuration(promise) {
  const startedAt = Date.now();
  const result = await promise;
  return {
    ...result,
    durationMs: Date.now() - startedAt
  };
}

function collectMythrilIssues(payload) {
  const candidates = [
    payload?.issues,
    Array.isArray(payload) ? payload.flatMap((entry) => Array.isArray(entry?.issues) ? entry.issues : []) : null,
    payload?.results,
    payload?.analysis,
  ].find((value) => Array.isArray(value));

  if (!candidates) {
    return [];
  }

  return candidates.map((issue) => ({
    swcId: issue?.swcID || issue?.swcId || issue?.swc_id || "",
    title: resolveMythrilIssueTitle(issue),
    severity: normalizeSeverity(issue?.severity),
    description: issue?.description?.tail || issue?.description || issue?.longDescription || issue?.extra?.description || "",
    functionName: issue?.function || issue?.functionName || "",
    pc: Number.isFinite(Number(issue?.address)) ? Number(issue.address) : null,
    sourcePath: "",
    line: null
  }));
}

function buildSourceIndex(sourceCode, options = {}) {
  if (!sourceCode) {
    return null;
  }

  const fallbackPath = normalizeSourcePath(
    options.primarySourcePath,
    `${options.contractName || "Contract"}.sol`
  );
  const marker = /^\/\/ File:\s+(.+)$/;
  const files = new Map();
  let currentPath = fallbackPath;
  let currentLines = [];

  const flush = () => {
    if (currentLines.length === 0) {
      return;
    }
    files.set(currentPath, [...(files.get(currentPath) || []), ...currentLines]);
  };

  for (const rawLine of String(sourceCode).split(/\r?\n/)) {
    const matched = rawLine.match(marker);
    if (matched) {
      flush();
      currentPath = normalizeSourcePath(matched[1], fallbackPath);
      currentLines = [];
      continue;
    }
    currentLines.push(rawLine);
  }
  flush();

  const entries = [];
  const functionsByFile = new Map();
  const declarationPattern = /\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(|\bmodifier\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(|\b(constructor|fallback|receive)\s*\(/i;

  for (const [sourcePath, lines] of files.entries()) {
    const functions = [];
    let pendingName = "";
    for (let index = 0; index < lines.length; index += 1) {
      const text = lines[index];
      entries.push({ sourcePath, line: index + 1, text });

      const match = text.match(declarationPattern);
      if (match) {
        pendingName = match[1] || match[2] || match[3] || "";
      }

      if (pendingName && text.includes("{")) {
        functions.push({
          line: index + 1,
          name: pendingName
        });
        pendingName = "";
      } else if (pendingName && text.includes(";")) {
        pendingName = "";
      }
    }
    functionsByFile.set(sourcePath, functions);
  }

  return {
    entries,
    functionsByFile,
    primarySourcePath: fallbackPath
  };
}

function nearestFunctionName(functions, line) {
  if (!Array.isArray(functions) || !functions.length || !line) {
    return "";
  }

  let current = "";
  for (const item of functions) {
    if (item.line > line) {
      break;
    }
    current = item.name;
  }
  return current;
}

function inferMythrilSourceHint(index, issue) {
  if (!index?.entries?.length) {
    return null;
  }

  const description = normalizeTextKey(issue.description || "");
  const patterns = [];

  if (issue.swcId === "SWC-110" || description.includes("assertion violation")) {
    patterns.push(/\bassert\s*\(/i);
  }
  if (issue.swcId === "SWC-116" || description.includes("block.timestamp") || description.includes("timestamp")) {
    patterns.push(/\bblock\.timestamp\b|\bnow\b/i);
  }
  if (issue.swcId === "SWC-115" || description.includes("tx.origin")) {
    patterns.push(/\btx\.origin\b/i);
  }
  if (issue.swcId === "SWC-104" || description.includes("return value")) {
    patterns.push(/\.call\s*\(|\.delegatecall\s*\(|\.staticcall\s*\(/i);
  }
  if (issue.swcId === "SWC-107" || description.includes("reentr")) {
    patterns.push(/call\.value\s*\(|\.call\s*\(/i);
  }

  for (const pattern of patterns) {
    const matched = index.entries.find((entry) => entry.sourcePath === index.primarySourcePath && pattern.test(entry.text))
      || index.entries.find((entry) => pattern.test(entry.text));

    if (!matched) {
      continue;
    }

    return {
      sourcePath: matched.sourcePath,
      line: matched.line,
      functionName: nearestFunctionName(index.functionsByFile.get(matched.sourcePath), matched.line)
    };
  }

  return null;
}

function enrichMythrilIssues(issues, options = {}) {
  const sourceIndex = buildSourceIndex(options.sourceCode || "", options);

  return (issues || []).map((issue) => {
    const title = resolveMythrilIssueTitle(issue);
    if (issue.functionName || issue.sourcePath || issue.line != null || !sourceIndex) {
      return {
        ...issue,
        title
      };
    }

    const hint = inferMythrilSourceHint(sourceIndex, issue);
    if (!hint) {
      return {
        ...issue,
        title
      };
    }

    return {
      ...issue,
      title,
      functionName: issue.functionName || hint.functionName || "",
      sourcePath: issue.sourcePath || hint.sourcePath || "",
      line: issue.line ?? hint.line ?? null
    };
  });
}

function collectSlitherIssues(payload) {
  const rawDetectors = payload?.results?.detectors;
  const detectors = Array.isArray(rawDetectors)
    ? rawDetectors
    : (rawDetectors && typeof rawDetectors === "object" ? Object.values(rawDetectors) : []);
  if (!Array.isArray(detectors) || detectors.length === 0) {
    return [];
  }
  return detectors.map((detector) => {
    const firstElement = Array.isArray(detector?.elements) && detector.elements.length > 0 ? detector.elements[0] : null;
    const lines = Array.isArray(firstElement?.source_mapping?.lines) ? firstElement.source_mapping.lines : [];
    return {
      swcId: "",
      title: detector?.check || detector?.title || "Unnamed detector",
      severity: normalizeSeverity(detector?.impact || detector?.severity || detector?.confidence),
      description: detector?.description || detector?.markdown || "",
      functionName: firstElement?.name || "",
      pc: null,
      sourcePath: firstElement?.source_mapping?.filename_relative || "",
      line: lines.length > 0 ? lines[0] : null
    };
  });
}

function collectSlitherIssuesFromLogs(logs) {
  const normalized = String(logs || "").trim();
  if (!normalized) {
    return [];
  }

  const blocks = normalized
    .split(/\n(?=Detector:\s+)/g)
    .map((block) => block.trim())
    .filter((block) => block.startsWith("Detector:"));

  return blocks.map((block) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^Detector:\s*/i, "").trim() || "Unnamed detector";
    const description = lines
      .slice(1)
      .filter((line) => !/^Reference:/i.test(line))
      .join("\n")
      .trim();
    const locationMatch = description.match(/\(([^()]+)#(\d+)(?:-\d+)?\)/);
    return {
      swcId: "",
      title,
      severity: "info",
      description,
      functionName: "",
      pc: null,
      sourcePath: locationMatch?.[1] || "",
      line: Number.isFinite(Number(locationMatch?.[2])) ? Number(locationMatch[2]) : null
    };
  });
}

function firstDefined(...values) {
  return values.find((value) => typeof value !== "undefined" && value !== null && value !== "");
}

function isCommandTimeout(error) {
  return String(error?.message || "").toLowerCase().includes("timed out");
}

function asIssueArray(value) {
  if (Array.isArray(value)) {
    return value.flatMap(asIssueArray);
  }
  if (value && typeof value === "object") {
    if (Array.isArray(value.issues)) {
      return asIssueArray(value.issues);
    }
    if (Array.isArray(value.results)) {
      return asIssueArray(value.results);
    }
    return [value];
  }
  return [];
}

function collectAderynIssues(payload) {
  const buckets = [
    ["critical", payload?.critical_issues],
    ["critical", payload?.criticalIssues],
    ["high", payload?.high_issues],
    ["high", payload?.highIssues],
    ["medium", payload?.medium_issues],
    ["medium", payload?.mediumIssues],
    ["low", payload?.low_issues],
    ["low", payload?.lowIssues],
    ["info", payload?.informational_issues],
    ["info", payload?.informationalIssues],
    ["info", payload?.info_issues],
    ["info", payload?.infoIssues],
    ["info", payload?.issues],
    ["info", payload?.results?.issues]
  ];

  const rawIssues = buckets.flatMap(([severity, value]) => (
    asIssueArray(value).map((issue) => ({ severity, issue }))
  ));

  return rawIssues.map(({ severity, issue }) => {
    const location = firstDefined(
      Array.isArray(issue.locations) ? issue.locations[0] : undefined,
      Array.isArray(issue.instances) ? issue.instances[0] : undefined,
      issue.location,
      issue.source,
      issue.sourceLocation,
      {}
    ) || {};
    const start = location.start || issue.start || {};
    const title = firstDefined(
      issue.title,
      issue.name,
      issue.detector,
      issue.detectorName,
      issue.detector_name,
      issue.check,
      issue.issue,
      "Aderyn finding"
    );

    return {
      swcId: "",
      title,
      severity: normalizeSeverity(firstDefined(issue.severity, location.severity, severity)),
      description: firstDefined(
        issue.description,
        issue.message,
        issue.body,
        issue.markdown,
        issue.help,
        issue.detail,
        ""
      ),
      functionName: firstDefined(issue.functionName, issue.function, location.functionName, location.function, ""),
      pc: null,
      sourcePath: firstDefined(
        issue.sourcePath,
        issue.contractPath,
        issue.contract_path,
        issue.path,
        issue.file,
        issue.filename,
        location.sourcePath,
        location.contractPath,
        location.contract_path,
        location.path,
        location.file,
        location.filename,
        ""
      ),
      line: Number.isFinite(Number(firstDefined(issue.line, issue.lineNumber, issue.line_no, location.line, location.lineNumber, location.line_no, start.line)))
        ? Number(firstDefined(issue.line, issue.lineNumber, issue.line_no, location.line, location.lineNumber, location.line_no, start.line))
        : null
    };
  });
}

function parseMythrilResult(command, code, stdout, stderr, driver, options = {}) {

  try {
    const payload = JSON.parse(stdout);
    const issues = groupAnalyzerIssues(
      "mythril",
      enrichMythrilIssues(collectMythrilIssues(payload), options)
    );
    return {
      engine: "mythril",
      title: "Mythril bytecode analysis",
      driver,
      mode: "address-rpc-bytecode",
      status: "ok",
      issueCount: issues.length,
      ...(issues.length > 0
        ? withSummary("engine.reportedIssues", { engine: "Mythril", issueCount: issues.length }, `Mythril reported ${issues.length} issue(s).`)
        : withSummary("engine.noIssues", { engine: "Mythril" }, "Mythril completed without reporting issues.")),
      issues
    };
  } catch (error) {
    if (code !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
    }
    throw new Error(`Mythril returned non-JSON output: ${error.message}`);
  }
}

async function tryRunMythril(command, args, driver, options = {}) {
  const { code, stdout, stderr } = await runCommand(command, args, {
    timeoutMs: (DEFAULT_MYTHRIL_TIMEOUT + 15) * 1000
  });
  return parseMythrilResult(command, code, stdout, stderr, driver, options);
}

async function tryRunMythrilDocker(dockerBin, baseArgs, options = {}) {
  const containerName = `mythril-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    const dockerArgs = [
      "run",
      "--name",
      containerName,
      "--rm",
      DEFAULT_MYTHRIL_DOCKER_IMAGE,
      ...baseArgs
    ];
    const { code, stdout, stderr } = await runCommand(dockerBin, dockerArgs, {
      timeoutMs: (DEFAULT_MYTHRIL_TIMEOUT + 15) * 1000
    });
    return parseMythrilResult(dockerBin, code, stdout, stderr, "docker", options);
  } finally {
    await runCommand(dockerBin, ["rm", "-f", containerName]).catch(() => {});
  }
}

function sanitizeRelativePath(input, fallbackName) {
  const candidate = String(input || "").trim() || fallbackName;
  return normalizeSourcePath(candidate, fallbackName);
}

function shellEscape(value) {
  return `'${String(value).replaceAll("'", "'\"'\"'")}'`;
}

function detectPreferredSolcVersion(sourceCode) {
  const normalized = String(sourceCode || "");
  const pragmaMatch = normalized.match(/pragma\s+solidity\s+([^;]+);/i);
  if (!pragmaMatch) {
    return "";
  }

  const exactVersion = pragmaMatch[1].match(/(\d+\.\d+\.\d+)/);
  return exactVersion ? exactVersion[1] : "";
}

function hasSolidityDeclaration(content) {
  return /\b(contract|library|interface)\s+[A-Za-z_][A-Za-z0-9_]*/.test(String(content || ""));
}

function materializeSourceBundle(sourceCode, options = {}) {
  const tempDirRoot = path.join(getProjectRoot(), "data", "tmp", "slither");
  fs.mkdirSync(tempDirRoot, { recursive: true });
  const bundleDir = fs.mkdtempSync(path.join(tempDirRoot, "bundle-"));
  const fallbackName = sanitizeRelativePath(options.primarySourcePath, `${options.contractName || "Contract"}.sol`);
  const normalized = String(sourceCode || "");
  const lines = normalized.split(/\r?\n/);
  const marker = /^\/\/ File:\s+(.+)$/;
  const segments = [];
  let currentPath = "";
  let currentContent = [];

  for (const line of lines) {
    const match = line.match(marker);
    if (match) {
      if (currentPath) {
        segments.push({ sourcePath: currentPath, content: currentContent.join("\n") });
      }
      currentPath = sanitizeRelativePath(match[1], fallbackName);
      currentContent = [];
      continue;
    }
    currentContent.push(line);
  }

  if (currentPath) {
    segments.push({ sourcePath: currentPath, content: currentContent.join("\n") });
  }

  if (segments.length === 0) {
    segments.push({
      sourcePath: fallbackName,
      content: normalized
    });
  }

  for (const segment of segments) {
    const fullPath = path.join(bundleDir, segment.sourcePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `${segment.content.trimEnd()}\n`, "utf8");
  }

  const preferredTarget = sanitizeRelativePath(options.primarySourcePath, segments[0].sourcePath);
  const preferredSegment = segments.find((item) => item.sourcePath === preferredTarget);
  const declarationSegment = segments.find((item) => hasSolidityDeclaration(item.content));
  const targetPath = preferredSegment && hasSolidityDeclaration(preferredSegment.content)
    ? preferredSegment.sourcePath
    : declarationSegment?.sourcePath || preferredSegment?.sourcePath || segments[0].sourcePath;
  return {
    bundleDir,
    targetPath
  };
}

function removeBundle(bundleDir) {
  if (!bundleDir) {
    return;
  }
  fs.rmSync(bundleDir, { recursive: true, force: true });
}

async function ensureDockerImageAvailable(dockerBin, image) {
  const inspected = await runCommand(dockerBin, ["image", "inspect", image], {
    timeoutMs: 5000
  });
  if (inspected.code !== 0) {
    throw new Error(`${image} is not available locally. Build or pull the analyzer image before enabling this engine.`);
  }
}

async function tryRunSlitherDocker(sourceCode, options, dockerBin, image) {
  const { bundleDir, targetPath } = materializeSourceBundle(sourceCode, options);
  const outputPath = path.join(bundleDir, "slither-report.json");
  const containerName = `slither-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const containerWorkDir = "/tmp/slither-work";
  const containerTargetPath = path.posix.join(containerWorkDir, targetPath.replace(/\\/g, "/"));
  const containerOutputPath = path.posix.join(containerWorkDir, "slither-report.json");
  const preferredSolcVersion = detectPreferredSolcVersion(sourceCode);
  const bootstrapCommand = preferredSolcVersion
    ? `if ! command -v solc-select >/dev/null 2>&1 && command -v pip3 >/dev/null 2>&1; then pip3 install --quiet solc-select >/dev/null 2>&1; fi; if command -v solc-select >/dev/null 2>&1; then solc-select use ${shellEscape(preferredSolcVersion)} >/dev/null 2>&1 || (solc-select install ${shellEscape(preferredSolcVersion)} >/dev/null 2>&1 && solc-select use ${shellEscape(preferredSolcVersion)} >/dev/null 2>&1); fi; `
    : "";
  const analyzerCommand = `if command -v smart-slither >/dev/null 2>&1; then smart-slither ${shellEscape(containerTargetPath)} --json ${shellEscape(containerOutputPath)} --disable-color; else ${bootstrapCommand}slither ${shellEscape(containerTargetPath)} --json ${shellEscape(containerOutputPath)} --disable-color; fi`;

  try {
    const createdArgs = [
      "create",
      "--name",
      containerName
    ];
    if (DEFAULT_SLITHER_DOCKER_PLATFORM) {
      createdArgs.push("--platform", DEFAULT_SLITHER_DOCKER_PLATFORM);
    }
    createdArgs.push(
      image,
      "sh",
      "-lc",
      analyzerCommand
    );

    const created = await runCommand(dockerBin, createdArgs);
    if (created.code !== 0) {
      throw new Error(created.stderr.trim() || created.stdout.trim() || `${dockerBin} create failed`);
    }

    const copiedIn = await runCommand(dockerBin, ["cp", `${bundleDir}/.`, `${containerName}:${containerWorkDir}`]);
    if (copiedIn.code !== 0) {
      throw new Error(copiedIn.stderr.trim() || copiedIn.stdout.trim() || `${dockerBin} cp failed`);
    }

    const started = await runCommand(dockerBin, ["start", containerName]);
    if (started.code !== 0) {
      throw new Error(started.stderr.trim() || started.stdout.trim() || `${dockerBin} start failed`);
    }

    const waited = await runCommand(dockerBin, ["wait", containerName], {
      timeoutMs: DEFAULT_SLITHER_TIMEOUT * 1000
    });
    const exitCode = Number((waited.stdout || "").trim() || "1");
    const logs = await runCommand(dockerBin, ["logs", containerName]);
    const combinedLogs = `${logs.stdout || ""}\n${logs.stderr || ""}`.trim();

    const copiedOut = await runCommand(dockerBin, ["cp", `${containerName}:${containerOutputPath}`, outputPath]);
    if (copiedOut.code !== 0) {
      throw new Error(
        copiedOut.stderr.trim()
        || copiedOut.stdout.trim()
        || logs.stderr.trim()
        || logs.stdout.trim()
        || `${dockerBin} cp report failed`
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(
        logs.stderr.trim()
        || logs.stdout.trim()
        || "Slither did not produce a JSON report."
      );
    }

    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (payload?.success === false && exitCode !== 0) {
      throw new Error(payload?.error || combinedLogs || `slither container exited with code ${exitCode}`);
    }
    let issues = groupAnalyzerIssues("slither", collectSlitherIssues(payload));
    if (issues.length === 0 && /Detector:/i.test(combinedLogs)) {
      issues = groupAnalyzerIssues("slither", collectSlitherIssuesFromLogs(combinedLogs));
    }
    if (issues.length === 0 && /No contract was analyzed|Compilation warnings\/errors|check the correct compilation/i.test(combinedLogs)) {
      throw new Error(combinedLogs || "Slither could not compile the provided source.");
    }
    return {
      engine: "slither",
      title: "Slither source analysis",
      driver: "docker",
      mode: "source-static",
      status: "ok",
      issueCount: issues.length,
      ...(issues.length > 0
        ? withSummary("engine.reportedIssues", { engine: "Slither", issueCount: issues.length }, `Slither reported ${issues.length} issue(s).`)
        : withSummary("engine.noIssues", { engine: "Slither" }, "Slither completed without reporting issues.")),
      issues
    };
  } finally {
    await runCommand(dockerBin, ["rm", "-f", containerName]).catch(() => {});
    removeBundle(bundleDir);
  }
}

async function runSlither(options) {
  if (!options.sourceCode) {
    return {
      engine: "slither",
      title: "Slither source analysis",
      status: "skipped",
      mode: "source-static",
      issueCount: 0,
      ...withSummary("engine.skippedNoSource", { engine: "Slither" }, "Slither was skipped because verified source was not available."),
      issues: []
    };
  }

  const mode = resolveSlitherMode();
  if (mode === "off") {
    return {
      engine: "slither",
      title: "Slither source analysis",
      status: "disabled",
      mode: "source-static",
      issueCount: 0,
      ...withSummary("engine.disabled", { engine: "Slither" }, "Slither integration is disabled by AUDIT_SLITHER_MODE=off."),
      issues: []
    };
  }

  const errors = [];
  if (mode === "docker" || mode === "auto") {
    for (const dockerBin of getDockerBinaryCandidates()) {
      try {
        return await tryRunSlitherDocker(
          options.sourceCode,
          {
            contractName: options.contractName || "Contract",
            primarySourcePath: options.primarySourcePath || ""
          },
          dockerBin,
          process.env.AUDIT_SLITHER_DOCKER_IMAGE || DEFAULT_SLITHER_DOCKER_IMAGE
        );
      } catch (error) {
        errors.push(`docker(${dockerBin}): ${error.message}`);
        if (isCommandTimeout(error)) {
          break;
        }
      }
    }
  }

  return {
    engine: "slither",
    title: "Slither source analysis",
    status: "unavailable",
    mode: "source-static",
    issueCount: 0,
    ...withSummary(
      "engine.unavailable",
      { engine: "Slither", detail: errors[0] || "No runner is available." },
      `Slither could not be executed. ${errors[0] || "No runner is available."}`
    ),
    issues: []
  };
}

async function tryRunAderynDocker(sourceCode, options, dockerBin, image) {
  await ensureDockerImageAvailable(dockerBin, image);
  const { bundleDir } = materializeSourceBundle(sourceCode, options);
  const outputPath = path.join(bundleDir, "aderyn-report.json");
  const containerName = `aderyn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const containerWorkDir = "/tmp/aderyn-work";
  const containerOutputPath = path.posix.join(containerWorkDir, "aderyn-report.json");
  const analyzerCommand = [
    "aderyn",
    shellEscape(containerWorkDir),
    "--output",
    shellEscape(containerOutputPath)
  ].join(" ");

  try {
    const createdArgs = [
      "create",
      "--name",
      containerName
    ];
    if (DEFAULT_ADERYN_DOCKER_PLATFORM) {
      createdArgs.push("--platform", DEFAULT_ADERYN_DOCKER_PLATFORM);
    }
    createdArgs.push(image, "sh", "-lc", analyzerCommand);

    const created = await runCommand(dockerBin, createdArgs);
    if (created.code !== 0) {
      throw new Error(created.stderr.trim() || created.stdout.trim() || `${dockerBin} create failed`);
    }

    const copiedIn = await runCommand(dockerBin, ["cp", `${bundleDir}/.`, `${containerName}:${containerWorkDir}`]);
    if (copiedIn.code !== 0) {
      throw new Error(copiedIn.stderr.trim() || copiedIn.stdout.trim() || `${dockerBin} cp failed`);
    }

    const started = await runCommand(dockerBin, ["start", containerName]);
    if (started.code !== 0) {
      throw new Error(started.stderr.trim() || started.stdout.trim() || `${dockerBin} start failed`);
    }

    const waited = await runCommand(dockerBin, ["wait", containerName], {
      timeoutMs: DEFAULT_ADERYN_TIMEOUT * 1000
    });
    const exitCode = Number((waited.stdout || "").trim() || "1");
    const logs = await runCommand(dockerBin, ["logs", containerName]);
    const combinedLogs = `${logs.stdout || ""}\n${logs.stderr || ""}`.trim();

    const copiedOut = await runCommand(dockerBin, ["cp", `${containerName}:${containerOutputPath}`, outputPath]);
    if (copiedOut.code !== 0) {
      throw new Error(
        copiedOut.stderr.trim()
        || copiedOut.stdout.trim()
        || combinedLogs
        || `${dockerBin} cp report failed`
      );
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error(combinedLogs || "Aderyn did not produce a JSON report.");
    }

    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    if (payload?.success === false && exitCode !== 0) {
      throw new Error(payload?.error || combinedLogs || `aderyn container exited with code ${exitCode}`);
    }

    const issues = groupAnalyzerIssues("aderyn", collectAderynIssues(payload));
    return {
      engine: "aderyn",
      title: "Aderyn source analysis",
      driver: "docker",
      mode: "source-static",
      status: "ok",
      issueCount: issues.length,
      ...(issues.length > 0
        ? withSummary("engine.reportedIssues", { engine: "Aderyn", issueCount: issues.length }, `Aderyn reported ${issues.length} issue(s).`)
        : withSummary("engine.noIssues", { engine: "Aderyn" }, "Aderyn completed without reporting issues.")),
      issues
    };
  } finally {
    await runCommand(dockerBin, ["rm", "-f", containerName]).catch(() => {});
    removeBundle(bundleDir);
  }
}

async function runAderyn(options) {
  if (!options.sourceCode) {
    return {
      engine: "aderyn",
      title: "Aderyn source analysis",
      status: "skipped",
      mode: "source-static",
      issueCount: 0,
      ...withSummary("engine.skippedNoSource", { engine: "Aderyn" }, "Aderyn was skipped because verified source was not available."),
      issues: []
    };
  }

  const mode = resolveAderynMode();
  if (mode === "off") {
    return {
      engine: "aderyn",
      title: "Aderyn source analysis",
      status: "disabled",
      mode: "source-static",
      issueCount: 0,
      ...withSummary("engine.disabled", { engine: "Aderyn" }, "Aderyn integration is disabled by AUDIT_ADERYN_MODE=off."),
      issues: []
    };
  }

  const errors = [];
  if (mode === "docker" || mode === "auto") {
    for (const dockerBin of getDockerBinaryCandidates()) {
      try {
        return await tryRunAderynDocker(
          options.sourceCode,
          {
            contractName: options.contractName || "Contract",
            primarySourcePath: options.primarySourcePath || ""
          },
          dockerBin,
          process.env.AUDIT_ADERYN_DOCKER_IMAGE || DEFAULT_ADERYN_DOCKER_IMAGE
        );
      } catch (error) {
        errors.push(`docker(${dockerBin}): ${error.message}`);
        if (isCommandTimeout(error)) {
          break;
        }
      }
    }
  }

  return {
    engine: "aderyn",
    title: "Aderyn source analysis",
    status: "unavailable",
    mode: "source-static",
    issueCount: 0,
    ...withSummary(
      "engine.unavailable",
      { engine: "Aderyn", detail: errors[0] || "No runner is available." },
      `Aderyn could not be executed. ${errors[0] || "No runner is available."}`
    ),
    issues: []
  };
}

async function runMythril(address, options) {
  if (!options.rpcUrl || !options.chainId) {
    return {
      engine: "mythril",
      title: "Mythril bytecode analysis",
      status: "skipped",
      mode: "address-rpc-bytecode",
      issueCount: 0,
      ...withSummary("engine.skippedNoRpc", { engine: "Mythril" }, "Mythril was skipped because no RPC endpoint was available for the resolved chain."),
      issues: []
    };
  }

  const mode = resolveMythrilMode();
  if (mode === "off") {
    return {
      engine: "mythril",
      title: "Mythril bytecode analysis",
      status: "disabled",
      mode: "address-rpc-bytecode",
      issueCount: 0,
      ...withSummary("engine.disabled", { engine: "Mythril" }, "Mythril integration is disabled by AUDIT_MYTHRIL_MODE=off."),
      issues: []
    };
  }

  if (DEFAULT_MYTHRIL_MAX_BYTECODE_BYTES > 0 && Number(options.bytecodeSize || 0) > DEFAULT_MYTHRIL_MAX_BYTECODE_BYTES) {
    return {
      engine: "mythril",
      title: "Mythril bytecode analysis",
      status: "skipped",
      mode: "address-rpc-bytecode",
      issueCount: 0,
      ...withSummary(
        "engine.skippedLargeBytecode",
        {
          engine: "Mythril",
          bytecodeSize: options.bytecodeSize,
          maxBytecodeSize: DEFAULT_MYTHRIL_MAX_BYTECODE_BYTES
        },
        `Mythril was skipped because bytecode size ${options.bytecodeSize} exceeds AUDIT_MYTHRIL_MAX_BYTECODE_BYTES=${DEFAULT_MYTHRIL_MAX_BYTECODE_BYTES}.`
      ),
      issues: []
    };
  }

  const rpcUrl = new URL(options.rpcUrl);
  const rpcTarget = `${rpcUrl.hostname}:${rpcUrl.port || (rpcUrl.protocol === "https:" ? "443" : "80")}`;
  const rpcTls = rpcUrl.protocol === "https:" ? "True" : "False";

  const baseArgs = [
    "analyze",
    "-a",
    address,
    "--rpc",
    rpcTarget,
    "--rpctls",
    rpcTls,
    "--execution-timeout",
    String(DEFAULT_MYTHRIL_TIMEOUT),
    "-o",
    "jsonv2"
  ];

  const errors = [];
  if (mode === "binary" || mode === "auto") {
    for (const binary of getMythrilBinaryCandidates()) {
      try {
        return await tryRunMythril(binary, baseArgs, "binary", options);
      } catch (error) {
        errors.push(`binary(${binary}): ${error.message}`);
      }
    }
  }

  if (mode === "docker" || mode === "auto") {
    for (const dockerBin of getDockerBinaryCandidates()) {
      try {
        return await tryRunMythrilDocker(dockerBin, baseArgs, options);
      } catch (error) {
        errors.push(`docker(${dockerBin}): ${error.message}`);
        if (isCommandTimeout(error)) {
          break;
        }
      }
    }
  }

  return {
    engine: "mythril",
    title: "Mythril bytecode analysis",
    status: "unavailable",
    mode: "address-rpc-bytecode",
    issueCount: 0,
    ...withSummary(
      "engine.unavailable",
      { engine: "Mythril", detail: errors[0] || "No runner is available." },
      `Mythril could not be executed. ${errors[0] || "No runner is available."}`
    ),
    issues: []
  };
}

export async function runExternalSourceAnalyses(options = {}) {
  const sourceOptions = {
    sourceCode: options.sourceCode || "",
    contractName: options.contractName || "",
    primarySourcePath: options.primarySourcePath || ""
  };
  const [slither, aderyn] = await Promise.all([
    withDuration(runSlither(sourceOptions)),
    withDuration(runAderyn(sourceOptions))
  ]);

  return [
    {
      ...slither,
      chainId: options.chainId || null
    },
    {
      ...aderyn,
      chainId: options.chainId || null
    }
  ];
}

export async function runExternalAddressAnalyses(address, options = {}) {
  const [sourceAnalyses, mythril] = await Promise.all([
    runExternalSourceAnalyses({
      sourceCode: options.sourceCode || "",
      contractName: options.contractName || "",
      primarySourcePath: options.primarySourcePath || "",
      chainId: options.chainId || null
    }),
    withDuration(runMythril(address, options))
  ]);

  return [
    ...sourceAnalyses,
    {
      ...mythril,
      chainId: options.chainId || null
    }
  ];
}
