/**
 * Shared constants for the Binance MCP server.
 * All base URLs point at Binance's PUBLIC market-data REST APIs.
 * None of the endpoints used in this server require an API key,
 * and none of them can place orders, transfer funds, or touch an account.
 */

// Spot market data
export const SPOT_BASE_URL = "https://api.binance.com";

// USDT-margined (USDⓈ-M) perpetual & delivery futures — primary for most traders
export const FUTURES_BASE_URL = "https://fapi.binance.com";

// COIN-margined futures (optional; secondary)
export const COIN_FUTURES_BASE_URL = "https://dapi.binance.com";

// European Options
export const OPTIONS_BASE_URL = "https://eapi.binance.com";

// Truncate any single tool response to roughly this many characters so a
// large candle/trade dump doesn't blow out the model's context window.
export const CHARACTER_LIMIT = 25_000;

// Binance kline/candlestick intervals, shared by spot and futures.
export const KLINE_INTERVALS = [
  "1m", "3m", "5m", "15m", "30m",
  "1h", "2h", "4h", "6h", "8h", "12h",
  "1d", "3d", "1w", "1M",
] as const;

// Lookback windows accepted by the futures "data" endpoints
// (open interest history, long/short ratio, basis, taker volume).
export const STATS_PERIODS = [
  "5m", "15m", "30m", "1h", "2h", "4h", "6h", "12h", "1d",
] as const;

// Continuous / contract-type klines
export const CONTRACT_TYPES = [
  "PERPETUAL",
  "CURRENT_QUARTER",
  "NEXT_QUARTER",
] as const;

export const REQUEST_TIMEOUT_MS = 12_000;

// Binance only accepts these exact depth values for order book requests.
export const SPOT_DEPTH_LIMITS = [5, 10, 20, 50, 100, 500, 1000, 5000] as const;
export const FUTURES_DEPTH_LIMITS = [5, 10, 20, 50, 100, 500, 1000] as const;
export const OPTIONS_DEPTH_LIMITS = [10, 20, 50, 100] as const;

export const SPOT_SOURCE =
  "Binance Spot REST API (public market data, no authentication)";
export const FUTURES_SOURCE =
  "Binance USDⓈ-M Futures REST API (public market data, no authentication)";
export const COIN_FUTURES_SOURCE =
  "Binance COIN-M Futures REST API (public market data, no authentication)";
export const OPTIONS_SOURCE =
  "Binance European Options REST API (public market data, no authentication)";
