# Endpoint and field reference

Generated from the OpenAPI 3.1 document at `{BASE}/openapi.json` (API version 1.1.1). Every endpoint is GET. Data endpoints need `Authorization: Bearer <key>`.

## Endpoints

### `GET /v1/sports`
Sports and leagues with published markets, limited to the key's entitled leagues. No parameters.
Response `SportList`: `sports[]` of `Sport` (`key`, `name`, `leagues[]` of `League`: `code`, `name`, `sport`, `events`, `markets`).

### `GET /v1/events`
| Parameter | Type | Notes |
|---|---|---|
| `league` | string | League codes, case-insensitive, comma-separated |
| `limit` | integer 1 to 500 | Default 100 |
| `cursor` | string | From the previous page's `next_cursor` |

Response `EventList`: `events[]` of `Event` (`id`, `name`, `league`, `sport`, `start_time`, `markets`, `market_types`), `next_cursor`.

### `GET /v1/markets`
| Parameter | Type | Notes |
|---|---|---|
| `league` | string | League codes |
| `event` | string | Comma-separated event ids |
| `market_type` | string | `moneyline`, `spread`, `total`; comma-separated |
| `odds_format` | enum | `decimal` (default), `american`, `probability` |
| `limit` | integer 1 to 500 | Default 100 |
| `cursor` | string | Pagination cursor |

Response `MarketList`: `markets[]` of `Market`, `next_cursor`, `sandbox`.

### `GET /v1/markets/{market_id}`
| Parameter | In | Notes |
|---|---|---|
| `market_id` | path | 1 to 100 chars |
| `odds_format` | query | As above |

Returns one `Market`. Sends a weak `ETag`; send `If-None-Match` to receive 304 while unchanged. 410 `market_closed` for about a minute after a market leaves the catalog (last state attached), then 404.

### `GET /v1/stream`
Server-Sent Events. Parameters: `league`, `event`, `market`, `all` (boolean), `odds_format`, `epoch` (previous epoch), `api_key` (only for clients that cannot set headers). Also honours `Last-Event-ID`.

### `GET /v1/ws`
WebSocket upgrade. Parameters: `odds_format`, `epoch`, `api_key`. Auth also accepted as a first message `{"type":"auth","api_key":"..."}` within 5 s. Then send `{"type":"subscribe","leagues":[...],"events":[...],"markets":[...]}` or `{"type":"subscribe","all":true}`.

### `GET /v1/status`
Public, cached 1 s. Sections: `service`, `feed`, `markets`, `delivery`, `sandbox`, `access`, `config`. Use `feed.mode`, `feed.connections.connected`, `markets.total` and `config.leagues_enabled` to tell whether live data is flowing.

### `GET /v1/healthz`
Liveness.

### Documentation
`/docs`, `/docs/{page}` (append `.md` for markdown), `/openapi.json`, `/llms.txt`, `/llms-full.txt`.

## Market schema

| Field | Type | Meaning |
|---|---|---|
| `market_id` | string | Stable id |
| `event` | EventRef | `id`, `name`, `league`, `sport`, `start_time` |
| `market_type` | string | `moneyline`, `spread`, `total` |
| `line` | number or null | Spread or total line |
| `status` | enum | `open`, `thin`, `suspended`, `stale`, `closed` |
| `status_reason` | string or null | `one_sided`, `no_licensed_liquidity`, `kill_switch_global`, `kill_switch_league`, `line_set_unlicensed`, `evidence_expired`, `awaiting_snapshot`, `feed_disconnected`, `left_catalog` |
| `freshness` | enum | `fresh`, `confirmed`, `expired`, `none` |
| `seq` | integer | Increases with every published state within an epoch |
| `epoch` | string | Changes on service restart |
| `timestamps` | object | `source`, `source_ns`, `ingest`, `confirmed`, `publish` (ISO 8601) |
| `odds_format` | enum | Format used in this payload |
| `outcomes[]` | Outcome | See below |
| `venues` | integer | Count of licensed venues contributing |
| `attribution` | string[] | Lines you must display with the prices when present |
| `line_set` | string | `public`, `partner` or `sandbox` |
| `policy_version` | string | Policy that produced the state |
| `depth` | integer | Ladder levels per side |
| `estimates` | string | Always `client_derived` |
| `fee_engine` | string | Fee engine build |
| `sandbox` | boolean | True for `tu_test_` data |
| `link` | string | Partner deep link, only when configured |

### Outcome
| Field | Meaning |
|---|---|
| `slot` | `outcome_a` or `outcome_b` |
| `selection` | Verified label or null |
| `mapping` | `status` (`verified` or `unverified`), `evidence` |
| `best` | `odds`, `probability`, `max_stake_usd`, `shares`, `venues`; null when no licensed price |
| `raw` | `ask`, `bid` in probability units, pre-fee |
| `asks[]`, `bids[]` | Levels: `odds`, `probability`, `stake_usd`, `shares`, `venues` |
| `liquidity_usd` | Sum of the ask ladder |
| `venues` | Licensed venue count for this outcome |

## Status and freshness

| status | status_reason | Meaning |
|---|---|---|
| open | none | Every outcome has a best price |
| thin | one_sided | One outcome has no licensed price |
| thin | no_licensed_liquidity | No licensed venue quotes anything |
| suspended | kill_switch_global, kill_switch_league, line_set_unlicensed | Policy withholds the market; empty ladders |
| stale | evidence_expired | Evidence aged out with no confirmation; empty ladders |
| stale | awaiting_snapshot | In catalog, first snapshot not yet received |
| stale | feed_disconnected | Upstream connection down |
| closed | left_catalog | Final state; REST answers 410 then 404 |

Freshness: `fresh` (recent update), `confirmed` (quiet book re-observed unchanged), `expired` (nothing confirmed; market is stale), `none` (no book).

## Rounding and pricing

Prices are computed from unrounded probabilities and rounded against the bettor: decimal floored at three places, American floored to whole numbers away from the bettor, implied probability rounded up at four places. `best` is the lowest fee-adjusted ask across licensed venues after the client's estimated commission. Nothing is synthesized.

## Error envelope

```json
{"error": {"code": "league_not_entitled", "message": "...", "league": "NHL", "entitled": ["NFL", "MLB"]}}
```

| HTTP | Codes |
|---|---|
| 400 | invalid_parameter, invalid_cursor, subscription_required, invalid_selector, invalid_link |
| 401 | unauthorized, invalid_key, key_revoked, key_expired, auth_timeout |
| 403 | partner_paused, league_not_entitled, market_type_not_entitled, subscription_limit |
| 404 | market_not_found, link_unavailable, not_found |
| 410 | market_closed |
| 426 | upgrade_required |
| 429 | rate_limited, stream_limit |
| 503 | capacity |
