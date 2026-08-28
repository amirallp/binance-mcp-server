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
  KLINE_INTERVALS,
  SPOT_BASE_URL,
  SPOT_DEPTH_LIMITS,
  SPOT_SOURCE,
} from "../constants.js";

const MARKET = "SPOT" as const;

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

const DepthLimit = z.custom<(typeof SPOT_DEPTH_LIMITS)[number]>(
  (val) => typeof val === "number" && (SPOT_DEPTH_LIMITS as readonly number[]).includes(val),
  { message: `limit must be one of: ${SPOT_DEPTH_LIMITS.join(", ")}` },
);

export function registerSpotTools(server: McpServer): void {
  server.registerTool(
    "binance_get_price",
    {
      title: "Binance Spot Price",
      description: `Get the CURRENT last-traded price for one or more Binance SPOT pairs.
Official endpoint: GET /api/v3/ticker/price (public, no key).
No Binance-side timestamp on this endpoint.

Args:
  - symbol (string, optional)
  - symbols (string[], optional) — use OR symbol, not both
  - omit both for ALL symbols (large)`,
      inputSchema: {
        symbol: z.string().optional().describe('e.g. "BTCUSDT"'),
        symbols: z.array(z.string()).optional().describe('e.g. ["BTCUSDT","ETHUSDT"]'),
      },
      annotations: readOnly,
    },
    async ({ symbol, symbols }) => {
      const params: Record<string, string> = {};
      if (symbol) params.symbol = normalizeSymbol(symbol);
      if (symbols?.length) params.symbols = JSON.stringify(symbols.map(normalizeSymbol));
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/ticker/price", params);
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: SPOT_SOURCE,
          endpoint: "/api/v3/ticker/price",
          symbol: symbol ?? symbols,
          caveat: "This endpoint provides no Binance-side timestamp.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_avg_price",
    {
      title: "Binance Spot Average Price",
      description: `Get Binance's current average price for a SPOT symbol (volume-weighted over Binance's internal window; mins returned by Binance).
Official endpoint: GET /api/v3/avgPrice (public, no key).`,
      inputSchema: {
        symbol: z.string().describe('e.g. "BTCUSDT"'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/avgPrice", {
        symbol: normalizeSymbol(symbol),
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: SPOT_SOURCE,
          endpoint: "/api/v3/avgPrice",
          symbol,
          caveat: "This endpoint provides no Binance-side wall-clock timestamp beyond the averaging window length.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_book_ticker",
    {
      title: "Binance Spot Best Bid/Ask",
      description: `Get CURRENT best bid/ask for one or all SPOT symbols.
Official endpoint: GET /api/v3/ticker/bookTicker (public, no key). No timestamp.`,
      inputSchema: {
        symbol: z.string().optional().describe('e.g. "BTCUSDT"'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/ticker/bookTicker", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: SPOT_SOURCE,
          endpoint: "/api/v3/ticker/bookTicker",
          symbol,
          caveat: "This endpoint provides no Binance-side timestamp.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_24hr_ticker",
    {
      title: "Binance Spot 24hr Ticker",
      description: `Get 24-hour rolling statistics for one or all SPOT symbols.
Official endpoint: GET /api/v3/ticker/24hr (public, no key).`,
      inputSchema: {
        symbol: z.string().optional().describe('e.g. "BTCUSDT"'),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/ticker/24hr", {
        symbol: symbol ? normalizeSymbol(symbol) : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: SPOT_SOURCE, endpoint: "/api/v3/ticker/24hr", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_rolling_ticker",
    {
      title: "Binance Spot Rolling Window Ticker",
      description: `Get price change statistics over a custom rolling window (not fixed 24h).
Official endpoint: GET /api/v3/ticker (public, no key).

Args:
  - symbol (string, required) OR symbols (string[])
  - window_size (string, optional): e.g. "1m","5m","1h","4h","1d" — Binance-accepted window sizes`,
      inputSchema: {
        symbol: z.string().optional().describe('e.g. "BTCUSDT"'),
        symbols: z.array(z.string()).optional(),
        window_size: z.string().optional().describe('e.g. "1h", "4h", "1d"'),
      },
      annotations: readOnly,
    },
    async ({ symbol, symbols, window_size }) => {
      const params: Record<string, string> = {};
      if (symbol) params.symbol = normalizeSymbol(symbol);
      if (symbols?.length) params.symbols = JSON.stringify(symbols.map(normalizeSymbol));
      if (window_size) params.windowSize = window_size;
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/ticker", params);
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: SPOT_SOURCE,
          endpoint: "/api/v3/ticker",
          symbol: symbol ?? symbols,
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_klines",
    {
      title: "Binance Spot Klines (OHLCV)",
      description: `Get candlestick data for a SPOT symbol.
Official endpoint: GET /api/v3/klines (public, no key).
Taker sell volume = volume − taker_buy_base_volume (derive; do not treat as a Binance field).`,
      inputSchema: {
        symbol: z.string().describe('e.g. "BTCUSDT"'),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1000).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(SPOT_BASE_URL, "/api/v3/klines", {
        symbol: normalizeSymbol(symbol),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        { market: MARKET, source: SPOT_SOURCE, endpoint: "/api/v3/klines", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_ui_klines",
    {
      title: "Binance Spot UI Klines",
      description: `Get candlestick data optimised for chart UI (same fields as klines, slight response differences per Binance).
Official endpoint: GET /api/v3/uiKlines (public, no key).`,
      inputSchema: {
        symbol: z.string().describe('e.g. "BTCUSDT"'),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1000).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, interval, limit, start_time_ms, end_time_ms }) => {
      const raw = await binanceGet<unknown[][]>(SPOT_BASE_URL, "/api/v3/uiKlines", {
        symbol: normalizeSymbol(symbol),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const data = raw.map(mapKline);
      const envelope = buildEnvelope(
        { market: MARKET, source: SPOT_SOURCE, endpoint: "/api/v3/uiKlines", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_order_book",
    {
      title: "Binance Spot Order Book",
      description: `Get CURRENT order book for a SPOT symbol.
Official endpoint: GET /api/v3/depth (public, no key).
limit must be one of: ${SPOT_DEPTH_LIMITS.join(", ")}.`,
      inputSchema: {
        symbol: z.string().describe('e.g. "BTCUSDT"'),
        limit: DepthLimit.optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit }) => {
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/depth", {
        symbol: normalizeSymbol(symbol),
        limit: limit ?? 100,
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: SPOT_SOURCE,
          endpoint: "/api/v3/depth",
          symbol,
          caveat: "Spot depth lastUpdateId is a sequence number, not a wall-clock timestamp.",
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_recent_trades",
    {
      title: "Binance Spot Recent Trades",
      description: `Get most recent public trades for a SPOT symbol.
Official endpoint: GET /api/v3/trades (public, no key).`,
      inputSchema: {
        symbol: z.string().describe('e.g. "BTCUSDT"'),
        limit: z.number().int().min(1).max(1000).optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit }) => {
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/trades", {
        symbol: normalizeSymbol(symbol),
        limit: limit ?? 500,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: SPOT_SOURCE, endpoint: "/api/v3/trades", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_agg_trades",
    {
      title: "Binance Spot Aggregate Trades",
      description: `Get compressed/aggregate trades for a SPOT symbol.
Official endpoint: GET /api/v3/aggTrades (public, no key).`,
      inputSchema: {
        symbol: z.string().describe('e.g. "BTCUSDT"'),
        limit: z.number().int().min(1).max(1000).optional(),
        from_id: z.number().int().optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit, from_id, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/aggTrades", {
        symbol: normalizeSymbol(symbol),
        limit: limit ?? 500,
        fromId: from_id,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: SPOT_SOURCE, endpoint: "/api/v3/aggTrades", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_get_exchange_info",
    {
      title: "Binance Spot Exchange / Symbol Info",
      description: `Get SPOT exchange trading rules and symbol filters (tick size, lot size, status, permissions).
Official endpoint: GET /api/v3/exchangeInfo (public, no key).`,
      inputSchema: {
        symbol: z.string().optional().describe('e.g. "BTCUSDT"'),
        symbols: z.array(z.string()).optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, symbols }) => {
      const params: Record<string, string> = {};
      if (symbol) params.symbol = normalizeSymbol(symbol);
      if (symbols?.length) params.symbols = JSON.stringify(symbols.map(normalizeSymbol));
      const data = await binanceGet(SPOT_BASE_URL, "/api/v3/exchangeInfo", params);
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: SPOT_SOURCE,
          endpoint: "/api/v3/exchangeInfo",
          symbol: symbol ?? symbols,
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );
}
