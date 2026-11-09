---
name: terminalup-odds-api
description: Read live sports prices from the TerminalUp Odds API. Use when an agent needs the best available price, implied probability, stake size or liquidity for a game or market across sports trading venues and prediction markets, or needs to stream price changes for any league TerminalUp publishes. Covers REST snapshots, Server-Sent Events and WebSocket streams, sandbox keys, pagination and error handling.
metadata:
  version: 1.0.0
  homepage: https://terminalup.com
  docs: https://terminal-up-hq.replit.app/docs
---

# TerminalUp Odds API

TerminalUp is a cross-venue sports trading terminal. One account routes orders to sportsbooks, betting exchanges and prediction markets. The Odds API publishes the current state of every market TerminalUp covers: the best fee-adjusted price per outcome, raw top of book, a bounded price ladder with stake, liquidity estimates and licensed venue counts, each with timestamps and an honest status.

Base URL: `https://terminal-up-hq.replit.app` (set `TERMINALUP_ODDS_BASE_URL` to override).
Machine-readable docs: `/openapi.json`, `/llms.txt`, `/llms-full.txt`. Human docs: `/docs`.

## When to use

- A user asks for the best price, line or odds on a game, team or market.
- A user wants to compare prices across venues or know how much stake is available at a price.
- An agent needs a feed of price changes for a league, event or market.
- Building an app, bot or dashboard on sports prices.

Do not use it for placing orders. Trading happens in the terminal at https://trade.terminalup.com. The API is read-only.

## Keys

Every `/v1` data request needs `Authorization: Bearer <key>`.

- `tu_live_...` keys return real markets within the key's entitlements (leagues, market types, ladder depth, delay, rate, streams).
- `tu_test_...` keys return synthetic sandbox data in the exact production shapes. Event ids start with `sbx_`, every payload carries `sandbox: true`. Use these to build and test before a license is in place.
- `/v1/status`, `/v1/healthz` and the docs need no key.

Request a key at https://terminalup.com/contact (or win@terminalup.com). Keep keys server-side. Never put a key in a URL except for `/v1/stream` and `/v1/ws` from clients that cannot set headers.

## Endpoints

All GET. Full parameter list in `references/endpoints.md`.

| Path | Returns |
|---|---|
| `/v1/sports` | Sports and leagues that currently have published markets, within your entitlements |
| `/v1/events?league=&limit=&cursor=` | Events with published markets |
| `/v1/markets?league=&event=&market_type=&odds_format=&limit=&cursor=` | Current state of markets, paginated |
| `/v1/markets/{market_id}?odds_format=` | One market; supports `If-None-Match` and answers 304 when unchanged |
| `/v1/stream?league=&event=&market=&all=&odds_format=` | Server-Sent Events stream of full market states |
| `/v1/ws?odds_format=` | WebSocket stream; subscribe after `hello` |
| `/v1/status` | Public service status: feed, coverage, delivery, config |

`odds_format` is `decimal` (default), `american` or `probability`. `market_type` is `moneyline`, `spread` or `total`. League codes are case-insensitive and may be comma-separated (`NFL,NCAAF`).

## Quick calls

```bash
KEY="tu_test_..."
BASE="https://terminal-up-hq.replit.app"
curl -s -H "Authorization: Bearer $KEY" "$BASE/v1/sports"
curl -s -H "Authorization: Bearer $KEY" "$BASE/v1/markets?league=NFL&market_type=moneyline&odds_format=american&limit=20"
curl -N -H "Authorization: Bearer $KEY" "$BASE/v1/stream?league=NFL"
```

```python
import requests
BASE = "https://terminal-up-hq.replit.app"
H = {"Authorization": "Bearer tu_test_..."}

def markets(**params):
    cursor = None
    while True:
        r = requests.get(f"{BASE}/v1/markets", params={**params, "cursor": cursor}, headers=H, timeout=10)
        if r.status_code == 429:
            import time; time.sleep(int(r.headers.get("Retry-After", "1"))); continue
        r.raise_for_status()
        body = r.json()
        yield from body["markets"]
        cursor = body["next_cursor"]
        if cursor is None:
            return

for m in markets(league="NFL", market_type="moneyline", odds_format="american"):
    for o in m["outcomes"]:
        label = o["selection"] or o["slot"]
        print(m["market_id"], label, o["best"] and o["best"]["odds"], m["status"])
```

## Reading a market

Key fields on every market (full schema in `references/endpoints.md`):

- `market_id`, `event` (`id`, `name`, `league`, `sport`, `start_time`), `market_type`, `line`
- `status`: `open`, `thin`, `suspended`, `stale`, `closed`; `status_reason` whenever not open
- `freshness`: `fresh`, `confirmed`, `expired`, `none`
- `outcomes[]`: `slot` (`outcome_a`, `outcome_b`), `selection` (verified label or null), `best` (`odds`, `probability`, `max_stake_usd`, `shares`, `venues`), `raw` (`ask`, `bid` in probability units, pre-fee), `asks[]` and `bids[]` ladders (`odds`, `probability`, `stake_usd`, `shares`, `venues`), `liquidity_usd`
- `seq` and `epoch` for ordering; `timestamps` (`source`, `ingest`, `confirmed`, `publish`)
- `venues` (count only; venue identities are never published), `attribution` (display with prices when present), `sandbox`

Rules an agent must respect:

1. `best` is the lowest fee-adjusted ask across licensed venues. It is a price someone could take right now, not a consensus or a model. If `best` is null the market is `thin`; say there is no licensed price, never interpolate one.
2. Prices are rounded against the bettor. Quote them as published.
3. `stale` and `suspended` markets have empty ladders. Never present an old price as current.
4. When `selection` is null, key on `slot`. Never guess a team from slot order.
5. There is no history endpoint. Movement must be built from a stream.
6. Treat `status` as the truth about tradability and `/v1/status` as the truth about the feed. Outside game hours many markets are quiet and `confirmed`; that is normal.

## Streams

Both transports share one contract: `hello`, then every subscribed market once (the snapshot), then `ready`, then a full `market` message each time a subscribed market changes. No deltas. Apply a message only if `epoch` matches and `seq` is higher than what you hold. `heartbeat` every 5 s; treat 15 s of silence as dead and reconnect. Details and code in `references/streams.md`.

## Limits and errors

- Per-key token bucket (one minute of allowance, continuous refill). Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`; on 429 honour `Retry-After`.
- Concurrent streams per key are capped (429 `stream_limit`); selectors per stream are capped (403 `subscription_limit`).
- Errors are JSON: `{"error": {"code": "...", "message": "..."}}`. Codes you will meet: `unauthorized`, `invalid_key`, `key_revoked`, `key_expired` (401); `partner_paused`, `league_not_entitled`, `market_type_not_entitled` (403); `market_not_found` (404); `market_closed` (410); `rate_limited`, `stream_limit` (429); `capacity` (503).
- Sandbox prices are internally consistent but say nothing about real markets. Label them as sandbox in any output.

## MCP server

An MCP server wrapping these endpoints lives in this repo under `mcp/`. Agents that can use MCP tools should prefer it over raw HTTP.
