import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getProjectRoot } from "./knowledge-base.js";

const DEFAULT_DOCKER_BIN = process.env.AUDIT_DOCKER_BIN || "docker";
const DEFAULT_MYTHRIL_DOCKER_IMAGE = process.env.AUDIT_MYTHRIL_DOCKER_IMAGE || "mythril/myth";
const DEFAULT_MYTHRIL_TIMEOUT = Number(process.env.AUDIT_MYTHRIL_TIMEOUT || 90);
const DEFAULT_SLITHER_DOCKER_IMAGE = process.env.AUDIT_SLITHER_DOCKER_IMAGE || "trailofbits/slither";

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

function runCommand(command, args) {
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

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
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
    title: issue?.title || issue?.shortDescription?.headline || issue?.description?.headline || issue?.check || "Unnamed issue",
    severity: normalizeSeverity(issue?.severity),
    description: issue?.description?.tail || issue?.description || issue?.longDescription || issue?.extra?.description || "",
    functionName: issue?.function || issue?.functionName || "",
    pc: Number.isFinite(Number(issue?.address)) ? Number(issue.address) : null
  }));
}

function collectSlitherIssues(payload) {
  const detectors = payload?.results?.detectors;
  if (!Array.isArray(detectors)) {
    return [];
  }
  return detectors.map((detector) => {
    const firstElement = Array.isArray(detector?.elements) && detector.elements.length > 0 ? detector.elements[0] : null;
    return {
      swcId: "",
      title: detector?.check || detector?.title || "Unnamed detector",
      severity: normalizeSeverity(detector?.impact || detector?.severity || detector?.confidence),
      description: detector?.description || detector?.markdown || "",
      functionName: firstElement?.name || "",
      pc: null
    };
  });
}

async function tryRunMythril(command, args, driver) {
  const { code, stdout, stderr } = await runCommand(command, args);

  try {
    const payload = JSON.parse(stdout);
    const issues = collectMythrilIssues(payload);
    return {
      engine: "mythril",
      title: "Mythril bytecode analysis",
      driver,
      mode: "address-rpc-bytecode",
      status: "ok",
      issueCount: issues.length,
      summary: issues.length > 0 ? `Mythril reported ${issues.length} issue(s).` : "Mythril completed without reporting issues.",
      issues
    };
  } catch (error) {
    if (code !== 0) {
      throw new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`);
    }
    throw new Error(`Mythril returned non-JSON output: ${error.message}`);
  }
}

function sanitizeRelativePath(input, fallbackName) {
  const candidate = String(input || "").trim() || fallbackName;
  const normalized = path.posix.normalize(candidate.replace(/\\/g, "/")).replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("..")) {
    return fallbackName;
  }
  return normalized;
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
  const targetPath = segments.some((item) => item.sourcePath === preferredTarget)
    ? preferredTarget
    : segments[0].sourcePath;
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

async function tryRunSlitherDocker(sourceCode, options, dockerBin, image) {
  const { bundleDir, targetPath } = materializeSourceBundle(sourceCode, options);
  const outputPath = path.join(bundleDir, "slither-report.json");
  const containerName = `slither-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const containerWorkDir = "/tmp/slither-work";
  const containerTargetPath = path.posix.join(containerWorkDir, targetPath.replace(/\\/g, "/"));
  const containerOutputPath = path.posix.join(containerWorkDir, "slither-report.json");

  try {
    const created = await runCommand(dockerBin, [
      "create",
      "--name",
      containerName,
      image,
      "slither",
      containerTargetPath,
      "--json",
      containerOutputPath,
      "--disable-color"
    ]);
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

    const waited = await runCommand(dockerBin, ["wait", containerName]);
    const exitCode = Number((waited.stdout || "").trim() || "1");
    if (exitCode !== 0) {
      const logs = await runCommand(dockerBin, ["logs", containerName]);
      throw new Error(
        logs.stderr.trim()
        || logs.stdout.trim()
        || `slither container exited with code ${exitCode}`
      );
    }

    const copiedOut = await runCommand(dockerBin, ["cp", `${containerName}:${containerOutputPath}`, outputPath]);
    if (copiedOut.code !== 0) {
      throw new Error(copiedOut.stderr.trim() || copiedOut.stdout.trim() || `${dockerBin} cp report failed`);
    }

    if (!fs.existsSync(outputPath)) {
      throw new Error("Slither did not produce a JSON report.");
    }

    const payload = JSON.parse(fs.readFileSync(outputPath, "utf8"));
    const issues = collectSlitherIssues(payload);
    return {
      engine: "slither",
      title: "Slither source analysis",
      driver: "docker",
      mode: "source-static",
      status: "ok",
      issueCount: issues.length,
      summary: issues.length > 0 ? `Slither reported ${issues.length} issue(s).` : "Slither completed without reporting issues.",
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
      summary: "Slither was skipped because verified source was not available.",
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
      summary: "Slither integration is disabled by AUDIT_SLITHER_MODE=off.",
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
      }
    }
  }

  return {
    engine: "slither",
    title: "Slither source analysis",
    status: "unavailable",
    mode: "source-static",
    issueCount: 0,
    summary: `Slither could not be executed. ${errors[0] || "No runner is available."}`,
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
      summary: "Mythril was skipped because no RPC endpoint was available for the resolved chain.",
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
      summary: "Mythril integration is disabled by AUDIT_MYTHRIL_MODE=off.",
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
        return await tryRunMythril(binary, baseArgs, "binary");
      } catch (error) {
        errors.push(`binary(${binary}): ${error.message}`);
      }
    }
  }

  if (mode === "docker" || mode === "auto") {
    const dockerArgs = ["run", "--rm", DEFAULT_MYTHRIL_DOCKER_IMAGE, ...baseArgs];
    for (const dockerBin of getDockerBinaryCandidates()) {
      try {
        return await tryRunMythril(dockerBin, dockerArgs, "docker");
      } catch (error) {
        errors.push(`docker(${dockerBin}): ${error.message}`);
      }
    }
  }

  return {
    engine: "mythril",
    title: "Mythril bytecode analysis",
    status: "unavailable",
    mode: "address-rpc-bytecode",
    issueCount: 0,
    summary: `Mythril could not be executed. ${errors[0] || "No runner is available."}`,
    issues: []
  };
}

export async function runExternalAddressAnalyses(address, options = {}) {
  const [slither, mythril] = await Promise.all([
    runSlither({
      sourceCode: options.sourceCode || "",
      contractName: options.contractName || "",
      primarySourcePath: options.primarySourcePath || ""
    }),
    runMythril(address, options)
  ]);
  return [
    {
      ...slither,
      chainId: options.chainId || null
    },
    {
      ...mythril,
      chainId: options.chainId || null
    }
  ];
}
