# Distribution checklist

Order matters. Everything after step 3 depends on steps 1 to 3.

## Status, 10 Nov 2026 (evening)

- mcp.terminalup.com: DNS correct and Replit shows Verified, but the edge still 404s. Disconnect and re-add the domain in the MCP app's Domains panel.
- skills.sh lists a repo only after a CLI install: `npx skills add alexwooter/terminal-agent-tools --skill terminalup-odds-api` from any Node shell.

- npm: `terminalup-odds-mcp@0.1.0` is live (`npx -y terminalup-odds-mcp`). Account `w00ter92`, 2FA with security key. Future releases: tag `mcp-vX.Y.Z` → GitHub Actions stages the version → approve on npmjs.com Staged Packages.

## Status, 10 Nov 2026 (morning)
- Repo `alexwooter/terminal-agent-tools` is on GitHub with `main` pushed (10 Nov, afternoon).
- Remote MCP server is deployed on Replit (app "terminalup-odds-mcp", built from `mcp/` verbatim) at https://slategrey-respectful-pdf.replit.app with `/mcp` and `/healthz`. No key is configured yet, so anonymous calls get `terminalup_status` and `terminalup_docs` only. Set `TERMINALUP_SANDBOX_KEY` in that app's Secrets to turn on sandbox data for everyone.
- `mcp.terminalup.com`: added in the Replit app's Domains panel; the GoDaddy Domain Connect approval is Alex's click (Claude is not allowed to change DNS on terminalup.com). Every listing file already uses that hostname.
- Not done and needing a login: npm publish (step 3), skills.sh first install (4), Hermes PR (5), LobeHub (6), registry publish (7), mcp-submit (8).

## 1. Publish this repo
- Repo: `alexwooter/terminal-agent-tools` (created 10 Nov). Push `main` once the Claude GitHub App has access, or push from any machine with the local clone.
- The repo path is already written into `README.md`, `mcp/src/http.ts`, `hermes/manifest.yaml` and `mcp/server.json`.

## 2. Deploy the remote MCP server
- Done on Replit (see Status). Add `TERMINALUP_SANDBOX_KEY=tu_test_...` to its Secrets so anonymous visitors get sandbox data.
- Point `mcp.terminalup.com` at it. Confirm `GET /healthz` and a `POST /mcp` initialize both answer.
- Keeping the Replit app in sync with this repo: once the repo is on GitHub, connect the app to it from the Replit Git pane, or re-run the "pull and rebuild" prompt after each change to `mcp/`.
- Point `odds.terminalup.com` at the Odds API deployment, then set `TERMINALUP_ODDS_BASE_URL=https://odds.terminalup.com` and change `DEFAULT_BASE_URL` in `mcp/src/client.ts` plus the doc links in `skills/terminalup-odds-api/SKILL.md`.

## 3. Publish the npm package
- `cd mcp && npm publish --access public` as `terminalup-odds-mcp` (name is free as of this writing; check `npm view terminalup-odds-mcp`).
- This makes `npx -y terminalup-odds-mcp` work, which every stdio-based directory listing depends on.

## 4. skills.sh (Vercel, DR 82)
- Listing is driven by install telemetry. Run `npx skills add alexwooter/terminal-agent-tools --skill terminalup-odds-api` once from a clean machine, then post the install line.
- Badge is already in `README.md`. Check `https://skills.sh/alexwooter/terminal-agent-tools` after the first installs.

## 5. Hermes Agent catalog (Nous Research, DR 84)
- Fork `NousResearch/hermes-agent`, add `optional-mcps/terminalup-odds/manifest.yaml` from `hermes/manifest.yaml`, open a PR. Presence in that directory means Nous approval, so the PR text should state: vendor-hosted, URL-only, works anonymously on sandbox data, Bearer header for live, read-only tools, no process spawned.
- Separately submit at https://hermesmarket.ai (community directory, GitHub login).

## 6. LobeHub MCP Marketplace (DR 75)
- LobeHub builds the page from the public GitHub README. Use the publish flow on https://lobehub.com/mcp (the "Publish" prompt for your agent), pointing at the repo. Keep `mcp/README.md` as the install source of truth.

## 7. Official MCP Registry
- `server.json` is in `mcp/`. Install `mcp-publisher`, `mcp-publisher login github`, then `mcp-publisher publish` from `mcp/`. Namespace `io.github.alexwooter/terminalup-odds` requires the GitHub org to match.

## 8. Other directories (one pass)
- `npx mcp-submit` from `mcp/` submits to the official registry, Smithery, mcp.so, PulseMCP, mcpservers.org and both awesome-mcp-servers lists in one run. Use `--dry-run` first. Source: github.com/jordanlyall/mcp-submit.
- Glama indexes GitHub automatically; claim the listing at glama.ai once it appears.
- Cursor directory (cursor.directory/mcp), Smithery (smithery.ai, GitHub login), PulseMCP submit form, MCPBundles claim via `/.well-known/mcpbundles.json` on mcp.terminalup.com.

## 9. Own the docs page Taras mentions
- "MCP Servers" directory (DR 72) builds a page from a public MCP docs page with the server URL and setup steps. The landing page at `GET /` on the MCP host is that page. Add a link to it from terminalup.com footer ("Developers") so it has a dofollow path from the main domain.

## 10. Announce
- One X thread from @terminalup: what the Odds API publishes, the install line, the MCP URL, a 20-second clip of an agent asking for a price. Quote-tweet Taras's skills.sh post.
