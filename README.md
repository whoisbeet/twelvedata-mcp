# Twelve Data MCP Server

Typed Vercel MCP endpoint for Twelve Data and institutional SMC analysis. Set TWELVEDATA_API_KEY in Vercel.

Tools: get_quote, get_candles, get_indicator, get_smc_analysis, get_smt_divergence, get_session_liquidity, get_market_filters.

SMC outputs include swing pivots, internal/external BSL and SSL, BOS/CHoCH, unmitigated FVGs with CE, and order blocks. Analysis tools fetch Twelve Data candles unless candle arrays are supplied directly.

Endpoint: /mcp (POST JSON-RPC; GET SSE discovery).
