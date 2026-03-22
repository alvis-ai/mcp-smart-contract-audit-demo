import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Demo client talks to the custom stdio server directly so repository users can
// see the raw MCP JSON-RPC exchange without needing an IDE host.
const child = spawn("node", ["src/server.js"], {
  cwd: projectRoot,
  stdio: ["pipe", "pipe", "inherit"]
});

let nextId = 1;
const pending = new Map();

child.stdout.on("data", (chunk) => {
  const lines = chunk.toString().trim().split("\n").filter(Boolean);
  for (const line of lines) {
    const message = JSON.parse(line);
    if (typeof message.id !== "undefined" && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else {
      console.log("notification", message);
    }
  }
});

function request(method, params = {}) {
  const id = nextId++;
  const payload = {
    jsonrpc: "2.0",
    id,
    method,
    params
  };
  child.stdin.write(`${JSON.stringify(payload)}\n`);
  return new Promise((resolve) => pending.set(id, resolve));
}

async function main() {
  const init = await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: {
      name: "demo-client",
      version: "0.1.0"
    }
  });
  console.log("\n== initialize ==\n", JSON.stringify(init, null, 2));

  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);

  const tools = await request("tools/list");
  console.log("\n== tools/list ==\n", JSON.stringify(tools, null, 2));

  const audit = await request("tools/call", {
    name: "audit_contract_file",
    arguments: {
      path: "samples/PowerLaunchPad.sol",
      contractType: "launchpad"
    }
  });
  console.log("\n== audit_contract_file ==\n", JSON.stringify(audit, null, 2));

  if (process.env.DEMO_CONTRACT_ADDRESS) {
    const deployedAudit = await request("tools/call", {
      name: "audit_contract_address",
      arguments: {
        address: process.env.DEMO_CONTRACT_ADDRESS,
        ...(process.env.DEMO_CHAIN_ID ? { chainId: Number(process.env.DEMO_CHAIN_ID) } : {})
      }
    });
    console.log("\n== audit_contract_address ==\n", JSON.stringify(deployedAudit, null, 2));
  } else {
    console.log("\n== audit_contract_address ==\n skipped (set DEMO_CONTRACT_ADDRESS to test deployed-contract auditing)");
  }

  const kb = await request("tools/call", {
    name: "search_audit_knowledge",
    arguments: {
      query: "launchpad whitelist replay claim refund access control",
      topic: "launchpad"
    }
  });
  console.log("\n== search_audit_knowledge ==\n", JSON.stringify(kb, null, 2));

  const prompt = await request("prompts/get", {
    name: "launchpad_audit_skill",
    arguments: {
      contract_name: "PowerLaunchPad",
      risk_focus: "whitelist signatures and claim flow"
    }
  });
  console.log("\n== prompts/get ==\n", JSON.stringify(prompt, null, 2));

  child.stdin.end();
}

main().catch((error) => {
  console.error(error);
  child.kill("SIGTERM");
  process.exitCode = 1;
});
