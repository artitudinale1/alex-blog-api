import 'dotenv/config';
import { createServer } from 'node:http';
import { connectDatabase } from './db.js';
import { createApp } from './app.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required. See .env.example');
const { client, posts } = await connectDatabase(uri, process.env.MONGODB_DB || 'alex_blog');
const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
const yoga = createApp(posts, origins);
const server = createServer(yoga);
const port = Number(process.env.PORT || 4000);
server.listen(port, () => console.log(`GraphQL API listening at http://localhost:${port}/graphql`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => void client.close().then(() => process.exit(0))));
}
