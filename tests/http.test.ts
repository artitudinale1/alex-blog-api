import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createRequestHandler, parseOrigins } from '../src/http.js';

describe('deployment HTTP surface', () => {
  it('answers GET /health without calling GraphQL', async () => {
    let graphqlCalled = false;
    const graphql = (_req: IncomingMessage, _res: ServerResponse) => {
      graphqlCalled = true;
    };
    const server = createServer(createRequestHandler(graphql));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('expected a TCP port');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/health?probe=1`);
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({ status: 'ok' });
      expect(graphqlCalled).toBe(false);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('forwards GraphQL requests to Yoga', async () => {
    const graphql = (_req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { posts: [] } }));
    };
    const server = createServer(createRequestHandler(graphql));
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('expected a TCP port');
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/graphql`, { method: 'POST' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: { posts: [] } });
    } finally {
      server.close();
      await once(server, 'close');
    }
  });

  it('requires an explicit CORS allow-list in production', () => {
    expect(() => parseOrigins(undefined, 'production')).toThrow(/CORS_ORIGINS/);
    expect(() => parseOrigins(' , ', 'production')).toThrow(/CORS_ORIGINS/);
    expect(parseOrigins(' https://www.alexgarulli.org.uk, https://alexgarulli.org.uk ', 'production')).toEqual([
      'https://www.alexgarulli.org.uk',
      'https://alexgarulli.org.uk',
    ]);
    expect(parseOrigins(undefined, undefined)).toEqual(['http://localhost:3000']);
  });
});
