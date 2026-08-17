# Twelve Data MCP Server

A lightweight MCP server exposing Twelve Data market-data tools through a single Vercel serverless route.

## Deploy

1. Import this repository into Vercel (or run `vercel`).
2. Add the environment variable `TWELVEDATA_API_KEY` for the desired environments.
3. The MCP endpoint is `/mcp` (also available at `/api/mcp`).

The endpoint supports MCP JSON-RPC over HTTP POST, SSE discovery over GET, CORS, `initialize`, `tools/list`, `tools/call`, and `ping`.

## Tools

- `get_quote`: latest quote; required `symbol`.
- `get_candles`: OHLCV time series; required `symbol` and `interval`.
- `get_indicator`: technical indicator; required `indicator`, `symbol`, and `interval`.

All other supplied arguments are passed through to the corresponding Twelve Data API endpoint. Never commit the API key; configure it only as a Vercel environment variable.

## Local test

```bash
TWELVEDATA_API_KEY=your_key vercel dev
curl -X POST http://localhost:3000/mcp -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
