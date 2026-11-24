import type { RequestListener } from 'node:http';

export function parseOrigins(value: string | undefined, nodeEnv = process.env.NODE_ENV): string[] {
  const configured = value?.split(',').map((origin) => origin.trim()).filter(Boolean) ?? [];
  if (nodeEnv === 'production' && configured.length === 0) {
    throw new Error('CORS_ORIGINS is required in production. See .env.example');
  }
  return configured.length > 0 ? configured : ['http://localhost:3000'];
}

export function createRequestHandler(graphql: RequestListener): RequestListener {
  return (req, res) => {
    const path = req.url?.split('?')[0];
    if ((req.method === 'GET' || req.method === 'HEAD') && path === '/health') {
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      });
      if (req.method === 'GET') res.end(JSON.stringify({ status: 'ok' }));
      else res.end();
      return;
    }
    graphql(req, res);
  };
}
