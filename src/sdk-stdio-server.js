import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createSdkServer } from "./sdk-server.js";

// Smallest possible official-SDK stdio entrypoint. VS Code local MCP configs
// can point at this directly, or use the bin wrapper with --sdk.
const server = createSdkServer();
const transport = new StdioServerTransport();

await server.connect(transport);
