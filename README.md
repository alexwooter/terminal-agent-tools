# TerminalUp agent tools

Agent skills and an MCP server for the [TerminalUp Odds API](https://terminal-up-hq.replit.app/docs). TerminalUp is a cross-venue sports trading terminal: one account, orders routed to sportsbooks, betting exchanges and prediction markets. The Odds API publishes the best fee-adjusted price per outcome, raw top of book, a bounded price ladder with stake, liquidity and venue counts for every market TerminalUp covers.

[![Install with skills](https://skills.sh/badge.svg)](https://skills.sh/terminalup/agent-tools)

## Skill

Teaches an agent how to read TerminalUp prices over REST, Server-Sent Events and WebSocket: keys and sandbox, endpoints, the market payload, status and freshness semantics, pagination, limits and errors.

```bash
npx skills add terminalup/agent-tools --skill terminalup-odds-api
```

Works with Claude Code, Cursor, Codex, Gemini CLI, Hermes Agent and any agent that reads `SKILL.md`. Source: [`skills/terminalup-odds-api`](skills/terminalup-odds-api/SKILL.md).

## MCP server

Seven read-only tools: `terminalup_status`, `terminalup_sports`, `terminalup_events`, `terminalup_markets`, `terminalup_market`, `terminalup_find_price`, `terminalup_docs`. Stdio for local agents, Streamable HTTP for remote use. Source and setup: [`mcp/`](mcp/README.md).

Local (stdio):

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

Remote (Streamable HTTP):

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

## Keys

`tu_live_` keys return real markets within the key's entitlements. `tu_test_` keys return synthetic sandbox data in the same shapes so you can build before a license is in place. Request a key at [terminalup.com/contact](https://terminalup.com/contact).

## Links

- Terminal: https://trade.terminalup.com
- API docs: https://terminal-up-hq.replit.app/docs (OpenAPI: `/openapi.json`, `/llms.txt`, `/llms-full.txt`)
- Service status: https://terminal-up-hq.replit.app/v1/status
- X: [@terminalup](https://x.com/terminalup)

MIT licensed.
