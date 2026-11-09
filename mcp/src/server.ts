// Tool definitions for the TerminalUp Odds MCP server.
// One factory builds a server bound to one set of credentials, so the HTTP
// transport can forward each client's own key and stdio can use the environment.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getJson,
  OddsApiError,
  type Credentials,
  type EventList,
  type Market,
  type MarketList,
  type SportList,
} from "./client.js";

export const SERVER_NAME = "terminalup-odds";
export const SERVER_VERSION = "0.1.0";

const oddsFormat = z.enum(["decimal", "american", "probability"]).default("decimal").describe("Odds format for every odds field.");
const league = z.string().max(200).optional().describe("League code(s), case-insensitive, comma-separated. Example: NFL or NFL,NCAAF.");
const limit = z.number().int().min(1).max(500).default(50).describe("Page size, 1 to 500.");
const cursor = z.string().max(500).optional().describe("Cursor from a previous page's next_cursor.");

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

const failure = (error: unknown): ToolResult => {
  if (error instanceof OddsApiError) {
    return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { status: error.status, code: error.code, message: error.message } }) }] };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: JSON.stringify({ error: { code: "mcp_error", message } }) }] };
};

/** Compact view of a market: what an agent needs to answer a price question. */
export function compactMarket(m: Market) {
  return {
    market_id: m.market_id,
    event: m.event.name,
    league: m.event.league,
    start_time: m.event.start_time,
    market_type: m.market_type,
    line: m.line,
    status: m.status,
    status_reason: m.status_reason,
    freshness: m.freshness,
    odds_format: m.odds_format,
    outcomes: m.outcomes.map((o) => ({
      outcome: o.selection ?? o.slot,
      label_verified: o.mapping?.status === "verified",
      best_odds: o.best?.odds ?? null,
      implied_probability: o.best?.probability ?? null,
      max_stake_usd: o.best?.max_stake_usd ?? null,
      liquidity_usd: o.liquidity_usd,
      venues: o.venues,
    })),
    venues: m.venues,
    attribution: m.attribution,
    sandbox: m.sandbox,
    published_at: m.timestamps?.publish,
    link: m.link,
  };
}

const sandboxNote = (creds: Credentials, payload: { sandbox?: boolean } | Market[] | undefined) => {
  const isSandbox = Array.isArray(payload) ? payload.some((m) => m.sandbox) : payload?.sandbox === true;
  if (isSandbox || creds.keySource === "sandbox") {
    return "SANDBOX DATA: synthetic markets from a tu_test_ key. Events are fictional and prices carry no information about real games. Say so in any answer.";
  }
  return undefined;
};

