// Streamable HTTP transport, stateless: one server per request, bound to the
// caller's own key when they send `Authorization: Bearer tu_...`, otherwise the
// server's environment key (live or sandbox). Serves /mcp plus a small landing
// page and health check so directories can verify the endpoint.
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isApiKey, resolveCredentials } from "./client.js";
import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";

const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? "0.0.0.0";
const MCP_PATH = process.env.MCP_PATH ?? "/mcp";
const MAX_BODY = 1_000_000;

function bearer(req: IncomingMessage): string | null {
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const m = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return m && isApiKey(m[1]) ? m[1] : null;
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const landing = `<!doctype html><meta charset="utf-8"><title>TerminalUp Odds MCP</title>
<style>body{font:15px/1.5 Inter,system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;color:#0B1A24}code,pre{background:#f3f5f7;border-radius:6px;padding:2px 6px}pre{padding:12px;overflow:auto}h1 span{color:#3BD324}</h1></style>
<h1>Terminal<span>Up</span> Odds MCP</h1>
<p>Model Context Protocol server for the TerminalUp Odds API: best prices, ladders, liquidity and status across sports trading venues.</p>
<p>Endpoint: <code>${MCP_PATH}</code> (Streamable HTTP). Send your TerminalUp key as <code>Authorization: Bearer tu_live_...</code>. Without a key the server answers with sandbox data when one is configured.</p>
<pre>{
  "mcpServers": {
    "terminalup-odds": {
      "url": "https://&lt;this-host&gt;${MCP_PATH}",
      "headers": { "Authorization": "Bearer tu_live_..." }
    }
  }
}</pre>
<p>Tools: terminalup_status, terminalup_sports, terminalup_events, terminalup_markets, terminalup_market, terminalup_find_price, terminalup_docs.</p>
<p>API docs: <a href="https://terminal-up-hq.replit.app/docs">terminal-up-hq.replit.app/docs</a>. Keys: <a href="https://terminalup.com/contact">terminalup.com/contact</a>. Source: <a href="https://github.com/terminalup/agent-tools">github.com/terminalup/agent-tools</a>.</p>`;

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === "/healthz") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, name: SERVER_NAME, version: SERVER_VERSION }));
    return;
  }
  if (url.pathname === "/" || url.pathname === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
    res.end(landing);
    return;
  }
  if (url.pathname !== MCP_PATH) {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  // Stateless: GET (server-initiated streams) and DELETE (sessions) are not supported.
  if (req.method === "GET" || req.method === "DELETE") {
    res.writeHead(405, { "Content-Type": "application/json", Allow: "POST" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." }, id: null }));
    return;
  }
  if (req.method !== "POST") {
    res.writeHead(405, { Allow: "POST" });
    res.end();
    return;
  }

  let body: unknown;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null }));
    return;
  }

  const creds = resolveCredentials(bearer(req));
  const server = createServer(creds);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (error) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null }));
    }
    process.stderr.write(`terminalup-odds-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

const httpServer = createHttpServer((req, res) => {
  handle(req, res).catch((error) => {
    process.stderr.write(`terminalup-odds-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
    if (!res.headersSent) res.writeHead(500).end();
  });
});

httpServer.listen(PORT, HOST, () => {
  const creds = resolveCredentials();
  process.stderr.write(`terminalup-odds-mcp listening on http://${HOST}:${PORT}${MCP_PATH} (default key: ${creds.keySource}, upstream: ${creds.baseUrl})\n`);
});
