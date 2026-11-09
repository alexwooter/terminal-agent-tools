// Thin HTTP client for the TerminalUp Odds API.
// Base URL and key come from the caller (per-request header) or the environment.

export const DEFAULT_BASE_URL = "https://terminal-up-hq.replit.app";

export type KeySource = "request" | "env" | "sandbox" | "none";

export interface Credentials {
  baseUrl: string;
  apiKey: string | null;
  keySource: KeySource;
}

const KEY_PATTERN = /^tu_(live|test)_[A-Za-z0-9]{40}$/;

export function isApiKey(value: string | undefined | null): value is string {
  return typeof value === "string" && KEY_PATTERN.test(value.trim());
}

/** Resolve the key for a call: an explicit key wins, then TERMINALUP_API_KEY, then TERMINALUP_SANDBOX_KEY. */
export function resolveCredentials(requestKey?: string | null): Credentials {
  const baseUrl = (process.env.TERMINALUP_ODDS_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  if (isApiKey(requestKey)) return { baseUrl, apiKey: requestKey.trim(), keySource: "request" };
  if (isApiKey(process.env.TERMINALUP_API_KEY)) return { baseUrl, apiKey: process.env.TERMINALUP_API_KEY.trim(), keySource: "env" };
  if (isApiKey(process.env.TERMINALUP_SANDBOX_KEY)) return { baseUrl, apiKey: process.env.TERMINALUP_SANDBOX_KEY.trim(), keySource: "sandbox" };
  return { baseUrl, apiKey: null, keySource: "none" };
}

export class OddsApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export interface Query {
  [key: string]: string | number | boolean | undefined | null;
}

export async function getJson<T>(creds: Credentials, path: string, query: Query = {}, needsKey = true): Promise<T> {
  if (needsKey && !creds.apiKey) {
    throw new OddsApiError(
      401,
      "no_key",
      "No TerminalUp API key. Pass one as an Authorization: Bearer header on the MCP connection, or set TERMINALUP_API_KEY (live) or TERMINALUP_SANDBOX_KEY (tu_test_) in the server environment. Request a key at https://terminalup.com/contact.",
      null,
    );
  }
  const url = new URL(path, creds.baseUrl);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: "application/json", "User-Agent": "terminalup-odds-mcp/0.1" };
  if (creds.apiKey && needsKey) headers.Authorization = `Bearer ${creds.apiKey}`;

  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15_000) });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!response.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    const retry = response.headers.get("retry-after");
    const suffix = retry ? ` Retry after ${retry}s.` : "";
    throw new OddsApiError(response.status, err?.code ?? `http_${response.status}`, (err?.message ?? `HTTP ${response.status}`) + suffix, body);
  }
  return body as T;
}

/* ---------- payload types (subset of the OpenAPI document) ---------- */

export interface Best {
  odds: number;
  probability: number;
  max_stake_usd: number;
  shares: number;
  venues: number;
}
export interface Level {
  odds: number;
  probability: number;
  stake_usd: number;
  shares: number;
  venues: number;
}
export interface Outcome {
  slot: string;
  selection: string | null;
  mapping: { status: string; evidence?: string | null };
  best: Best | null;
  raw: { ask: number | null; bid: number | null };
  asks: Level[];
  bids: Level[];
  liquidity_usd: number;
  venues: number;
}
export interface Market {
  market_id: string;
  event: { id: string; name: string; league: string; sport: string; start_time: string };
  market_type: string;
  line: number | null;
  status: string;
  status_reason: string | null;
  freshness: string;
  seq: number;
  epoch: string;
  timestamps: { source?: string | null; ingest?: string | null; confirmed?: string | null; publish: string };
  odds_format: string;
  outcomes: Outcome[];
  venues: number;
  attribution: string[];
  line_set: string;
  sandbox: boolean;
  link?: string;
}
export interface MarketList {
  markets: Market[];
  next_cursor: string | null;
  sandbox?: boolean;
}
export interface EventList {
  events: { id: string; name: string; league: string; sport: string; start_time: string; markets: number; market_types: string[] }[];
  next_cursor: string | null;
}
export interface SportList {
  sports: { key: string; name: string; leagues: { code: string; name: string; sport: string; events: number; markets: number }[] }[];
}
