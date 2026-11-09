# terminalup-odds-mcp

MCP server for the TerminalUp Odds API. Gives any MCP client (Claude Desktop, Claude Code, Cursor, Codex, Hermes Agent, LobeHub, Windsurf) read access to TerminalUp's best prices, ladders, liquidity and service status.

## Tools

| Tool | What it does | Key |
|---|---|---|
| `terminalup_status` | Feed mode, connections, markets by status, enabled leagues, kill switches | none |
| `terminalup_sports` | Sports and leagues with published markets, within the key's entitlements | yes |
| `terminalup_events` | Events in a league, paginated | yes |
| `terminalup_markets` | Current markets with best price, probability, stake and liquidity per outcome; compact or full | yes |
| `terminalup_market` | One market in full: ladders, raw top of book, timestamps | yes |
| `terminalup_find_price` | Match a team or event name in a league and return best prices | yes |
| `terminalup_docs` | API documentation index or a page as markdown | none |

All tools are read-only. The server never places orders.

## Keys

Keys are resolved per call in this order:

1. `Authorization: Bearer tu_...` on the HTTP connection (the client's own key).
2. `TERMINALUP_API_KEY` in the server environment.
3. `TERMINALUP_SANDBOX_KEY` in the server environment (a `tu_test_` key; synthetic data, labelled as sandbox in every response).

Without any key, only `terminalup_status` and `terminalup_docs` work. Request a key at https://terminalup.com/contact.

## Run locally (stdio)

```bash
TERMINALUP_API_KEY=tu_live_... npx -y terminalup-odds-mcp
```

Claude Desktop / Claude Code / Cursor config:

```json
{
  "mcpServers": {
    "terminalup-odds": {
      "command": "npx",
      "args": ["-y", "terminalup-odds-mcp"],
      "env": { "TERMINALUP_API_KEY": "tu_live_..." }
    }
  }
}
```

Hermes Agent (`~/.hermes/config.yaml`):

```yaml
mcp_servers:
  terminalup-odds:
    command: npx
    args: ["-y", "terminalup-odds-mcp"]
    env:
      TERMINALUP_API_KEY: tu_live_...
```

## Run as a remote server (Streamable HTTP)

```bash
npm install && npm run build
TERMINALUP_SANDBOX_KEY=tu_test_... PORT=8787 node dist/http.js
```

Endpoint: `POST /mcp`. Health: `GET /healthz`. Landing page: `GET /`. Stateless; every request builds a server bound to the caller's key.

Client config:

```json
{
  "mcpServers": {
    "terminalup-odds": {
      "url": "https://mcp.terminalup.com/mcp",
      "headers": { "Authorization": "Bearer tu_live_..." }
    }
  }
}
```

Hermes: `hermes mcp add terminalup-odds --url https://mcp.terminalup.com/mcp`, then add the header under `mcp_servers.terminalup-odds.headers` for live data.

### Environment

| Variable | Purpose |
|---|---|
| `TERMINALUP_ODDS_BASE_URL` | Upstream Odds API. Default `https://terminal-up-hq.replit.app` |
| `TERMINALUP_API_KEY` | Default live key when the client sends none |
| `TERMINALUP_SANDBOX_KEY` | Fallback `tu_test_` key so anonymous clients get sandbox data |
| `PORT`, `HOST`, `MCP_PATH` | HTTP binding. Defaults `8787`, `0.0.0.0`, `/mcp` |

### Docker

```bash
docker build -t terminalup-odds-mcp .
docker run -p 8787:8787 -e TERMINALUP_SANDBOX_KEY=tu_test_... terminalup-odds-mcp
```

## Reading the data

- `best_odds` is the lowest fee-adjusted ask across licensed venues, rounded against the bettor. A price someone can take now, not a consensus.
- `best_odds: null` means no licensed venue quotes that outcome. The market is `thin`.
- `status` `stale` or `suspended` means no current price. Ladders are empty.
- `sandbox: true` (or the `note` field) means synthetic data. Say so.
- No history. Build movement from the streams described in the skill (`/v1/stream`, `/v1/ws`).

## Development

```bash
npm install
npm run build
npm test            # offline unit tests
LIVE=1 npm test     # also hits the public /v1/status
```

`src/test/mock-upstream.ts` is a small stand-in for the Odds API for exercising the HTTP transport offline.

MIT.
