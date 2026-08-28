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
  OPTIONS_BASE_URL,
  OPTIONS_DEPTH_LIMITS,
  OPTIONS_SOURCE,
} from "../constants.js";

const MARKET = "OPTIONS" as const;

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

const DepthLimit = z.custom<(typeof OPTIONS_DEPTH_LIMITS)[number]>(
  (val) => typeof val === "number" && (OPTIONS_DEPTH_LIMITS as readonly number[]).includes(val),
  { message: `limit must be one of: ${OPTIONS_DEPTH_LIMITS.join(", ")}` },
);

/**
 * Binance European Options public market data — useful for options flow,
 * IV, and underlying index context alongside futures trading.
 */
export function registerOptionsTools(server: McpServer): void {
  server.registerTool(
    "binance_options_get_exchange_info",
    {
      title: "Binance Options Exchange Info",
      description: `Get options exchange metadata: option symbols, underlying, expiry, strike, side (CALL/PUT), filters.
Official endpoint: GET /eapi/v1/exchangeInfo (public, no key).`,
      inputSchema: {},
      annotations: readOnly,
    },
    async () => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/exchangeInfo", {});
      const envelope = buildEnvelope(
        { market: MARKET, source: OPTIONS_SOURCE, endpoint: "/eapi/v1/exchangeInfo" },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_mark",
    {
      title: "Binance Options Mark Price & Greeks",
      description: `Get options mark price, implied volatility, and greeks for one or all option symbols.
Official endpoint: GET /eapi/v1/mark (public, no key).

Args:
  - symbol (string, optional): option symbol e.g. "BTC-240927-60000-C". Omit for all (large).`,
      inputSchema: {
        symbol: z.string().optional().describe("Option symbol"),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/mark", {
        symbol: symbol ? symbol.trim().toUpperCase() : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: OPTIONS_SOURCE, endpoint: "/eapi/v1/mark", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_ticker",
    {
      title: "Binance Options 24hr Ticker",
      description: `Get 24-hour statistics for options symbols.
Official endpoint: GET /eapi/v1/ticker (public, no key).

Args:
  - symbol (string, optional)`,
      inputSchema: {
        symbol: z.string().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/ticker", {
        symbol: symbol ? symbol.trim().toUpperCase() : undefined,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: OPTIONS_SOURCE, endpoint: "/eapi/v1/ticker", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_index",
    {
      title: "Binance Options Underlying Index Price",
      description: `Get the spot index price for an options underlying asset (e.g. BTCUSDT).
Official endpoint: GET /eapi/v1/index (public, no key).

Args:
  - underlying (string, required): e.g. "BTCUSDT"`,
      inputSchema: {
        underlying: z.string().describe('Underlying, e.g. "BTCUSDT"'),
      },
      annotations: readOnly,
    },
    async ({ underlying }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/index", {
        underlying: normalizeSymbol(underlying),
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: OPTIONS_SOURCE,
          endpoint: "/eapi/v1/index",
          symbol: underlying,
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_klines",
    {
      title: "Binance Options Klines",
      description: `Get candlestick data for an option symbol.
Official endpoint: GET /eapi/v1/klines (public, no key).`,
      inputSchema: {
        symbol: z.string().describe("Option symbol"),
        interval: z.enum(KLINE_INTERVALS),
        limit: z.number().int().min(1).max(1500).optional(),
        start_time_ms: z.number().int().optional(),
        end_time_ms: z.number().int().optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, interval, limit, start_time_ms, end_time_ms }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/klines", {
        symbol: symbol.trim().toUpperCase(),
        interval,
        limit: limit ?? 500,
        startTime: start_time_ms,
        endTime: end_time_ms,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: OPTIONS_SOURCE, endpoint: "/eapi/v1/klines", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_order_book",
    {
      title: "Binance Options Order Book",
      description: `Get CURRENT order book for an option symbol.
Official endpoint: GET /eapi/v1/depth (public, no key).
limit one of: ${OPTIONS_DEPTH_LIMITS.join(", ")}.`,
      inputSchema: {
        symbol: z.string().describe("Option symbol"),
        limit: DepthLimit.optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/depth", {
        symbol: symbol.trim().toUpperCase(),
        limit: limit ?? 100,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: OPTIONS_SOURCE, endpoint: "/eapi/v1/depth", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_open_interest",
    {
      title: "Binance Options Open Interest",
      description: `Get open interest for an underlying on a specific expiration date.
Official endpoint: GET /eapi/v1/openInterest (public, no key).

Args:
  - underlying_asset (string, required): e.g. "BTC"
  - expiration (string, required): e.g. "240927"`,
      inputSchema: {
        underlying_asset: z.string().describe('e.g. "BTC"'),
        expiration: z.string().describe('e.g. "240927"'),
      },
      annotations: readOnly,
    },
    async ({ underlying_asset, expiration }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/openInterest", {
        underlyingAsset: underlying_asset.trim().toUpperCase(),
        expiration: expiration.trim(),
      });
      const envelope = buildEnvelope(
        {
          market: MARKET,
          source: OPTIONS_SOURCE,
          endpoint: "/eapi/v1/openInterest",
          symbol: `${underlying_asset}-${expiration}`,
        },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_options_get_recent_trades",
    {
      title: "Binance Options Recent Trades",
      description: `Get recent public trades for an option symbol.
Official endpoint: GET /eapi/v1/trades (public, no key).`,
      inputSchema: {
        symbol: z.string().describe("Option symbol"),
        limit: z.number().int().min(1).max(1000).optional(),
      },
      annotations: readOnly,
    },
    async ({ symbol, limit }) => {
      const data = await binanceGet(OPTIONS_BASE_URL, "/eapi/v1/trades", {
        symbol: symbol.trim().toUpperCase(),
        limit: limit ?? 100,
      });
      const envelope = buildEnvelope(
        { market: MARKET, source: OPTIONS_SOURCE, endpoint: "/eapi/v1/trades", symbol },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );
}
