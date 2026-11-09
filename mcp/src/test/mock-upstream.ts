// A tiny stand-in for the Odds API so the HTTP transport can be exercised offline.
import { createServer } from "node:http";

const market = {
  market_id: "sbx_m_1",
  event: { id: "sbx_e_1", name: "Harbor City at River Town", league: "MLB", sport: "baseball", start_time: "2026-11-10T00:10:00Z" },
  market_type: "moneyline",
  line: null,
  status: "open",
  status_reason: null,
  freshness: "fresh",
  seq: 3,
  epoch: "sandbox",
  timestamps: { source: null, ingest: "2026-11-09T15:00:00Z", confirmed: null, publish: "2026-11-09T15:00:01Z" },
  odds_format: "american",
  outcomes: [
    { slot: "outcome_a", selection: "Harbor City", mapping: { status: "verified" }, best: { odds: 118, probability: 0.4587, max_stake_usd: 1200, shares: 550, venues: 2 }, raw: { ask: 0.45, bid: 0.43 }, asks: [], bids: [], liquidity_usd: 4000, venues: 2 },
    { slot: "outcome_b", selection: "River Town", mapping: { status: "verified" }, best: { odds: -128, probability: 0.5614, max_stake_usd: 900, shares: 400, venues: 2 }, raw: { ask: 0.55, bid: 0.53 }, asks: [], bids: [], liquidity_usd: 3100, venues: 2 },
  ],
  venues: 2,
  attribution: [],
  line_set: "sandbox",
  policy_version: "p1",
  depth: 5,
  estimates: "client_derived",
  fee_engine: "fe-1",
  sandbox: true,
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const auth = req.headers.authorization ?? "";
  const json = (status: number, body: unknown) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (url.pathname === "/v1/status") return json(200, { service: { name: "terminalup-odds-api", version: "1.1.1" }, feed: { mode: "development_bounded" }, markets: { total: 1 }, config: { leagues_enabled: ["MLB"] } });
  if (!/^Bearer tu_(live|test)_[A-Za-z0-9]{40}$/.test(auth)) return json(401, { error: { code: "unauthorized", message: "No key" } });
  if (url.pathname === "/v1/sports") return json(200, { sports: [{ key: "baseball", name: "Baseball", leagues: [{ code: "MLB", name: "MLB", sport: "baseball", events: 1, markets: 1 }] }] });
  if (url.pathname === "/v1/markets") return json(200, { markets: [market], next_cursor: null, sandbox: true });
  if (url.pathname === "/v1/markets/sbx_m_1") return json(200, market);
  return json(404, { error: { code: "not_found", message: "nope" } });
});

server.listen(Number(process.env.PORT ?? 8099), "127.0.0.1", () => process.stderr.write("mock upstream ready\n"));
