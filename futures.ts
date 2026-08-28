import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  binanceGet,
  buildEnvelope,
  normalizeSymbol,
  truncateJson,
} from "../services/binanceClient.js";
import {
  CHARACTER_LIMIT,
  CONTRACT_TYPES,
  FUTURES_BASE_URL,
  FUTURES_DEPTH_LIMITS,
  FUTURES_SOURCE,
  KLINE_INTERVALS,
  STATS_PERIODS,
} from "../constants.js";

const MARKET = "USDS_M_FUTURES" as const;

const KLINE_FIELDS = [
  "open_time",
  "open",
  "high",
  "low",
  "close",
  "volume",
  "close_time",
  "quote_asset_volume",
  "num_trades",
  "taker_buy_base_volume",
  "taker_buy_quote_volume",
] as const;

function mapKline(raw: unknown[]): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  KLINE_FIELDS.forEach((field, i) => (obj[field] = raw[i]));
  return obj;
}

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const DepthLimit = z.custom<(typeof FUTURES_DEPTH_LIMITS)[number]>(
  (val) => typeof val === "number" && (FUTURES_DEPTH_LIMITS as readonly number[]).includes(val),
  { message: `limit must be one of: ${FUTURES_DEPTH_LIMITS.join(", ")}` },
);

/**
 * USDⓈ-M Futures tools — prioritised for perpetual futures trading analysis.
 * All endpoints are public (no API key). Data is returned raw from Binance.
 */