export function createServer(creds: Credentials): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions: [
        "TerminalUp Odds API tools. TerminalUp is a cross-venue sports trading terminal (sportsbooks, betting exchanges, prediction markets) at https://terminalup.com; trading happens at https://trade.terminalup.com.",
        "best_odds is the lowest fee-adjusted ask a bettor could take right now from a licensed venue, rounded against the bettor. It is not a consensus or a model. A null best means no licensed price; never interpolate one.",
        "Markets with status stale or suspended have no current price. Never present an old price as current.",
        "Payloads marked sandbox:true are synthetic test data. Always label them as sandbox.",
        "Start with terminalup_status to see whether live data is flowing, then terminalup_sports to learn which leagues are available to your key.",
      ].join("\n"),
    },
  );

  server.registerTool(
    "terminalup_status",
    {
      title: "TerminalUp service status",
      description:
        "Public health of the TerminalUp Odds API: feed mode and connections, how many markets are published by status, enabled leagues, kill switches. Needs no key. Call first to know whether live prices are flowing.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const status = await getJson<Record<string, unknown>>(creds, "/v1/status", {}, false);
        const s = status as {
          service?: unknown;
          feed?: { mode?: string; connections?: unknown; coverage?: unknown };
          markets?: unknown;
          config?: { leagues_enabled?: unknown; kill_switch?: unknown; licensed_venues?: unknown; version?: unknown };
          sandbox?: unknown;
        };
        return text({
          service: s.service,
          feed_mode: s.feed?.mode,
          feed_connections: s.feed?.connections,
          coverage: s.feed?.coverage,
          markets: s.markets,
          leagues_enabled: s.config?.leagues_enabled,
          kill_switch: s.config?.kill_switch,
          licensed_venues: s.config?.licensed_venues,
          sandbox: s.sandbox,
          key_in_use: creds.keySource,
          base_url: creds.baseUrl,
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "terminalup_sports",
    {
      title: "List sports and leagues",
      description: "Sports and leagues that currently have published markets, limited to what the key is entitled to. Returns league codes to use in other tools.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () => {
      try {
        const sports = await getJson<SportList>(creds, "/v1/sports");
        return text({ note: sandboxNote(creds, undefined), ...sports });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "terminalup_events",
    {
      title: "List events",
      description: "Events (games) with published markets. Filter by league. Paginated with next_cursor.",
      inputSchema: { league, limit, cursor },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ league, limit, cursor }) => {
      try {
        const events = await getJson<EventList>(creds, "/v1/events", { league, limit, cursor });
        return text(events);
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "terminalup_markets",
    {
      title: "Current prices for markets",
      description:
        "Current state of markets with the TerminalUp best price per outcome, implied probability, stake available at best, liquidity and venue counts. Filter by league, event ids and market type (moneyline, spread, total). Compact by default; set full=true for the complete payload with ladders and timestamps.",
      inputSchema: {
        league,
        event: z.string().max(2000).optional().describe("Comma-separated event ids from terminalup_events."),
        market_type: z.string().max(100).optional().describe("moneyline, spread or total; comma-separated allowed."),
        odds_format: oddsFormat,
        limit,
        cursor,
        full: z.boolean().default(false).describe("Return the complete market payload (ladders, raw top of book, timestamps) instead of the compact view."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ league, event, market_type, odds_format, limit, cursor, full }) => {
      try {
        const page = await getJson<MarketList>(creds, "/v1/markets", { league, event, market_type, odds_format, limit, cursor });
        return text({
          note: sandboxNote(creds, page.markets),
          count: page.markets.length,
          next_cursor: page.next_cursor,
          markets: full ? page.markets : page.markets.map(compactMarket),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "terminalup_market",
    {
      title: "One market in full",
      description: "Full current state of one market by market_id: every outcome's best price, raw top of book, ask and bid ladders with stake, timestamps, status and freshness.",
      inputSchema: {
        market_id: z.string().min(1).max(100).describe("Market id from terminalup_markets."),
        odds_format: oddsFormat,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ market_id, odds_format }) => {
      try {
        const market = await getJson<Market>(creds, `/v1/markets/${encodeURIComponent(market_id)}`, { odds_format });
        return text({ note: sandboxNote(creds, [market]), market });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "terminalup_find_price",
    {
      title: "Find the best price for a team or game",
      description:
        "Search published markets in a league for a team or event name and return the best available price per outcome. Use for questions like 'best price on the Lakers tonight' or 'what is the total on Chiefs Bills'. Matching is case-insensitive substring on the event name and outcome labels.",
      inputSchema: {
        league: z.string().min(1).max(200).describe("League code(s), comma-separated."),
        query: z.string().min(1).max(200).describe("Team, player or event text to match."),
        market_type: z.string().max(100).optional().describe("Restrict to moneyline, spread or total."),
        odds_format: oddsFormat,
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ league, query, market_type, odds_format }) => {
      try {
        const needle = query.trim().toLowerCase();
        const matches: Market[] = [];
        let cursor: string | null | undefined = undefined;
        let pages = 0;
        do {
          const page: MarketList = await getJson<MarketList>(creds, "/v1/markets", { league, market_type, odds_format, limit: 500, cursor });
          for (const m of page.markets) {
            const hay = [m.event.name, ...m.outcomes.map((o) => o.selection ?? "")].join(" ").toLowerCase();
            if (hay.includes(needle)) matches.push(m);
          }
          cursor = page.next_cursor;
          pages += 1;
        } while (cursor && pages < 10);
        return text({
          note: sandboxNote(creds, matches),
          query,
          league,
          matches: matches.length,
          markets: matches.map(compactMarket),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  server.registerTool(
    "terminalup_docs",
    {
      title: "API documentation",
      description: "Fetch the TerminalUp Odds API documentation index (llms.txt) or one page as markdown: authentication, limits, quickstart-snapshot, quickstart-stream, sandbox, deep-links, reference, methodology, status, changelog.",
      inputSchema: {
        page: z
          .enum(["index", "authentication", "limits", "quickstart-snapshot", "quickstart-stream", "sandbox", "deep-links", "reference", "methodology", "status", "changelog"])
          .default("index")
          .describe("Documentation page. 'index' returns llms.txt."),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ page }) => {
      try {
        const path = page === "index" ? "/llms.txt" : `/docs/${page}.md`;
        const response = await fetch(new URL(path, creds.baseUrl), { headers: { Accept: "text/plain, text/markdown" }, signal: AbortSignal.timeout(15_000) });
        if (!response.ok) throw new OddsApiError(response.status, `http_${response.status}`, `Could not fetch ${path}`, null);
        return text(await response.text());
      } catch (error) {
        return failure(error);
      }
    },
  );

  return server;
}
