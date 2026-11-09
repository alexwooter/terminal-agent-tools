#!/usr/bin/env node
// Stdio transport: `npx terminalup-odds-mcp`. The key comes from the environment.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { resolveCredentials } from "./client.js";
import { createServer } from "./server.js";

const creds = resolveCredentials();
if (!creds.apiKey) {
  process.stderr.write(
    "terminalup-odds-mcp: no API key found. Set TERMINALUP_API_KEY (tu_live_) or TERMINALUP_SANDBOX_KEY (tu_test_). Only terminalup_status and terminalup_docs will work.\n",
  );
}
const server = createServer(creds);
await server.connect(new StdioServerTransport());
