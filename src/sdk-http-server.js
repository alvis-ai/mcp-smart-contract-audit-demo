import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createSdkServer } from "./sdk-server.js";
import { createDashboardRouter } from "./dashboard-api.js";
import { getAuditQueueStats } from "./audit-queue.js";
import { getAuditStorageMode } from "./audit-store.js";

// Resolve runtime config from env so the same file can run locally, in Docker,
// behind a reverse proxy, or on a PaaS without code changes.
function resolveConfig() {
  const port = Number(process.env.PORT || process.env.MCP_HTTP_PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  const endpointPath = process.env.MCP_HTTP_PATH || "/mcp";
  const authToken = process.env.MCP_AUTH_TOKEN || "";
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowedHosts = (process.env.ALLOWED_HOSTS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (allowedHosts.length === 0 && (host === "127.0.0.1" || host === "localhost")) {
    allowedHosts.push("127.0.0.1", "localhost");
  }

  return {
    port,
    host,
    endpointPath,
    authToken,
    allowedOrigins,
    allowedHosts
  };
}

function ensureAuthorized(authToken) {
  return (req, res, next) => {
    if (!authToken) {
      next();
      return;
    }

    if (req.headers.authorization === `Bearer ${authToken}`) {
      next();
      return;
    }

    res.status(401).type("text/plain").send("Unauthorized.");
  };
}

export function createSdkHttpApp(config = {}) {
  // The app factory exists mainly for testability: callers can start the HTTP
  // server on a random port or embed the app in a larger host process.
  const resolved = {
    ...resolveConfig(),
    ...config
  };

  const app = express();
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.json({ limit: "2mb" }));
  app.use(express.static(publicDir));

  app.get("/healthz", async (_req, res) => {
    res.json({
      ok: true,
      transport: "sdk-streamable-http",
      endpoint: resolved.endpointPath,
      storage: {
        audits: getAuditStorageMode()
      },
      queue: await getAuditQueueStats()
    });
  });

  // Dashboard APIs are intentionally public for browser usage.
  // MCP endpoint keeps token protection below.
  app.use("/api", createDashboardRouter());

  app.post(resolved.endpointPath, ensureAuthorized(resolved.authToken), async (req, res) => {
    // Create a fresh SDK server/transport per request so Streamable HTTP session
    // handling stays aligned with the SDK transport implementation.
    if (!isInitializeRequest(req.body)) {
      res.setHeader("Cache-Control", "no-store");
    }

    const server = createSdkServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: resolved.allowedHosts,
      allowedOrigins: resolved.allowedOrigins
    });

    res.on("close", () => {
      transport.close();
      server.close();
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          id: req.body?.id ?? null,
          error: {
            code: -32603,
            message: error.message
          }
        });
      }
    }
  });

  app.all(resolved.endpointPath, (_req, res) => {
    res.status(405).type("text/plain").send("Only POST is supported on this endpoint.");
  });

  return app;
}

export function startSdkHttpServer(config = {}) {
  const resolved = {
    ...resolveConfig(),
    ...config
  };
  const app = createSdkHttpApp(resolved);
  return app.listen(resolved.port, resolved.host, () => {
    process.stdout.write(`SDK MCP HTTP server listening on http://${resolved.host}:${resolved.port}${resolved.endpointPath}\n`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  startSdkHttpServer();
}
