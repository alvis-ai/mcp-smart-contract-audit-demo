import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerSmartContractAuditCapabilities } from "./sdk-shared.js";

export function createSdkServer() {
  // The SDK server is the preferred integration surface for real IDE clients.
  // All capabilities are registered once here, then reused by stdio and HTTP.
  const server = new McpServer(
    {
      name: "smart-contract-audit-demo",
      version: "0.4.0"
    },
    {
      capabilities: {
        logging: {}
      },
      debouncedNotificationMethods: [
        "notifications/tools/list_changed",
        "notifications/resources/list_changed",
        "notifications/prompts/list_changed"
      ]
    }
  );

  registerSmartContractAuditCapabilities(server);
  return server;
}
