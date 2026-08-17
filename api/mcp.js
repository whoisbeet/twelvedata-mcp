const API_BASE = 'https://api.twelvedata.com';
const SERVER_INFO = { name: 'twelvedata-mcp', version: '1.0.0' };

const tools = [
  {
    name: 'get_quote',
    description: 'Get the latest quote for a stock, ETF, forex pair, or cryptocurrency.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string', description: 'Ticker or instrument symbol, e.g. AAPL or EUR/USD' }, exchange: { type: 'string' }, type: { type: 'string', description: 'Optional instrument type' } }, required: ['symbol'] }
  },
  {
    name: 'get_candles',
    description: 'Get historical OHLCV time-series candles.',
    inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string', description: 'Examples: 1min, 5min, 1h, 1day, 1week' }, start_date: { type: 'string' }, end_date: { type: 'string' }, outputsize: { type: 'integer', minimum: 1, maximum: 5000 }, timezone: { type: 'string' }, exchange: { type: 'string' } }, required: ['symbol', 'interval'] }
  },
  {
    name: 'get_indicator',
    description: 'Calculate a Twelve Data technical indicator such as sma, ema, rsi, macd, or bbands.',
    inputSchema: { type: 'object', properties: { indicator: { type: 'string', description: 'Indicator name, e.g. sma, ema, rsi, macd, bbands' }, symbol: { type: 'string' }, interval: { type: 'string' }, time_period: { type: 'integer' }, series_type: { type: 'string', enum: ['open', 'high', 'low', 'close'] }, outputsize: { type: 'integer' }, start_date: { type: 'string' }, end_date: { type: 'string' }, exchange: { type: 'string' } }, required: ['indicator', 'symbol', 'interval'] }
  }
];

function jsonRpc(id, result) { return { jsonrpc: '2.0', id, result }; }
function rpcError(id, code, message, data) { return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } }; }
function textResult(value, isError = false) { return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }], ...(isError ? { isError: true } : {}) }; }

async function callTwelveData(endpoint, args) {
  const key = process.env.TWELVEDATA_API_KEY;
  if (!key) throw new Error('TWELVEDATA_API_KEY is not configured');
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(args || {})) if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
  params.set('apikey', key);
  const response = await fetch(`${API_BASE}/${endpoint}?${params}`);
  const data = await response.json();
  if (!response.ok || data.status === 'error' || data.code >= 400) throw new Error(data.message || `Twelve Data request failed (${response.status})`);
  return data;
}

async function handle(request) {
  const { id, method, params = {} } = request || {};
  if (!method) return rpcError(id, -32600, 'Invalid Request');
  if (method === 'initialize') return jsonRpc(id, { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: 'Use the Twelve Data tools for market data.' });
  if (method === 'notifications/initialized' || method === 'ping') return id === undefined ? null : jsonRpc(id, {});
  if (method === 'tools/list') return jsonRpc(id, { tools });
  if (method === 'tools/call') {
    const name = params.name;
    const args = params.arguments || {};
    try {
      let data;
      if (name === 'get_quote') data = await callTwelveData('quote', args);
      else if (name === 'get_candles') data = await callTwelveData('time_series', args);
      else if (name === 'get_indicator') {
        const { indicator, ...rest } = args;
        data = await callTwelveData(indicator, rest);
      } else return jsonRpc(id, textResult(`Unknown tool: ${name}`, true));
      return jsonRpc(id, textResult(data));
    } catch (error) { return jsonRpc(id, textResult(error.message, true)); }
  }
  return rpcError(id, -32601, `Method not found: ${method}`);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, MCP-Protocol-Version');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`event: endpoint\ndata: /mcp\\n\\n`);
    return res.end();
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST for MCP JSON-RPC or GET for SSE.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const requests = Array.isArray(body) ? body : [body];
    const results = (await Promise.all(requests.map(handle))).filter(Boolean);
    if (!results.length) return res.status(202).end();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(Array.isArray(body) ? results : results[0]);
  } catch (error) { return res.status(400).json(rpcError(null, -32700, 'Parse error', error.message)); }
}
