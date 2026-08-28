#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { registerSpotTools } from "./tools/spot.js";
import { registerFuturesTools } from "./tools/futures.js";
import { registerOptionsTools } from "./tools/options.js";
import { registerSystemTools } from "./tools/system.js";
import { BinanceApiError } from "./services/binanceClient.js";

function buildServer(): McpServer {
  const server = new McpServer({
    name: "binance-mcp-server",
    version: "2.0.0",
  });

  registerSpotTools(server);
  registerFuturesTools(server);
  registerOptionsTools(server);
  registerSystemTools(server);

  return server;
}

process.on("unhandledRejection", (reason) => {
  if (reason instanceof BinanceApiError) {
    console.error(`[binance-mcp-server] Unhandled Binance API error: ${reason.message}`);
  } else {
    console.error("[binance-mcp-server] Unhandled rejection:", reason);
  }
});

async function runStdio(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("binance-mcp-server v2 running on stdio");
}

async function runHttp(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", service: "binance-mcp-server", version: "2.0.0" });
  });

  app.post("/mcp", async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000", 10);
  app.listen(port, () => {
    console.error(`binance-mcp-server v2 listening on http://localhost:${port}/mcp`);
  });
}

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHttp().catch((err) => {
    console.error("Fatal server error:", err);
    process.exit(1);
  });
} else {
  runStdio().catch((err) => {
    console.error("Fatal server error:", err);
    process.exit(1);
  });
}
