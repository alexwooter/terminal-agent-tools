import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createServer, compactMarket } from "../server.js";
import { isApiKey, resolveCredentials, type Market } from "../client.js";

const connect = async (key?: string) => {
  const server = createServer(resolveCredentials(key ?? null));
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(clientTransport);
  return client;
};

test("key pattern", () => {
  assert.equal(isApiKey("tu_live_" + "a".repeat(40)), true);
  assert.equal(isApiKey("tu_test_" + "B".repeat(40)), true);
  assert.equal(isApiKey("tu_live_short"), false);
  assert.equal(isApiKey(undefined), false);
});

test("lists the seven tools", async () => {
  const client = await connect();
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["terminalup_docs", "terminalup_events", "terminalup_find_price", "terminalup_market", "terminalup_markets", "terminalup_sports", "terminalup_status"],
  );
});

test("data tools fail cleanly without a key", async () => {
  const saved = { a: process.env.TERMINALUP_API_KEY, s: process.env.TERMINALUP_SANDBOX_KEY };
  delete process.env.TERMINALUP_API_KEY;
  delete process.env.TERMINALUP_SANDBOX_KEY;
  try {
    const client = await connect();
    const result = await client.callTool({ name: "terminalup_sports", arguments: {} });
    assert.equal(result.isError, true);
    const payload = JSON.parse((result.content as { text: string }[])[0].text);
    assert.equal(payload.error.code, "no_key");
  } finally {
    if (saved.a) process.env.TERMINALUP_API_KEY = saved.a;
    if (saved.s) process.env.TERMINALUP_SANDBOX_KEY = saved.s;
  }
});

test("status works without a key (live network, set LIVE=1)", { skip: process.env.LIVE !== "1" }, async () => {
  const client = await connect();
  const result = await client.callTool({ name: "terminalup_status", arguments: {} });
  assert.notEqual(result.isError, true);
  const payload = JSON.parse((result.content as { text: string }[])[0].text);
  assert.equal(payload.service.name, "terminalup-odds-api");
});

test("compact view keeps what an agent needs", () => {
  const market: Market = {
    market_id: "m1",
    event: { id: "e1", name: "Team A at Team B", league: "NFL", sport: "football", start_time: "2026-11-10T01:15:00Z" },
    market_type: "moneyline",
    line: null,
    status: "open",
    status_reason: null,
    freshness: "fresh",
    seq: 12,
    epoch: "x",
    timestamps: { publish: "2026-11-09T15:00:00Z" },
    odds_format: "american",
    outcomes: [
      { slot: "outcome_a", selection: "Team A", mapping: { status: "verified" }, best: { odds: 112, probability: 0.4717, max_stake_usd: 2500, shares: 1179, venues: 3 }, raw: { ask: 0.46, bid: 0.44 }, asks: [], bids: [], liquidity_usd: 9000, venues: 3 },
      { slot: "outcome_b", selection: null, mapping: { status: "unverified" }, best: null, raw: { ask: null, bid: null }, asks: [], bids: [], liquidity_usd: 0, venues: 0 },
    ],
    venues: 3,
    attribution: [],
    line_set: "public",
    sandbox: false,
  };
  const c = compactMarket(market);
  assert.equal(c.outcomes[0].outcome, "Team A");
  assert.equal(c.outcomes[0].best_odds, 112);
  assert.equal(c.outcomes[1].outcome, "outcome_b");
  assert.equal(c.outcomes[1].best_odds, null);
  assert.equal(c.outcomes[1].label_verified, false);
});
