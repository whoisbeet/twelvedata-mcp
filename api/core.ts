import { z } from 'zod';

export type Args = Record<string, unknown>;
export type KeyContext = { env?: NodeJS.ProcessEnv; headers?: Record<string, string | string[] | undefined>; query?: Record<string, unknown> };
const TD = 'https://api.twelvedata.com';
const FH = 'https://finnhub.io/api/v1';

function normalizeSymbol(input: unknown): string {
  return String(input ?? '').trim().toUpperCase();
}

export const toolDefs = [
  { name: 'get_quote', description: 'Real-time Twelve Data quote.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, exchange: { type: 'string' } }, required: ['symbol'] } },
  { name: 'get_candles', description: 'OHLCV time series.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' }, outputsize: { type: 'integer' } }, required: ['symbol', 'interval'] } },
  { name: 'finnhub_get_economic_calendar', description: 'Finnhub economic calendar events with actual and forecast values.', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
  { name: 'finnhub_get_market_holiday', description: 'Finnhub market holidays for an exchange.', inputSchema: { type: 'object', properties: { exchange: { type: 'string' } }, required: ['exchange'] } },
  { name: 'finnhub_get_news_sentiment', description: 'News sentiment score and buzz for a symbol.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'finnhub_get_market_news', description: 'Finnhub market news by category.', inputSchema: { type: 'object', properties: { category: { type: 'string', enum: ['general', 'forex', 'crypto', 'merger'] }, minId: { type: 'integer' } }, required: ['category'] } },
  { name: 'finnhub_get_insider_sentiment', description: 'Monthly insider sentiment for a US equity.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['symbol', 'from', 'to'] } },
  { name: 'finnhub_get_insider_transactions', description: 'Insider transactions for a symbol.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['symbol', 'from', 'to'] } },
  { name: 'finnhub_get_quote', description: 'Real-time Finnhub quote.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' } }, required: ['symbol'] } },
  { name: 'finnhub_get_pattern_recognition', description: 'Technical pattern recognition from Finnhub.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, resolution: { type: 'string' } }, required: ['symbol', 'resolution'] } },
  { name: 'finnhub_get_support_resistance', description: 'Support and resistance key levels.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, resolution: { type: 'string' } }, required: ['symbol', 'resolution'] } },
  { name: 'get_market_confluence', description: 'Combines Twelve Data price/OHLCV indicators with Finnhub quote, news sentiment, and macro events.', inputSchema: { type: 'object', properties: { symbol: { type: 'string' }, interval: { type: 'string' }, outputsize: { type: 'integer' }, from: { type: 'string' }, to: { type: 'string' } }, required: ['symbol', 'interval'] } },
];

function value(args: Args, name: string) { return args[name] === undefined || args[name] === null || args[name] === '' ? undefined : String(args[name]); }
function apiKey(kind: 'twelve' | 'finnhub', ctx: KeyContext = {}) {
  const envName = kind === 'twelve' ? 'TWELVEDATA_API_KEY' : 'FINNHUB_API_KEY';
  const headerNames = kind === 'twelve' ? ['x-twelvedata-api-key', 'x-api-key'] : ['x-finnhub-api-key', 'x-api-key'];
  const queryNames = kind === 'twelve' ? ['twelvedata_api_key', 'apikey'] : ['finnhub_api_key', 'finnhubApiKey', 'token'];
  const h = ctx.headers || {};
  const hv = headerNames.map(n => h[n] || h[n.toLowerCase()]).find(Boolean);
  const qv = queryNames.map(n => ctx.query?.[n]).find(v => v !== undefined && v !== '');
  const key = String(hv || qv || ctx.env?.[envName] || process.env[envName] || '');
  if (!key) throw new Error(`${envName} is not configured. Set it in the environment or provide a supported request header/query parameter.`);
  return key;
}
async function request(base: string, endpoint: string, args: Args, key: string) {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(args)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  q.set(base === TD ? 'apikey' : 'token', key);
  const url = `${base}/${endpoint}?${q}`;
  console.log(`[market-data] ${base === TD ? 'Twelve Data' : 'Finnhub'} ${endpoint}`, {
    url: url.replace(/([?&](?:apikey|token)=)[^&]+/, '$1[redacted]'),
  });
  const r = await fetch(url);
  const raw = await r.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : null; } catch {
    const preview = raw.replace(/\s+/g, ' ').trim().slice(0, 200);
    throw new Error(`${base === TD ? 'Twelve Data' : 'Finnhub'} returned a non-JSON response (HTTP ${r.status}${preview ? `: ${preview}` : ''}).`);
  }
  if (!r.ok || data?.status === 'error' || Number(data?.code) >= 400 || data?.error) {
    const message = data?.message || data?.error || `HTTP ${r.status}`;
    const accessDenied = r.status === 403 || /you don't have access to this resource|access denied|premium/i.test(String(message));
    if (base === FH && accessDenied) throw new Error(`Finnhub resource '${endpoint}' requires Finnhub Premium or is not available for this API key (HTTP ${r.status}): ${message}`);
    throw new Error(`${base === TD ? 'Twelve Data' : 'Finnhub'} request failed (HTTP ${r.status}): ${message}`);
  }
  return data;
}
export const twelve = (endpoint: string, args: Args, ctx?: KeyContext) => request(TD, endpoint, args, apiKey('twelve', ctx));
export const finnhub = (endpoint: string, args: Args, ctx?: KeyContext) => request(FH, endpoint, args, apiKey('finnhub', ctx));
function indicators(values: any[]) {
  const close = values.map(v => Number(v.close)).filter(Number.isFinite); const last = close.at(-1) ?? null; const period = 14;
  const sample = close.slice(-period - 1); const gains = sample.slice(1).map((v, i) => Math.max(0, v - sample[i])); const losses = sample.slice(1).map((v, i) => Math.max(0, sample[i] - v));
  const avgGain = gains.reduce((a,b)=>a+b,0) / Math.max(gains.length,1), avgLoss = losses.reduce((a,b)=>a+b,0) / Math.max(losses.length,1);
  const rsi = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss); const ema = close.slice(-period).reduce((a,b)=>a+b,0) / Math.max(Math.min(close.length, period),1);
  return { latestClose: last, rsi: close.length > 1 ? Number(rsi.toFixed(2)) : null, ema14: close.length ? Number(ema.toFixed(6)) : null, bars: values.length };
}
export async function callTool(name: string, args: Args, ctx: KeyContext = {}) {
  if (!toolDefs.some(t => t.name === name)) throw new Error(`Unknown tool: ${name}`);
  if (name === 'get_quote') return twelve('quote', {...args, symbol: normalizeSymbol(args.symbol)}, ctx); if (name === 'get_candles') return twelve('time_series', {...args, symbol: normalizeSymbol(args.symbol)}, ctx);
  const fhMap: Record<string,string> = { finnhub_get_economic_calendar:'calendar/economic', finnhub_get_market_holiday:'stock/market-holiday', finnhub_get_news_sentiment:'news-sentiment', finnhub_get_market_news:'news', finnhub_get_insider_sentiment:'stock/insider-sentiment', finnhub_get_insider_transactions:'stock/insider-transactions', finnhub_get_quote:'quote', finnhub_get_pattern_recognition:'scan/pattern-recognition', finnhub_get_support_resistance:'scan/support-resistance' };
  if (fhMap[name]) return finnhub(fhMap[name], args.symbol === undefined ? args : {...args, symbol: normalizeSymbol(args.symbol)}, ctx);
  if (name === 'get_market_confluence') {
    const symbol = normalizeSymbol(args.symbol), interval = value(args,'interval')!, now = new Date(); const to = value(args,'to') || now.toISOString().slice(0,10); const from = value(args,'from') || new Date(now.getTime()-7*86400000).toISOString().slice(0,10);
    const results = await Promise.allSettled([
      twelve('time_series',{symbol,interval,outputsize:value(args,'outputsize') || 200},ctx),
      twelve('quote',{symbol},ctx),
      finnhub('news-sentiment',{symbol},ctx),
      finnhub('calendar/economic',{from,to},ctx),
      finnhub('quote',{symbol},ctx),
    ]);
    const [candlesResult, tdQuoteResult, sentimentResult, macroResult, fhQuoteResult] = results;
    const succeeded = <T>(result: PromiseSettledResult<T>) => result.status === 'fulfilled' ? result.value : undefined;
    const failed = (label: string, result: PromiseSettledResult<unknown>) => result.status === 'rejected' ? { metric: label, unavailable: true, reason: result.reason instanceof Error ? result.reason.message : String(result.reason) } : undefined;
    const candles = succeeded(candlesResult) as any;
    const unavailable = [failed('Finnhub news sentiment', sentimentResult), failed('Finnhub economic calendar', macroResult)].filter(Boolean);
    const values = Array.isArray(candles?.values) ? candles.values : [];
    return { tool:name, symbol, interval, twelve_data:{ quote:succeeded(tdQuoteResult), candles:values, indicators:indicators(values) }, finnhub:{ quote:succeeded(fhQuoteResult), newsSentiment:succeeded(sentimentResult), macroEvents:succeeded(macroResult) }, unavailableMetrics:unavailable, generatedAt:new Date().toISOString() };
  }
  throw new Error(`Unsupported tool: ${name}`);
}
