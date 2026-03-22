#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Small launcher wrapper so local installs and npm-published installs can use
// one stable command while switching between custom and SDK transports.
function printHelp() {
  process.stdout.write([
    "Usage: smart-contract-audit-mcp [--http] [--sdk] [--port <port>] [--host <host>] [--path <path>]",
    "",
    "Modes:",
    "  default       Start MCP over stdio",
    "  --http        Start MCP over HTTP",
    "  --sdk         Use the official MCP SDK server entrypoint",
    "",
    "Examples:",
    "  smart-contract-audit-mcp",
    "  smart-contract-audit-mcp --http --port 3000 --host 127.0.0.1",
    "  smart-contract-audit-mcp --sdk",
    "  smart-contract-audit-mcp --sdk --http --port 3000",
    ""
  ].join("\n"));
}

function parseArgs(argv) {
  const env = {};
  let transport = "stdio";
  let entryFamily = "custom";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }

    if (arg === "--http") {
      transport = "http";
      continue;
    }

    if (arg === "--stdio") {
      transport = "stdio";
      continue;
    }

    if (arg === "--sdk") {
      entryFamily = "sdk";
      continue;
    }

    if (arg === "--port") {
      env.PORT = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--host") {
      env.HOST = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg === "--path") {
      env.MCP_HTTP_PATH = argv[index + 1];
      index += 1;
      continue;
    }

    process.stderr.write(`Unknown argument: ${arg}\n`);
    printHelp();
    process.exit(1);
  }

  return { transport, env, entryFamily };
}

const { transport, env, entryFamily } = parseArgs(process.argv.slice(2));
const entry = entryFamily === "sdk"
  ? (transport === "http" ? "src/sdk-http-server.js" : "src/sdk-stdio-server.js")
  : (transport === "http" ? "src/http-server.js" : "src/server.js");

const child = spawn(process.execPath, [path.join(projectRoot, entry)], {
  cwd: projectRoot,
  stdio: "inherit",
  env: {
    ...process.env,
    ...env
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
