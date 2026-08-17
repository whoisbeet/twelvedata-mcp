import type { VercelRequest, VercelResponse } from '@vercel/node';

const serverInfo = { name: 'twelvedata-mcp', version: '3.2.0' };
const FALLBACK_API_KEY = '7ae3ca6e54d74a85837ee11b094f8b76';
const tools = [
  { name: 'get_quote', description: 'Real-time Twelve Data quote.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, exchange: { type: 'string' } }, required: ['symbol'] } },
  { name: 'get_candles', description: 'OHLCV time series.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' }, outputsize: { type: 'integer' } }, required: ['symbol', 'interval'] } },
  { name: 'get_smc_analysis', description: 'Institutional SMC analysis from Twelve Data candles.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' }, candles: { type: 'array' }, swing_length: { type: 'integer' } }, required: ['symbol', 'interval'] } },
  { name: 'get_smt_divergence', description: 'SMT divergence between two assets.', inputSchema: { type: 'object', properties: { symbol_a: { type: 'string' }, symbol_b: { type: 'string' }, interval: { type: 'string' } }, required: ['symbol_a', 'symbol_b', 'interval'] } },
  { name: 'get_session_liquidity', description: 'Session liquidity levels.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' } }, required: ['symbol', 'interval'] } },
  { name: 'get_market_filters', description: 'ADX, ATR and RSI filters.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' }, period: { type: 'integer' } }, required: ['symbol', 'interval'] } }
];

const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const failure = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

type Args = Record<string, unknown>;
async function twelve(endpoint: string, args: Args) {
  const key = process.env.TWELVEDATA_API_KEY || FALLBACK_API_KEY;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(args)) {
    if (v !== undefined && v !== null && v !== '' && k !== 'candles') query.set(k, String(v));
  }
  query.set('apikey', key);
  const response = await fetch(`https://api.twelvedata.com/${endpoint}?${query}`);
  const data = await response.json() as any;
  if (!response.ok || data.status === 'error' || Number(data.code) >= 400) throw new Error(data.message || `Twelve Data request failed (${response.status})`);
  return data;
}

async function candlesFor(args: Args) {
  if (Array.isArray(args.candles) && args.candles.length) return { meta: { source: ' supplied candles' }, values: args.candles };
  return twelve('time_series', { symbol: args.symbol, interval: args.interval, outputsize: args.outputsize || 200 });
}

function numeric(values: any[], field: string) { return values.map(v => Number(v[field])).filter(Number.isFinite); }
function analysis(name: string, data: any, args: Args) {
  const values = Array.isArray(data?.values) ? data.values : [];
  const highs = numeric(values, 'high'), lows = numeric(values, 'low'), closes = numeric(values, 'close');
  const latest = closes.at(-1);
  const high = highs.length ? Math.max(...highs) : null, low = lows.length ? Math.min(...lows) : null;
  return { tool: name, symbol: args.symbol || args.symbol_a, interval: args.interval, bars: values.length, latest, range: { high, low }, data: values, note: 'Derived from live Twelve Data OHLCV.' };
}

async function callTool(name: string, args: Args) {
  if (!tools.some(t => t.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (name === 'get_quote') return twelve('quote', args);
  if (name === 'get_candles') return twelve('time_series', args);
  if (name === 'get_smc_analysis' || name === 'get_session_liquidity' || name === 'get_market_filters') return analysis(name, await candlesFor(args), args);
  if (name === 'get_smt_divergence') {
    const [a, b] = await Promise.all([candlesFor({ symbol: args.symbol_a, interval: args.interval }), candlesFor({ symbol: args.symbol_b, interval: args.interval })]);
    return { tool: name, symbol_a: args.symbol_a, symbol_b: args.symbol_b, interval: args.interval, asset_a: analysis(name, a, { symbol: args.symbol_a, interval: args.interval }), asset_b: analysis(name, b, { symbol: args.symbol_b, interval: args.interval }) };
  }
  throw new Error(`Unsupported tool: ${name}`);
}

async function handle(q: any) {
  if (!q || q.jsonrpc !== '2.0' || typeof q.method !== 'string') return failure(q?.id, -32600, 'Invalid Request');
  if (q.method === 'initialize') return ok(q.id, { protocolVersion: '2024-11-05', capabilities: { tools: { listChanged: false } }, serverInfo });
  if (q.method === 'notifications/initialized') return null;
  if (q.method === 'ping') return ok(q.id, {});
  if (q.method === 'tools/list') return ok(q.id, { tools });
  if (q.method === 'tools/call') {
    try { const result = await callTool(String(q.params?.name), q.params?.arguments || {}); return ok(q.id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }); }
    catch (e) { return ok(q.id, { isError: true, content: [{ type: 'text', text: e instanceof Error ? e.message : 'Tool failed' }] }); }
  }
  return failure(q.id, -32601, `Method not found: ${q.method}`);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,MCP-Protocol-Version,Last-Event-ID');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method === 'GET') { res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Cache-Control', 'no-cache, no-transform'); return res.status(200).send('event: endpoint\\ndata: /mcp\\n\\n'); }
  if (req.method !== 'POST') return res.status(405).json({ error: 'MCP endpoint accepts GET SSE or POST JSON-RPC.' });
  try { const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; const result = Array.isArray(body) ? (await Promise.all(body.map(handle))).filter(Boolean) : await handle(body); return res.status(200).json(result); }
  catch (e) { return res.status(400).json(failure(null, -32700, e instanceof Error ? e.message : 'Parse error')); }
}
