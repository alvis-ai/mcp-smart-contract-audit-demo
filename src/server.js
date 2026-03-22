import readline from "node:readline";
import { failure } from "./protocol.js";
import { handleRpcMessage } from "./mcp-service.js";

// Minimal stdio transport for the custom MCP implementation. Each line is a
// standalone JSON-RPC payload, which makes the server easy to inspect by hand.
function writeMessage(message) {
  if (!message) {
    return;
  }
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

rl.on("line", async (line) => {
  if (!line.trim()) {
    return;
  }

  let message;
  try {
    message = JSON.parse(line);
  } catch {
    writeMessage(failure(null, -32700, "Invalid JSON"));
    return;
  }

  const response = await handleRpcMessage(message);
  writeMessage(response);
});
