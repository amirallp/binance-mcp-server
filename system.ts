import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  binanceGet,
  buildEnvelope,
  truncateJson,
} from "../services/binanceClient.js";
import {
  CHARACTER_LIMIT,
  FUTURES_BASE_URL,
  FUTURES_SOURCE,
  OPTIONS_BASE_URL,
  OPTIONS_SOURCE,
  SPOT_BASE_URL,
  SPOT_SOURCE,
} from "../constants.js";

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export function registerSystemTools(server: McpServer): void {
  server.registerTool(
    "binance_get_server_time",
    {
      title: "Binance Server Time",
      description: `Get Binance server time from Spot, USDⓈ-M Futures, or Options REST API.
Use this to align clocks or reason about data freshness against Binance's clock.
Official endpoints: GET /api/v3/time | GET /fapi/v1/time | GET /eapi/v1/time (public, no key).

Args:
  - market (string, optional): "spot" | "futures" | "options". Default "spot".`,
      inputSchema: {
        market: z
          .enum(["spot", "futures", "options"])
          .optional()
          .describe('Which Binance market clock: "spot" | "futures" | "options"'),
      },
      annotations: readOnly,
    },
    async ({ market }) => {
      const m = market ?? "spot";
      const config =
        m === "futures"
          ? { base: FUTURES_BASE_URL, path: "/fapi/v1/time", source: FUTURES_SOURCE, kind: "USDS_M_FUTURES" as const }
          : m === "options"
            ? { base: OPTIONS_BASE_URL, path: "/eapi/v1/time", source: OPTIONS_SOURCE, kind: "OPTIONS" as const }
            : { base: SPOT_BASE_URL, path: "/api/v3/time", source: SPOT_SOURCE, kind: "SPOT" as const };

      const data = await binanceGet(config.base, config.path, {});
      const envelope = buildEnvelope(
        { market: config.kind, source: config.source, endpoint: config.path },
        data,
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );

  server.registerTool(
    "binance_ping",
    {
      title: "Binance Connectivity Ping",
      description: `Test connectivity to Binance public REST (Spot, Futures, or Options). Returns empty object on success.
Official endpoints: GET /api/v3/ping | GET /fapi/v1/ping | GET /eapi/v1/ping.`,
      inputSchema: {
        market: z.enum(["spot", "futures", "options"]).optional(),
      },
      annotations: readOnly,
    },
    async ({ market }) => {
      const m = market ?? "spot";
      const config =
        m === "futures"
          ? { base: FUTURES_BASE_URL, path: "/fapi/v1/ping", source: FUTURES_SOURCE, kind: "USDS_M_FUTURES" as const }
          : m === "options"
            ? { base: OPTIONS_BASE_URL, path: "/eapi/v1/ping", source: OPTIONS_SOURCE, kind: "OPTIONS" as const }
            : { base: SPOT_BASE_URL, path: "/api/v3/ping", source: SPOT_SOURCE, kind: "SPOT" as const };

      const data = await binanceGet(config.base, config.path, {});
      const envelope = buildEnvelope(
        { market: config.kind, source: config.source, endpoint: config.path },
        data ?? {},
      );
      return { content: [{ type: "text", text: truncateJson(envelope, CHARACTER_LIMIT) }] };
    },
  );
}
