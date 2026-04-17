import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRpcMessage } from "../src/mcp-service.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Validation intentionally checks both custom transports and official SDK
// transports so CI catches regressions in either integration surface.
const filesToCheck = [
  "bin/smart-contract-audit-mcp.js",
  "public/app.js",
  "public/client.js",
  "scripts/audit-address.js",
  "scripts/benchmark-engines.js",
  "scripts/demo-client.js",
  "src/analyzer.js",
  "src/audit-queue.js",
  "src/audit-store.js",
  "src/audit-worker.js",
  "src/dashboard-api.js",
  "src/external-analyzers.js",
  "src/http-server.js",
  "src/knowledge-base.js",
  "src/mcp-service.js",
  "src/protocol.js",
  "src/sdk-http-server.js",
  "src/sdk-server.js",
  "src/sdk-shared.js",
  "src/sdk-stdio-server.js",
  "src/server.js",
  "src/verified-source.js"
];

function runCommand(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
      ...options
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
      if (code !== 0) {
        reject(new Error(`Command failed: node ${args.join(" ")}\n${stderr || stdout}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function checkSyntax() {
  for (const file of filesToCheck) {
    await runCommand(["--check", file]);
  }
}

async function validateAuditStore() {
  const auditStore = await import(`../src/audit-store.js?audit=${Date.now()}`);
  const created = await auditStore.createAuditJob({
    inputType: "address",
    target: "0x0000000000000000000000000000000000000001",
    chainId: 1,
    contractType: "general"
  });

  if (created.status !== "queued") {
    throw new Error(`Expected created audit job status to be queued, got ${created.status}.`);
  }

  const workerId = `validate-worker-${Date.now()}`;
  await auditStore.registerWorker({
    workerId,
    pid: process.pid,
    concurrency: 1,
    status: "idle"
  });

  const running = await auditStore.claimNextQueuedJob(workerId, 30000);
  if (running?.status !== "running") {
    throw new Error("claimNextQueuedJob did not persist running status.");
  }

  await auditStore.heartbeatRunningJob(created.id, workerId, 30000);

  const retried = await auditStore.requeueAuditJob(created.id, workerId, "retry me", 0);
  if (retried?.status !== "queued") {
    throw new Error("requeueAuditJob did not move the job back to queued.");
  }

  const runningAgain = await auditStore.claimNextQueuedJob(workerId, 30000);
  if (runningAgain?.status !== "running") {
    throw new Error("claimNextQueuedJob did not re-claim the queued job.");
  }

  const succeeded = await auditStore.markAuditJobSucceeded(created.id, workerId, {
    summary: "Validation summary",
    analysisMode: "source-only",
    findings: []
  });

  if (succeeded?.status !== "succeeded") {
    throw new Error("markAuditJobSucceeded did not persist succeeded status.");
  }

  if (succeeded?.result?.summary !== "Validation summary") {
    throw new Error("markAuditJobSucceeded did not store result JSON.");
  }

  await auditStore.unregisterWorker(workerId);
}

async function validateAddressAuditWithBytecodeFallback() {
  const originalFetch = globalThis.fetch;
  const originalRpcUrls = process.env.AUDIT_RPC_URLS;
  const originalMythrilMode = process.env.AUDIT_MYTHRIL_MODE;
  const targetAddress = "0x1234567890abcdef1234567890abcdef12345678";

  process.env.AUDIT_RPC_URLS = "1=https://rpc.example";
  process.env.AUDIT_MYTHRIL_MODE = "off";

  globalThis.fetch = async (url, options = {}) => {
    const asString = String(url);

    if (asString.startsWith("https://repo.sourcify.dev/")) {
      return new Response("not found", { status: 404 });
    }

    if (asString === "https://rpc.example") {
      const request = JSON.parse(options.body);
      if (request.method === "eth_getCode") {
        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: "0x60006000556001600055"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: "0x"
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("not found", { status: 404 });
  };

  try {
    const { auditAddress } = await import(`../src/analyzer.js?bytecode=${Date.now()}`);
    const result = await auditAddress(targetAddress, { chainId: 1 });

    if (result.analysisMode !== "bytecode-only") {
      throw new Error(`Expected bytecode-only analysis mode, got ${result.analysisMode}.`);
    }

    if (result.bytecodeSize <= 0) {
      throw new Error("Expected bytecode-only audit to include bytecodeSize.");
    }

    if (!Array.isArray(result.externalAnalyses) || result.externalAnalyses.length === 0) {
      throw new Error("Expected bytecode-only audit to include externalAnalyses.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalRpcUrls === "undefined") {
      delete process.env.AUDIT_RPC_URLS;
    } else {
      process.env.AUDIT_RPC_URLS = originalRpcUrls;
    }
    if (typeof originalMythrilMode === "undefined") {
      delete process.env.AUDIT_MYTHRIL_MODE;
    } else {
      process.env.AUDIT_MYTHRIL_MODE = originalMythrilMode;
    }
  }
}

async function validateCustomRpc() {
  const init = await handleRpcMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "validate-script", version: "0.1.0" }
    }
  });

  if (init?.result?.serverInfo?.name !== "smart-contract-audit-demo") {
    throw new Error("Custom initialize response did not return the expected server name.");
  }

  const tools = await handleRpcMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  });

  const toolNames = tools?.result?.tools?.map((tool) => tool.name) || [];
  if (!toolNames.includes("audit_contract_address")) {
    throw new Error("Custom RPC tools/list did not include audit_contract_address.");
  }
}

async function validateSdkStdio() {
  const child = spawn(process.execPath, ["src/sdk-stdio-server.js"], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "inherit"]
  });

  let buffer = "";
  const messages = [];

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      messages.push(JSON.parse(line));
    }
  });

  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "validate-script", version: "0.1.0" }
    }
  })}\n`);

  const waitForMessage = async (id) => {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const message = messages.find((item) => item.id === id);
      if (message) {
        return message;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Timed out waiting for SDK stdio response id=${id}.`);
  };

  const initialize = await waitForMessage(1);
  if (initialize?.result?.serverInfo?.name !== "smart-contract-audit-demo") {
    child.kill("SIGTERM");
    throw new Error("SDK stdio initialize response did not return the expected server name.");
  }

  child.stdin.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "generate_audit_checklist",
      arguments: {
        projectType: "lending"
      }
    }
  })}\n`);

  const checklist = await waitForMessage(2);
  child.kill("SIGTERM");
  await once(child, "close");

  const structured = checklist?.result?.structuredContent;
  if (!structured?.checklist?.includes("Review oracle and admin control surfaces.")) {
    throw new Error("SDK stdio tool call did not return the expected lending checklist content.");
  }
}

async function validateExplorerFallback() {
  // Mock Sourcify miss + Etherscan hit to ensure fallback order remains stable.
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.AUDIT_ETHERSCAN_API_KEY;
  const originalBaseUrl = process.env.AUDIT_ETHERSCAN_BASE_URL;

  process.env.AUDIT_ETHERSCAN_API_KEY = "test-key";
  process.env.AUDIT_ETHERSCAN_BASE_URL = "https://etherscan.example/api";

  globalThis.fetch = async (url) => {
    const asString = String(url);

    if (asString.startsWith("https://repo.sourcify.dev/")) {
      return new Response("not found", { status: 404 });
    }

    if (asString.startsWith("https://etherscan.example/api")) {
      return new Response(JSON.stringify({
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "{{\"language\":\"Solidity\",\"sources\":{\"contracts/Demo.sol\":{\"content\":\"pragma solidity ^0.8.20; contract Demo { function setAdmin(address next) external {} }\"}},\"settings\":{\"compilationTarget\":{\"contracts/Demo.sol\":\"Demo\"}}}}",
            ABI: "[]",
            ContractName: "Demo",
            CompilerVersion: "v0.8.20+commit.demo",
            ContractFileName: "contracts/Demo.sol"
          }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("not found", { status: 404 });
  };

  try {
    const { fetchVerifiedContractSource } = await import(`../src/verified-source.js?validate=${Date.now()}`);
    const contract = await fetchVerifiedContractSource("0x1234567890abcdef1234567890abcdef12345678", { chainId: 1 });
    if (contract.sourceRepository !== "etherscan") {
      throw new Error(`Expected explorer fallback to use etherscan, got ${contract.sourceRepository || "unknown"}.`);
    }
    if (!contract.sourceFiles.includes("contracts/Demo.sol")) {
      throw new Error("Explorer fallback did not parse standard-json source files correctly.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_API_KEY;
    } else {
      process.env.AUDIT_ETHERSCAN_API_KEY = originalApiKey;
    }
    if (typeof originalBaseUrl === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_BASE_URL;
    } else {
      process.env.AUDIT_ETHERSCAN_BASE_URL = originalBaseUrl;
    }
  }
}

async function validateProxyExplorerFallback() {
  // Explorer-supplied proxy metadata should redirect the audit target to the
  // implementation contract while preserving the original proxy address.
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.AUDIT_ETHERSCAN_API_KEY;
  const originalBaseUrl = process.env.AUDIT_ETHERSCAN_BASE_URL;

  process.env.AUDIT_ETHERSCAN_API_KEY = "test-key";
  process.env.AUDIT_ETHERSCAN_BASE_URL = "https://etherscan.example/api";

  globalThis.fetch = async (url) => {
    const asString = String(url);

    if (asString.startsWith("https://repo.sourcify.dev/")) {
      return new Response("not found", { status: 404 });
    }

    if (asString.includes("address=0x9999999999999999999999999999999999999999")) {
      return new Response(JSON.stringify({
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "pragma solidity ^0.8.20; contract ProxyShell {}",
            ABI: "[]",
            ContractName: "ProxyShell",
            CompilerVersion: "v0.8.20+commit.demo",
            ContractFileName: "contracts/ProxyShell.sol",
            Proxy: "1",
            Implementation: "0x8888888888888888888888888888888888888888"
          }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (asString.includes("address=0x8888888888888888888888888888888888888888")) {
      return new Response(JSON.stringify({
        status: "1",
        message: "OK",
        result: [
          {
            SourceCode: "{{\"language\":\"Solidity\",\"sources\":{\"contracts/Implementation.sol\":{\"content\":\"pragma solidity ^0.8.20; contract Implementation { function setAdmin(address next) external {} }\"}},\"settings\":{\"compilationTarget\":{\"contracts/Implementation.sol\":\"Implementation\"}}}}",
            ABI: "[]",
            ContractName: "Implementation",
            CompilerVersion: "v0.8.20+commit.demo",
            ContractFileName: "contracts/Implementation.sol",
            Proxy: "0",
            Implementation: ""
          }
        ]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("not found", { status: 404 });
  };

  try {
    const { fetchVerifiedContractSource } = await import(`../src/verified-source.js?proxy-validate=${Date.now()}`);
    const contract = await fetchVerifiedContractSource("0x9999999999999999999999999999999999999999", { chainId: 1 });
    if (!contract.isProxy) {
      throw new Error("Expected explorer proxy fallback to flag the contract as a proxy.");
    }
    if (contract.proxyAddress !== "0x9999999999999999999999999999999999999999") {
      throw new Error("Proxy fallback did not preserve the requested proxy address.");
    }
    if (contract.implementationAddress !== "0x8888888888888888888888888888888888888888") {
      throw new Error("Proxy fallback did not expose the implementation address.");
    }
    if (contract.sourceAddress !== "0x8888888888888888888888888888888888888888") {
      throw new Error("Proxy fallback did not analyze the implementation source address.");
    }
    if (!contract.sourceFiles.includes("contracts/Implementation.sol")) {
      throw new Error("Proxy fallback did not return implementation source files.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_API_KEY;
    } else {
      process.env.AUDIT_ETHERSCAN_API_KEY = originalApiKey;
    }
    if (typeof originalBaseUrl === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_BASE_URL;
    } else {
      process.env.AUDIT_ETHERSCAN_BASE_URL = originalBaseUrl;
    }
  }
}

async function validateProxyAnalysisTargetConsistency() {
  // Once verified source resolves a proxy implementation, bytecode fetching and
  // address-based external analysis must follow the same implementation target.
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.AUDIT_ETHERSCAN_API_KEY;
  const originalBaseUrl = process.env.AUDIT_ETHERSCAN_BASE_URL;
  const originalRpcUrls = process.env.AUDIT_RPC_URLS;
  const originalSlitherMode = process.env.AUDIT_SLITHER_MODE;
  const originalMythrilMode = process.env.AUDIT_MYTHRIL_MODE;
  const activeExplorerBaseUrl = process.env.AUDIT_ETHERSCAN_BASE_URL || "https://api.etherscan.io/v2/api";

  process.env.AUDIT_ETHERSCAN_API_KEY = "test-key";
  process.env.AUDIT_RPC_URLS = "1=https://rpc.example";
  process.env.AUDIT_SLITHER_MODE = "off";
  process.env.AUDIT_MYTHRIL_MODE = "off";

  globalThis.fetch = async (url, init = {}) => {
    const asString = String(url);
    const requestedAddress = asString.startsWith(activeExplorerBaseUrl)
      ? new URL(asString).searchParams.get("address")?.toLowerCase()
      : "";

    if (asString.startsWith("https://repo.sourcify.dev/")) {
      return new Response("not found", { status: 404 });
    }

    if (asString.startsWith(activeExplorerBaseUrl)) {
      if (requestedAddress === "0x5555555555555555555555555555555555555555") {
        return new Response(JSON.stringify({
          status: "1",
          message: "OK",
          result: [
            {
              SourceCode: "pragma solidity ^0.8.20; contract ProxyFacade {}",
              ABI: "[]",
              ContractName: "ProxyFacade",
              CompilerVersion: "v0.8.20+commit.demo",
              ContractFileName: "contracts/ProxyFacade.sol",
              Proxy: "1",
              Implementation: "0x4444444444444444444444444444444444444444"
            }
          ]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (requestedAddress === "0x4444444444444444444444444444444444444444") {
        return new Response(JSON.stringify({
          status: "1",
          message: "OK",
          result: [
            {
              SourceCode: "{{\"language\":\"Solidity\",\"sources\":{\"contracts/AlignedImplementation.sol\":{\"content\":\"pragma solidity ^0.8.20; contract AlignedImplementation { uint256 public value; function set(uint256 next) external { value = next; } }\"}},\"settings\":{\"compilationTarget\":{\"contracts/AlignedImplementation.sol\":\"AlignedImplementation\"}}}}",
              ABI: "[]",
              ContractName: "AlignedImplementation",
              CompilerVersion: "v0.8.20+commit.demo",
              ContractFileName: "contracts/AlignedImplementation.sol",
              Proxy: "0",
              Implementation: ""
            }
          ]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }

    if (asString === "https://rpc.example" && init.method === "POST") {
      const body = JSON.parse(init.body);
      if (body.method === "eth_getCode") {
        const [targetAddress] = body.params;
        if (targetAddress === "0x4444444444444444444444444444444444444444") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: "0x60006000556001600055"
          }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: "0x"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }

    return new Response("not found", { status: 404 });
  };

  try {
    const { auditAddress } = await import(`../src/analyzer.js?proxy-target=${Date.now()}`);
    const result = await auditAddress("0x5555555555555555555555555555555555555555", { chainId: 1 });

    if (result.analysisAddress !== "0x4444444444444444444444444444444444444444") {
      throw new Error(`Expected analysis target to switch to implementation address, got ${result.analysisAddress || "unknown"}.`);
    }

    if (result.bytecodeAddress !== "0x4444444444444444444444444444444444444444") {
      throw new Error(`Expected bytecode fetch to target implementation address, got ${result.bytecodeAddress || "unknown"}.`);
    }

    if (result.proxyAddress !== "0x5555555555555555555555555555555555555555") {
      throw new Error("Expected proxy address to remain the originally requested address.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_API_KEY;
    } else {
      process.env.AUDIT_ETHERSCAN_API_KEY = originalApiKey;
    }
    if (typeof originalBaseUrl === "undefined") delete process.env.AUDIT_ETHERSCAN_BASE_URL;
    else process.env.AUDIT_ETHERSCAN_BASE_URL = originalBaseUrl;
    if (typeof originalRpcUrls === "undefined") {
      delete process.env.AUDIT_RPC_URLS;
    } else {
      process.env.AUDIT_RPC_URLS = originalRpcUrls;
    }
    if (typeof originalSlitherMode === "undefined") {
      delete process.env.AUDIT_SLITHER_MODE;
    } else {
      process.env.AUDIT_SLITHER_MODE = originalSlitherMode;
    }
    if (typeof originalMythrilMode === "undefined") {
      delete process.env.AUDIT_MYTHRIL_MODE;
    } else {
      process.env.AUDIT_MYTHRIL_MODE = originalMythrilMode;
    }
  }
}

async function validateRpcProxyFallback() {
  // When explorer metadata is incomplete, RPC slot inspection should still be
  // able to resolve a standard EIP-1967 proxy implementation.
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.AUDIT_ETHERSCAN_API_KEY;
  const originalBaseUrl = process.env.AUDIT_ETHERSCAN_BASE_URL;
  const originalRpcUrls = process.env.AUDIT_RPC_URLS;

  process.env.AUDIT_ETHERSCAN_API_KEY = "test-key";
  process.env.AUDIT_ETHERSCAN_BASE_URL = "https://etherscan.example/api";
  process.env.AUDIT_RPC_URLS = "1=https://rpc.example";

  globalThis.fetch = async (url, init = {}) => {
    const asString = String(url);

    if (asString.startsWith("https://repo.sourcify.dev/")) {
      return new Response("not found", { status: 404 });
    }

    if (asString.startsWith("https://etherscan.example/api")) {
      if (asString.includes("address=0x7777777777777777777777777777777777777777")) {
        return new Response(JSON.stringify({
          status: "1",
          message: "OK",
          result: [
            {
              SourceCode: "pragma solidity ^0.8.20; contract ProxyShellWithoutMetadata {}",
              ABI: "[]",
              ContractName: "ProxyShellWithoutMetadata",
              CompilerVersion: "v0.8.20+commit.demo",
              ContractFileName: "contracts/ProxyShellWithoutMetadata.sol",
              Proxy: "0",
              Implementation: ""
            }
          ]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }

      if (asString.includes("address=0x6666666666666666666666666666666666666666")) {
        return new Response(JSON.stringify({
          status: "1",
          message: "OK",
          result: [
            {
              SourceCode: "{{\"language\":\"Solidity\",\"sources\":{\"contracts/RpcImplementation.sol\":{\"content\":\"pragma solidity ^0.8.20; contract RpcImplementation { function setAdmin(address next) external {} }\"}},\"settings\":{\"compilationTarget\":{\"contracts/RpcImplementation.sol\":\"RpcImplementation\"}}}}",
              ABI: "[]",
              ContractName: "RpcImplementation",
              CompilerVersion: "v0.8.20+commit.demo",
              ContractFileName: "contracts/RpcImplementation.sol",
              Proxy: "0",
              Implementation: ""
            }
          ]
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }

    if (asString === "https://rpc.example" && init.method === "POST") {
      const body = JSON.parse(init.body);
      if (body.method === "eth_getStorageAt") {
        const [targetAddress, slot] = body.params;
        if (targetAddress === "0x7777777777777777777777777777777777777777" &&
          slot === "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc") {
          return new Response(JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: "0x0000000000000000000000006666666666666666666666666666666666666666"
          }), {
            status: 200,
            headers: { "content-type": "application/json" }
          });
        }

        return new Response(JSON.stringify({
          jsonrpc: "2.0",
          id: body.id,
          result: "0x0000000000000000000000000000000000000000000000000000000000000000"
        }), {
          status: 200,
          headers: { "content-type": "application/json" }
        });
      }
    }

    return new Response("not found", { status: 404 });
  };

  try {
    const { fetchVerifiedContractSource } = await import(`../src/verified-source.js?rpc-proxy-validate=${Date.now()}`);
    const contract = await fetchVerifiedContractSource("0x7777777777777777777777777777777777777777", { chainId: 1 });
    if (!contract.isProxy) {
      throw new Error("Expected RPC proxy fallback to flag the contract as a proxy.");
    }
    if (contract.proxyDetection !== "rpc-eip1967-implementation-slot") {
      throw new Error(`Expected RPC proxy detection type to be implementation slot, got ${contract.proxyDetection || "unknown"}.`);
    }
    if (contract.implementationAddress !== "0x6666666666666666666666666666666666666666") {
      throw new Error("RPC proxy fallback did not expose the implementation address.");
    }
    if (contract.sourceAddress !== "0x6666666666666666666666666666666666666666") {
      throw new Error("RPC proxy fallback did not analyze the implementation source address.");
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (typeof originalApiKey === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_API_KEY;
    } else {
      process.env.AUDIT_ETHERSCAN_API_KEY = originalApiKey;
    }
    if (typeof originalBaseUrl === "undefined") {
      delete process.env.AUDIT_ETHERSCAN_BASE_URL;
    } else {
      process.env.AUDIT_ETHERSCAN_BASE_URL = originalBaseUrl;
    }
    if (typeof originalRpcUrls === "undefined") {
      delete process.env.AUDIT_RPC_URLS;
    } else {
      process.env.AUDIT_RPC_URLS = originalRpcUrls;
    }
  }
}

async function main() {
  await checkSyntax();
  await validateAuditStore();
  await validateAddressAuditWithBytecodeFallback();
  await validateCustomRpc();
  await validateSdkStdio();
  await validateExplorerFallback();
  await validateProxyExplorerFallback();
  await validateProxyAnalysisTargetConsistency();
  await validateRpcProxyFallback();
  process.stdout.write("Validation passed.\n");
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
