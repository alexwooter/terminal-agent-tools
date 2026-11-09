# Streams

Server-Sent Events (`/v1/stream`) and WebSocket (`/v1/ws`) share one contract.

1. `hello` first. Carries `epoch`, `epoch_changed`, `depth`, `delay_s`, `sandbox`.
2. The current state of every subscribed market, one `market` message each (the snapshot).
3. `ready` with the count of markets sent.
4. A full `market` message every time a subscribed market changes. No deltas: each message replaces the previous state.
5. `heartbeat` every 5 seconds with server time. 15 seconds of silence means the connection is dead; reconnect.
6. `status` when feed connectivity, catalog completeness, config version or a kill switch changes.
7. `bye` before the server closes: `slow_consumer`, `key_revoked`, `key_rotated`, `key_expired`, `partner_paused`, `entitlements_changed`.

Apply a `market` message only when its `epoch` matches yours and its `seq` is higher than what you hold. On reconnect pass your previous epoch (`epoch=` query or SSE `Last-Event-ID`); if `hello.epoch_changed` is true, drop all cached state.

Slow consumers are conflated per market (you always get the latest state) and closed after 10 seconds blocked. Reconnect for a fresh snapshot.

## SSE

```bash
curl -N -H "Authorization: Bearer $KEY" "$BASE/v1/stream?league=NFL&odds_format=american"
curl -N -H "Authorization: Bearer $KEY" "$BASE/v1/stream?market=<market_id>"
# EventSource cannot set headers; the key may travel in the URL for streams only
curl -N "$BASE/v1/stream?league=NFL&api_key=$KEY"
```

```python
import json, requests
state = {}
with requests.get(f"{BASE}/v1/stream", params={"league": "NFL"}, headers=H, stream=True, timeout=30) as r:
    r.raise_for_status()
    event, data = None, []
    for raw in r.iter_lines(decode_unicode=True):
        if raw == "":
            if event and data:
                payload = json.loads("\n".join(data))
                if event == "market":
                    prev = state.get(payload["market_id"])
                    if prev is None or payload["seq"] > prev["seq"]:
                        state[payload["market_id"]] = payload
                elif event == "hello" and payload["epoch_changed"]:
                    state.clear()
            event, data = None, []
        elif raw.startswith("event:"):
            event = raw[6:].strip()
        elif raw.startswith("data:"):
            data.append(raw[5:].strip())
```

## WebSocket

Authenticate with the `Authorization` header or `api_key=` on the upgrade, or send `{"type":"auth","api_key":"..."}` as the first message within 5 seconds. Wait for `hello`, then subscribe. Each subscribe answers with the snapshot of the markets it added, then `ready`.

```json
{"type":"subscribe","leagues":["NFL"],"events":[],"markets":[]}
{"type":"subscribe","all":true}
{"type":"unsubscribe","leagues":["NFL"]}
{"type":"ping"}
```

Server envelopes are `{"type": "...", "data": {...}}` with types `hello`, `market`, `ready`, `unsubscribed`, `heartbeat`, `status`, `pong`, `error`, `bye`.

```javascript
const socket = new WebSocket(`${WS_BASE}/v1/ws?odds_format=decimal`);
const state = new Map();
socket.addEventListener("open", () => socket.send(JSON.stringify({ type: "auth", api_key: KEY })));
socket.addEventListener("message", (e) => {
  const { type, data } = JSON.parse(e.data);
  if (type === "hello") {
    if (data.epoch_changed) state.clear();
    socket.send(JSON.stringify({ type: "subscribe", leagues: ["NFL"] }));
  } else if (type === "market") {
    const prev = state.get(data.market_id);
    if (!prev || data.seq > prev.seq) state.set(data.market_id, data);
  } else if (type === "bye") {
    console.warn("closed:", data.reason);
  }
});
```

## Limits

A key holds at most its entitled number of concurrent streams (one more is refused with 429 `stream_limit`). Each stream may hold a bounded number of selectors (`all` counts as one); beyond that SSE answers 403 `subscription_limit` and WebSocket rejects the subscribe with an `error`. A global connection cap returns 503 `capacity` with `Retry-After`.
