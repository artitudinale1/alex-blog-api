import { MongoClient, type Collection } from 'mongodb';
import type { PostDocument } from './posts.js';

export async function connectDatabase(uri: string, dbName: string): Promise<{ client: MongoClient; posts: Collection<PostDocument> }> {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const posts = client.db(dbName).collection<PostDocument>('posts');
  await posts.createIndex({ slug: 1 }, { unique: true });
  await posts.createIndex({ status: 1, category: 1, publishedAt: -1 });
  return { client, posts };
}
