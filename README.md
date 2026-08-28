# binance-mcp-server v2

Read-only MCP server that exposes **Binance public market-data** as tools for Claude.

**Coverage:** Spot · **USDⓈ-M Perpetual Futures** (primary) · European Options  

**No API key. No trading. No account access.** Every value under `data` is exactly what Binance returned.

Designed so Claude can pull **fresh, unbiased** market facts on demand and then do analysis in the conversation layer — the server never invents indicators, rounds numbers, or substitutes stale cache.

---

## Design rules (data integrity)

Every tool:

1. Calls **one named official Binance endpoint** (stated in the tool description).
2. Passes Binance’s raw values **untouched** — no rounding, no unit conversion, no invented fields.
3. Returns a small `meta` envelope + raw `data` so you always know market, endpoint, symbol, and when *this server* fetched it (vs any timestamp Binance itself reported).
4. Surfaces rate-limit / validation errors explicitly — never silently retries or serves stale data.
5. Flags a genuine empty result set as “Binance said zero records,” not the same as a broken call.

Analysis, derived metrics (e.g. taker sell = volume − taker_buy), and interpretation stay with Claude.

---

## Response envelope

```json
{
  "meta": {
    "market": "SPOT" | "USDS_M_FUTURES" | "OPTIONS" | "SYSTEM",
    "source": "…",
    "endpoint": "/fapi/v1/premiumIndex",
    "symbol": "BTCUSDT",
    "fetched_at_utc": "2026-08-28T03:00:00.000Z",
    "fetched_at_note": "this server's retrieval time, not Binance's",
    "data_note": "(only when there is a real caveat)"
  },
  "data": { }
}
```

---

## Tools (~40)

### USDⓈ-M Futures — trading core (perp)

| Tool | Endpoint | Why it matters for trading |
|------|----------|----------------------------|
| `binance_futures_get_mark_price` | `/fapi/v1/premiumIndex` | Mark, index, last funding, next funding time |
| `binance_futures_get_price` | `/fapi/v1/ticker/price` | Last traded price |
| `binance_futures_get_book_ticker` | `/fapi/v1/ticker/bookTicker` | Best bid/ask |
| `binance_futures_get_ticker` | `/fapi/v1/ticker/24hr` | 24h change, volume, high/low |
| `binance_futures_get_order_book` | `/fapi/v1/depth` | Live depth |
| `binance_futures_get_recent_trades` | `/fapi/v1/trades` | Tape |
| `binance_futures_get_agg_trades` | `/fapi/v1/aggTrades` | Aggregated tape |
| `binance_futures_get_klines` | `/fapi/v1/klines` | OHLCV |
| `binance_futures_get_continuous_klines` | `/fapi/v1/continuousKlines` | Unbroken perp/quarter series |
| `binance_futures_get_mark_price_klines` | `/fapi/v1/markPriceKlines` | Mark-price candles |
| `binance_futures_get_index_price_klines` | `/fapi/v1/indexPriceKlines` | Index candles |
| `binance_futures_get_premium_index_klines` | `/fapi/v1/premiumIndexKlines` | Premium/basis regime |
| `binance_futures_get_funding_rate_history` | `/fapi/v1/fundingRate` | Funding history |
| `binance_futures_get_funding_info` | `/fapi/v1/fundingInfo` | Interval / cap config |
| `binance_futures_get_open_interest` | `/fapi/v1/openInterest` | Current OI |
| `binance_futures_get_open_interest_history` | `/futures/data/openInterestHist` | OI history (~30d) |
| `binance_futures_get_long_short_ratio` | `/futures/data/*LongShort*` | Global / top account / top position |
| `binance_futures_get_taker_buy_sell_volume` | `/futures/data/takerlongshortRatio` | Aggressive flow |
| `binance_futures_get_basis` | `/futures/data/basis` | Contango / backwardation |
| `binance_futures_get_force_orders` | `/fapi/v1/forceOrders` | Recent liquidations (REST snapshot) |
| `binance_futures_get_exchange_info` | `/fapi/v1/exchangeInfo` | Filters, contract type, tick size |

### Spot

| Tool | Endpoint |
|------|----------|
| `binance_get_price` | `/api/v3/ticker/price` |
| `binance_get_avg_price` | `/api/v3/avgPrice` |
| `binance_get_book_ticker` | `/api/v3/ticker/bookTicker` |
| `binance_get_24hr_ticker` | `/api/v3/ticker/24hr` |
| `binance_get_rolling_ticker` | `/api/v3/ticker` |
| `binance_get_klines` | `/api/v3/klines` |
| `binance_get_ui_klines` | `/api/v3/uiKlines` |
| `binance_get_order_book` | `/api/v3/depth` |
| `binance_get_recent_trades` | `/api/v3/trades` |
| `binance_get_agg_trades` | `/api/v3/aggTrades` |
| `binance_get_exchange_info` | `/api/v3/exchangeInfo` |

### Options

| Tool | Endpoint |
|------|----------|
| `binance_options_get_exchange_info` | `/eapi/v1/exchangeInfo` |
| `binance_options_get_mark` | `/eapi/v1/mark` (IV + greeks) |
| `binance_options_get_ticker` | `/eapi/v1/ticker` |
| `binance_options_get_index` | `/eapi/v1/index` |
| `binance_options_get_klines` | `/eapi/v1/klines` |
| `binance_options_get_order_book` | `/eapi/v1/depth` |
| `binance_options_get_open_interest` | `/eapi/v1/openInterest` |
| `binance_options_get_recent_trades` | `/eapi/v1/trades` |

### System

| Tool | Endpoint |
|------|----------|
| `binance_get_server_time` | `/api/v3/time` · `/fapi/v1/time` · `/eapi/v1/time` |
| `binance_ping` | connectivity check |

---

## Deliberately NOT implemented

- **Account / balances / positions / orders / withdrawals** — requires API key; out of scope.
- **historicalTrades** that demand an API-key header.
- **Live liquidation WebSocket** (`!forceOrder@arr`) — a short REST poll cannot honestly represent a real-time stream; `forceOrders` is labelled as a snapshot only.
- Any derived indicator presented as if Binance reported it.

---

## Setup

### A) Claude Desktop / Claude Code (local, free)

```bash
npm install
npm run build
```

MCP config:

```json
{
  "mcpServers": {
    "binance": {
      "command": "node",
      "args": ["/absolute/path/to/binance-mcp-server/dist/index.js"]
    }
  }
}
```

### B) claude.ai (web) — free tier deploy

1. Deploy this folder (Render / Railway / Fly.io / any Node host).
2. Build: `npm install && npm run build`
3. Start: `TRANSPORT=http npm start` (or `npm run start:http`)
4. Connect: Claude → Settings → Connectors → custom connector → `https://your-host/mcp`
5. Health check: `GET /healthz`

---

## Rate limits

Binance public endpoints are IP-weight limited. This server does **not** cache. Tight loops across many symbols can hit HTTP 429/418 — tools report that explicitly so Claude does not invent numbers.

---

## Example prompts Claude can answer with this server

- “Mark price, next funding, and OI for BTCUSDT perp right now”
- “Funding rate history last 30 payments for ETHUSDT”
- “Global vs top-trader long/short ratio for BTCUSDT, 1h, last 7 days”
- “Order book top 20 + recent liquidations for SOLUSDT”
- “Compare 1h mark-price klines vs index klines for BTCUSDT”
- “Options mark IV for nearest BTC weekly expiries” (after checking exchangeInfo)

All answers are grounded in live Binance REST responses under `data`.
