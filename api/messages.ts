import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sessions } from './_mcp.js';
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*'); res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS'); res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Accept,MCP-Protocol-Version,Last-Event-ID');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const id = typeof req.query.sessionId === 'string' ? req.query.sessionId : undefined;
  if (!id) return res.status(400).json({ error: 'sessionId is required' });
  const transport = sessions.get(id); if (!transport) return res.status(404).json({ error: 'Unknown or expired MCP session' });
  await transport.handlePostMessage(req, res);
}