export function registerFuturesTools(server: McpServer): void {
  // ─── Price & mark ───────────────────────────────────────────────────────

  server.registerTool(
    "binance_futures_get_mark_price",
    {
      title: "Binance Futures Mark / Index / Funding (premiumIndex)",
      description: `Get the CURRENT mark price, index price, last funding rate, next funding time, and estimated settle price for one or all USDⓈ-M futures symbols.
This is the single most important real-time pricing snapshot for perpetual futures.
Official endpoint: GET /fapi/v1/premiumIndex (public, no key).

Args:
  - symbol (string, optional): e.g. "BTCUSDT". Omit for ALL symbols (large).

Returns: raw Binance object(s) with markPrice, indexPrice, lastFundingRate, nextFundingTime, interestRate, time, etc.

Example: "Current mark and funding for BTCUSDT perp" -> symbol: "BTCUSDT"`,
      inputSchema: {
        symbol: z.string().optional().describe('Futures symbol, e.g. "BTCUSDT". Omit for all.'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/premiumIndex", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/premiumIndex", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_price",
    {
      title: "Binance Futures Last Price",
      description: `Get the CURRENT last traded price for one or all USDⓈ-M futures symbols.
Official endpoint: GET /fapi/v1/ticker/price (public, no key).

Args:
  - symbol (string, optional): e.g. "BTCUSDT". Omit for all.

Returns: raw { symbol, price, time }.

Example: "Last price of ETHUSDT perp" -> symbol: "ETHUSDT"`,
      inputSchema: {
        symbol: z.string().optional().describe('Futures symbol, e.g. "BTCUSDT".'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/ticker/price", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/ticker/price", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_book_ticker",
    {
      title: "Binance Futures Best Bid/Ask",
      description: `Get the CURRENT best bid and ask (top of book) for one or all USDⓈ-M futures symbols.
Official endpoint: GET /fapi/v1/ticker/bookTicker (public, no key).

Args:
  - symbol (string, optional): e.g. "BTCUSDT". Omit for all.

Returns: raw { symbol, bidPrice, bidQty, askPrice, askQty, time }.`,
      inputSchema: {
        symbol: z.string().optional().describe('Futures symbol, e.g. "BTCUSDT".'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/ticker/bookTicker", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/ticker/bookTicker", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_ticker",
    {
      title: "Binance Futures 24hr Ticker",
      description: `Get 24-hour rolling window statistics for one or all USDⓈ-M futures symbols: price change, % change, high, low, volume, quote volume, weighted avg price, last price, open interest related fields where present.
Official endpoint: GET /fapi/v1/ticker/24hr (public, no key).

Args:
  - symbol (string, optional): e.g. "BTCUSDT". Omit for all (very large).

Returns: raw Binance 24hr ticker object(s).`,
      inputSchema: {
        symbol: z.string().optional().describe('Futures symbol, e.g. "BTCUSDT".'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/ticker/24hr", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/ticker/24hr", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  // ─── Order book & trades ────────────────────────────────────────────────

  server.registerTool(
    "binance_futures_get_order_book",
    {
      title: "Binance Futures Order Book",
      description: `Get the CURRENT order book (bids/asks) for a USDⓈ-M futures symbol.
Official endpoint: GET /fapi/v1/depth (public, no key).

Args:
  - symbol (string, required): e.g. "BTCUSDT"
  - limit (number, optional): one of ${FUTURES_DEPTH_LIMITS.join(", ")}. Default 100.

Returns: raw { lastUpdateId, E, T, bids, asks }. Futures depth includes event and transaction timestamps.`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        limit: DepthLimit.optional().describe(`Depth levels. One of: ${FUTURES_DEPTH_LIMITS.join(", ")}`),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/depth", {
        symbol: normalizeSymbol(symbol),
        limit: limit ?? 100,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/depth", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_recent_trades",
    {
      title: "Binance Futures Recent Trades",
      description: `Get the most recent public trades for a USDⓈ-M futures symbol.
Official endpoint: GET /fapi/v1/trades (public, no key).

Args:
  - symbol (string, required)
  - limit (number, optional): default 500, max 1000.

Returns: raw array of trades (id, price, qty, quoteQty, time, isBuyerMaker).`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        limit: z.number().int().min(1).max(1000).optional().describe("1–1000, default 500"),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/trades", {
        symbol: normalizeSymbol(symbol),
        limit: limit ?? 500,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/trades", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_agg_trades",
    {
      title: "Binance Futures Aggregate Trades",
      description: `Get compressed/aggregate trades for a USDⓈ-M futures symbol (trades at same price and taker side within ~100ms are aggregated).
Official endpoint: GET /fapi/v1/aggTrades (public, no key).

Args:
  - symbol (string, required)
  - limit (number, optional): default 500, max 1000
  - from_id (number, optional): aggregate trade ID to fetch from
  - start_time_ms / end_time_ms (number, optional): unix ms window

Returns: raw aggregate trade array.`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        limit: z.number().int().min(1).max(1000).optional(),
        from_id: z.number().int().optional().describe("Aggregate trade ID to start from"),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit, from_id, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/aggTrades", {
        symbol: normalizeSymbol(symbol),
        limit: limit ?? 500,
        fromId: from_id,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/aggTrades", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  // ─── Klines ─────────────────────────────────────────────────────────────

  server.registerTool(
    "binance_futures_get_klines",
    {
      title: "Binance Futures Klines (OHLCV)",
      description: `Get candlestick/klines for a USDⓈ-M futures symbol.
Official endpoint: GET /fapi/v1/klines (public, no key).

Args:
  - symbol (string, required)
  - interval (string, required): one of ${KLINE_INTERVALS.join(", ")}
  - limit (number, optional): default 500, max 1500
  - start_time_ms / end_time_ms (number, optional)

Returns: array of mapped candles { open_time, open, high, low, close, volume, close_time, quote_asset_volume, num_trades, taker_buy_base_volume, taker_buy_quote_volume }.
Taker sell volume is NOT returned by Binance — derive as volume − taker_buy_base_volume if needed (do not invent it as a Binance field).`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        interval: z.enum(KLINE_INTERVALS).describe("Candle interval"),
        limit: z.number().int().min(1).max(1500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(FUTURES_BASE_URL, "/fapi/v1/klines", {
        symbol: normalizeSymbol(symbol),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/klines", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_continuous_klines",
    {
      title: "Binance Futures Continuous Contract Klines",
      description: `Get continuous-contract klines for a pair + contract type (PERPETUAL / CURRENT_QUARTER / NEXT_QUARTER). Useful for unbroken perp or quarterly series.
Official endpoint: GET /fapi/v1/continuousKlines (public, no key).

Args:
  - pair (string, required): e.g. "BTCUSDT" (pair, not individual delivery symbol)
  - contract_type (string, required): PERPETUAL | CURRENT_QUARTER | NEXT_QUARTER
  - interval (string, required)
  - limit (number, optional): default 500, max 1500
  - start_time_ms / end_time_ms (optional)`,
      inputSchema: {
        pair: z.string().describe('Pair, e.g. "BTCUSDT"'),
        contract_type: z.enum(CONTRACT_TYPES).describe("Contract type"),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ pair, contract_type, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(FUTURES_BASE_URL, "/fapi/v1/continuousKlines", {
        pair: normalizeSymbol(pair),
        contractType: contract_type,
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/fapi/v1/continuousKlines",
          symbol: `${normalizeSymbol(pair)}:${contract_type}`,
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_mark_price_klines",
    {
      title: "Binance Futures Mark Price Klines",
      description: `Get klines built from the mark price (not last trade). Critical for fair-value and liquidation-related analysis.
Official endpoint: GET /fapi/v1/markPriceKlines (public, no key).

Args: symbol, interval, limit (max 1500), start_time_ms, end_time_ms.`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(FUTURES_BASE_URL, "/fapi/v1/markPriceKlines", {
        symbol: normalizeSymbol(symbol),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/markPriceKlines", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_index_price_klines",
    {
      title: "Binance Futures Index Price Klines",
      description: `Get klines built from the index price (spot composite used for mark).
Official endpoint: GET /fapi/v1/indexPriceKlines (public, no key).

Args: pair (e.g. "BTCUSDT"), interval, limit, start_time_ms, end_time_ms.`,
      inputSchema: {
        pair: z.string().describe('Pair, e.g. "BTCUSDT"'),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ pair, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(FUTURES_BASE_URL, "/fapi/v1/indexPriceKlines", {
        pair: normalizeSymbol(pair),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/indexPriceKlines", symbol: pair },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_premium_index_klines",
    {
      title: "Binance Futures Premium Index Klines",
      description: `Get klines of the premium index (mark − index basis over time). Useful for funding/basis regime analysis.
Official endpoint: GET /fapi/v1/premiumIndexKlines (public, no key).

Args: symbol, interval, limit, start_time_ms, end_time_ms.`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(FUTURES_BASE_URL, "/fapi/v1/premiumIndexKlines", {
        symbol: normalizeSymbol(symbol),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/premiumIndexKlines", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  // ─── Funding ────────────────────────────────────────────────────────────

  server.registerTool(
    "binance_futures_get_funding_rate_history",
    {
      title: "Binance Futures Funding Rate History",
      description: `Get historical funding rates for a USDⓈ-M perpetual symbol. Essential for carry / funding cost analysis.
Official endpoint: GET /fapi/v1/fundingRate (public, no key).

Args:
  - symbol (string, optional): e.g. "BTCUSDT". Omit for mixed recent history across symbols (Binance behaviour).
  - limit (number, optional): default 100, max 1000
  - start_time_ms / end_time_ms (optional)

Returns: raw array of { symbol, fundingRate, fundingTime, markPrice }.`,
      inputSchema: {
        symbol: z.string().optional().describe('Futures symbol, e.g. "BTCUSDT"'),
        limit: z.number().int().min(1).max(1000).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/fundingRate", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
        limit: limit ?? 100,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/fundingRate", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_funding_info",
    {
      title: "Binance Futures Funding Info (interval/cap)",
      description: `Get per-symbol funding interval and funding rate cap/floor configuration.
Official endpoint: GET /fapi/v1/fundingInfo (public, no key).
NOTE: only symbols with NON-DEFAULT funding interval/cap appear. Absence means the symbol uses Binance's standard 8h interval — not that data is missing.

Returns: raw list of funding config objects.`,
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/fundingInfo", {});
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/fapi/v1/fundingInfo",
          caveat:
            "Only symbols with non-default funding interval/cap are listed. Symbols absent from this list use the standard 8-hour funding interval.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  // ─── Open interest & positioning ────────────────────────────────────────

  server.registerTool(
    "binance_futures_get_open_interest",
    {
      title: "Binance Futures Open Interest (current)",
      description: `Get the CURRENT open interest for a USDⓈ-M futures symbol.
Official endpoint: GET /fapi/v1/openInterest (public, no key).

Args:
  - symbol (string, required)

Returns: raw { symbol, openInterest, time }.`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/openInterest", {
        symbol: normalizeSymbol(symbol),
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: FUTURES_SOURCE, endpoint: "/fapi/v1/openInterest", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_open_interest_history",
    {
      title: "Binance Futures Open Interest History",
      description: `Get historical open interest statistics for a USDⓈ-M futures symbol.
Official endpoint: GET /futures/data/openInterestHist (public, no key).
Binance retains roughly the last 30 days.

Args:
  - symbol (string, required)
  - period (string, required): one of ${STATS_PERIODS.join(", ")}
  - limit (number, optional): default 30, max 500
  - start_time_ms / end_time_ms (optional)`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        period: z.enum(STATS_PERIODS).describe("Aggregation period"),
        limit: z.number().int().min(1).max(500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, period, limit, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/futures/data/openInterestHist", {
        symbol: normalizeSymbol(symbol),
        period,
        limit: limit ?? 30,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/futures/data/openInterestHist",
          symbol,
          caveat: "Binance retains this history for roughly the last 30 days only.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_long_short_ratio",
    {
      title: "Binance Futures Long/Short Ratio",
      description: `Get long/short account or position ratio history for a USDⓈ-M futures symbol. Core positioning data for crowd analysis.
Official endpoints (selected by ratio_type):
  - globalLongShortAccountRatio  → overall account long/short
  - topLongShortAccountRatio     → top trader accounts
  - topLongShortPositionRatio    → top trader positions
All under /futures/data/* (public, no key). ~30 days retention.

Args:
  - symbol (string, required)
  - ratio_type (string, required): "global_account" | "top_account" | "top_position"
  - period (string, required): one of ${STATS_PERIODS.join(", ")}
  - limit (number, optional): default 30, max 500
  - start_time_ms / end_time_ms (optional)`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        ratio_type: z
          .enum(["global_account", "top_account", "top_position"])
          .describe("Which long/short ratio series"),
        period: z.enum(STATS_PERIODS),
        limit: z.number().int().min(1).max(500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, ratio_type, period, limit, start_time_ms, end_time_ms }) => {
      const pathMap = {
        global_account: "/futures/data/globalLongShortAccountRatio",
        top_account: "/futures/data/topLongShortAccountRatio",
        top_position: "/futures/data/topLongShortPositionRatio",
      } as const;
      const endpoint = pathMap[ratio_type];
      const data = await binanceGet(FUTURES_BASE_URL, endpoint, {
        symbol: normalizeSymbol(symbol),
        period,
        limit: limit ?? 30,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint,
          symbol,
          caveat: "Binance retains this history for roughly the last 30 days only.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_taker_buy_sell_volume",
    {
      title: "Binance Futures Taker Buy/Sell Volume",
      description: `Get historical taker buy/sell volume ratio for a USDⓈ-M futures symbol. Shows aggressive flow (who is lifting the ask vs hitting the bid).
Official endpoint: GET /futures/data/takerlongshortRatio (public, no key). ~30 days retention.

Args:
  - symbol (string, required)
  - period (string, required): one of ${STATS_PERIODS.join(", ")}
  - limit (number, optional): default 30, max 500
  - start_time_ms / end_time_ms (optional)`,
      inputSchema: {
        symbol: z.string().describe('Futures symbol, e.g. "BTCUSDT"'),
        period: z.enum(STATS_PERIODS),
        limit: z.number().int().min(1).max(500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, period, limit, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/futures/data/takerlongshortRatio", {
        symbol: normalizeSymbol(symbol),
        period,
        limit: limit ?? 30,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/futures/data/takerlongshortRatio",
          symbol,
          caveat: "Binance retains this history for roughly the last 30 days only.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_futures_get_basis",
    {
      title: "Binance Futures Basis",
      description: `Get historical futures basis (futures price vs index) for a pair and contract type. Key for contango/backwardation and roll analysis.
Official endpoint: GET /futures/data/basis (public, no key).

Args:
  - pair (string, required): e.g. "BTCUSDT"
  - contract_type (string, required): PERPETUAL | CURRENT_QUARTER | NEXT_QUARTER
  - period (string, required): one of ${STATS_PERIODS.join(", ")}
  - limit (number, optional): default 30, max 500
  - start_time_ms / end_time_ms (optional)`,
      inputSchema: {
        pair: z.string().describe('Pair, e.g. "BTCUSDT"'),
        contract_type: z.enum(CONTRACT_TYPES),
        period: z.enum(STATS_PERIODS),
        limit: z.number().int().min(1).max(500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ pair, contract_type, period, limit, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/futures/data/basis", {
        pair: normalizeSymbol(pair),
        contractType: contract_type,
        period,
        limit: limit ?? 30,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/futures/data/basis",
          symbol: `${normalizeSymbol(pair)}:${contract_type}`,
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  // ─── Liquidations (limited public REST) ─────────────────────────────────

  server.registerTool(
    "binance_futures_get_force_orders",
    {
      title: "Binance Futures Recent Force Orders (Liquidations)",
      description: `Get recent liquidation (force order) records for a USDⓈ-M futures symbol, or globally if symbol omitted.
Official endpoint: GET /fapi/v1/forceOrders (public, no key — MARKET_DATA style public access on this path).
IMPORTANT: this is a REST snapshot of *recent* liquidations Binance chooses to expose, NOT a live stream. Absence of rows does not mean "no liquidations happening right now" — it means none in the retained recent window Binance returned. For true real-time liquidation flow you would need the WebSocket !forceOrder@arr stream (out of scope for this request/response server).

Args:
  - symbol (string, optional)
  - auto_close_type (string, optional): "LIQUIDATION" | "ADL"
  - start_time_ms / end_time_ms (optional)
  - limit (number, optional): default 100, max 1000`,
      inputSchema: {
        symbol: z.string().optional().describe('Futures symbol, e.g. "BTCUSDT"'),
        auto_close_type: z.enum(["LIQUIDATION", "ADL"]).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
        limit: z.number().int().min(1).max(1000).optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, auto_close_type, start_time_ms, end_time_ms, limit }) => {
      const data = await binanceGet(FUTURES_BASE_URL, "/fapi/v1/forceOrders", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
        autoCloseType: auto_close_type,
        startTime: start_time_ms,
        endTime: end_time_ms,
        limit: limit ?? 100,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/fapi/v1/forceOrders",
          symbol,
          caveat:
            "REST snapshot of recent force orders only — not a live liquidation feed. Empty result means none in Binance's retained recent window for these params, not that liquidations are absent in real time.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  // ─── Exchange metadata ──────────────────────────────────────────────────

  server.registerTool(
    "binance_futures_get_exchange_info",
    {
      title: "Binance Futures Exchange / Symbol Info",
      description: `Get exchange metadata for USDⓈ-M futures: symbol status, contract type, price/qty filters (tick size, lot size, min notional), onboard date, etc.
Official endpoint: GET /fapi/v1/exchangeInfo (public, no key).
NOTE: Binance does not support server-side symbol filter on this endpoint; this tool fetches full list and filters locally when symbol is given.

Args:
  - symbol (string, optional)`,
      inputSchema: {
        symbol: z.string().optional().describe('Single futures symbol, e.g. "BTCUSDT"'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet<{ symbols?: Array<{ symbol: string }> }>(
        FUTURES_BASE_URL,
        "/fapi/v1/exchangeInfo",
        {},
      );
      const match = symbol
        ? data.symbols?.find((s) => s.symbol === normalizeSymbol(symbol))
        : undefined;
      const payload = symbol ? match ?? data : data;
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: FUTURES_SOURCE,
          endpoint: "/fapi/v1/exchangeInfo",
          symbol,
          caveat:
            symbol && !match
              ? `No entry for "${normalizeSymbol(symbol)}" in USDⓈ-M futures exchangeInfo — it may not be listed on this market.`
              : undefined,
        },
        payload,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );
}
