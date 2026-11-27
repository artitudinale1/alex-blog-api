import 'dotenv/config';
import { createServer } from 'node:http';
import { connectDatabase } from './db.js';
import { createApp } from './app.js';
import { createRequestHandler, parseOrigins } from './http.js';
import { readEditorAuthConfig } from './editor-auth.js';
import { readAgentAuthConfig } from './agent-auth.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required. See .env.example');
const { client, posts } = await connectDatabase(uri, process.env.MONGODB_DB || 'alex_blog');
const editorAuth = readEditorAuthConfig(process.env);
const yoga = createApp(posts, parseOrigins(process.env.CORS_ORIGINS), editorAuth, readAgentAuthConfig(process.env, editorAuth.secret));
const server = createServer(createRequestHandler(yoga));
const port = Number(process.env.PORT || 4000);
const host = '0.0.0.0';
server.listen(port, host, () => console.log(`GraphQL API listening on ${host}:${port} (/graphql, /health)`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => void client.close().then(() => process.exit(0))));
}
