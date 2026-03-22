import http from "node:http";
import { failure } from "./protocol.js";
import { handleRpcMessage } from "./mcp-service.js";

// This HTTP server mirrors the custom stdio implementation. It is kept for
// comparison and fallback, while the SDK-based Streamable HTTP server is the
// recommended production path for IDE integrations.
const port = Number(process.env.PORT || process.env.MCP_HTTP_PORT || 3000);
const host = process.env.HOST || "127.0.0.1";
const endpointPath = process.env.MCP_HTTP_PATH || "/mcp";
const authToken = process.env.MCP_AUTH_TOKEN || "";
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

function writeJson(response, statusCode, payload, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(payload));
}

function writeText(response, statusCode, text, extraHeaders = {}) {
  response.writeHead(statusCode, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(text);
}

function readBody(request) {
  // The body cap is intentionally small because MCP requests in this demo are
  // metadata-sized. Large uploads should go through files/resources instead.
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2 * 1024 * 1024) {
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function buildCorsHeaders(origin) {
  if (!origin) {
    return {};
  }
  if (allowedOrigins.length === 0) {
    return {
      "access-control-allow-origin": origin,
      vary: "Origin"
    };
  }
  if (allowedOrigins.includes(origin)) {
    return {
      "access-control-allow-origin": origin,
      vary: "Origin"
    };
  }
  return null;
}

function isAuthorized(request) {
  if (!authToken) {
    return true;
  }
  const authorization = request.headers.authorization || "";
  return authorization === `Bearer ${authToken}`;
}

function isOriginAllowed(request) {
  const origin = request.headers.origin;
  if (!origin || allowedOrigins.length === 0) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

const server = http.createServer(async (request, response) => {
  // This endpoint accepts one JSON-RPC request per HTTP POST. It is not a full
  // Streamable HTTP implementation; that lives in src/sdk-http-server.js.
  const origin = request.headers.origin || "";
  const corsHeaders = buildCorsHeaders(origin);

  if (corsHeaders === null || !isOriginAllowed(request)) {
    writeText(response, 403, "Origin not allowed.");
    return;
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...corsHeaders,
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-max-age": "86400"
    });
    response.end();
    return;
  }

  if (request.url === "/healthz") {
    writeJson(response, 200, {
      ok: true,
      transport: "http",
      endpoint: endpointPath
    }, corsHeaders || {});
    return;
  }

  if (request.url !== endpointPath) {
    writeText(response, 404, "Not found.", corsHeaders || {});
    return;
  }

  if (!isAuthorized(request)) {
    writeText(response, 401, "Unauthorized.", corsHeaders || {});
    return;
  }

  if (request.method !== "POST") {
    writeText(response, 405, "Only POST is supported on this endpoint.", {
      Allow: "POST, OPTIONS",
      ...(corsHeaders || {})
    });
    return;
  }

  let body;
  try {
    body = await readBody(request);
  } catch (error) {
    writeJson(response, 413, failure(null, -32001, error.message), corsHeaders || {});
    return;
  }

  let message;
  try {
    message = JSON.parse(body);
  } catch {
    writeJson(response, 400, failure(null, -32700, "Invalid JSON"), corsHeaders || {});
    return;
  }

  const rpcResponse = await handleRpcMessage(message);
  if (!rpcResponse) {
    response.writeHead(202, {
      "cache-control": "no-store",
      ...(corsHeaders || {})
    });
    response.end();
    return;
  }

  writeJson(response, 200, rpcResponse, corsHeaders || {});
});

server.listen(port, host, () => {
  process.stdout.write(`MCP HTTP server listening on http://${host}:${port}${endpointPath}\n`);
});
