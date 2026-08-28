import { REQUEST_TIMEOUT_MS } from "../constants.js";

export class BinanceApiError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly binanceCode?: number,
  ) {
    super(message);
    this.name = "BinanceApiError";
  }
}

/**
 * GET a Binance public endpoint and return the parsed JSON body.
 * Shared by every tool so error handling, timeouts, and query-string
 * building only live in one place.
 */
export async function binanceGet<T>(
  baseUrl: string,
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<T> {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new BinanceApiError(
        `Request to Binance timed out after ${REQUEST_TIMEOUT_MS}ms (${path}). This means Claude could NOT confirm current data — do not assume stale/cached values are current. Retry, or reduce the requested range.`,
      );
    }
    throw new BinanceApiError(
      `Network error calling Binance (${path}): ${err instanceof Error ? err.message : String(err)}. No data was retrieved.`,
    );
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const binanceCode =
      body && typeof body === "object" && "code" in body
        ? (body as { code?: number }).code
        : undefined;
    const binanceMsg =
      body && typeof body === "object" && "msg" in body
        ? (body as { msg?: string }).msg
        : undefined;
    const codeTag =
      binanceCode !== undefined ? ` (Binance error code ${binanceCode})` : "";

    if (response.status === 429 || response.status === 418) {
      throw new BinanceApiError(
        `Binance rate limit hit (HTTP ${response.status})${codeTag} on ${path}. No data was retrieved for this call — do not substitute a prior/cached value as if it were current. Wait before retrying and avoid tight polling loops.`,
        response.status,
        binanceCode,
      );
    }
    if (response.status === 400 && binanceMsg) {
      throw new BinanceApiError(
        `Binance rejected the request to ${path}${codeTag}: ${binanceMsg}. Check the symbol is a valid, currently-listed Binance symbol (e.g. "BTCUSDT") and that other parameters are within allowed ranges. No data was retrieved.`,
        response.status,
        binanceCode,
      );
    }
    throw new BinanceApiError(
      `Binance returned HTTP ${response.status} for ${path}${codeTag}${binanceMsg ? `: ${binanceMsg}` : ""}. No data was retrieved.`,
      response.status,
      binanceCode,
    );
  }

  return body as T;
}

/** Normalize a user-supplied symbol like "btcusdt" -> "BTCUSDT". */
export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

/** Truncate a JSON-stringified payload to a character budget, noting the cut. */
export function truncateJson(value: unknown, limit: number): string {
  const full = JSON.stringify(value, null, 2);
  if (full.length <= limit) return full;
  return (
    full.slice(0, limit) +
    `\n\n... [truncated: response was ${full.length} chars, limit is ${limit}. Narrow your request (smaller "limit", fewer symbols, or a coarser interval) to see more.]`
  );
}

/** If Binance's authoritative answer is a genuinely empty result set, say so explicitly. */
function emptyResultNote(data: unknown): string | undefined {
  if (Array.isArray(data) && data.length === 0) {
    return "Binance returned zero records for these exact parameters. This is an authoritative empty result, not a failed call — verify the symbol is correct and the time range/period actually has data (e.g. a very new listing, or a window before the symbol existed).";
  }
  return undefined;
}

export type MarketKind =
  | "SPOT"
  | "USDS_M_FUTURES"
  | "COIN_M_FUTURES"
  | "OPTIONS"
  | "SYSTEM";

export interface EnvelopeInput {
  market: MarketKind;
  source: string;
  endpoint: string;
  symbol?: string | string[];
  /** Set when the endpoint itself provides no timestamp, or has some other known caveat. */
  caveat?: string;
}

/**
 * Wrap a raw Binance response in a small, explicit metadata envelope so
 * Claude (and the person reading its answer) can always tell:
 *  - which Binance market/product and symbol this came from
 *  - which exact endpoint was called
 *  - when THIS SERVER fetched it (not a Binance-reported time)
 *  - any known caveat
 *
 * The `data` field is passed through untouched.
 */
export function buildEnvelope(
  input: EnvelopeInput,
  data: unknown,
): Record<string, unknown> {
  const notes = [input.caveat, emptyResultNote(data)].filter(Boolean);
  return {
    meta: {
      market: input.market,
      source: input.source,
      endpoint: input.endpoint,
      symbol: input.symbol ?? "ALL_SYMBOLS",
      fetched_at_utc: new Date().toISOString(),
      fetched_at_note:
        "fetched_at_utc is this server's own retrieval time, not a timestamp reported by Binance. Use timestamp fields WITHIN `data` (if present) as the authoritative Binance time.",
      ...(notes.length ? { data_note: notes.join(" ") } : {}),
    },
    data,
  };
}
