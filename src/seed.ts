import 'dotenv/config';
import { connectDatabase } from './db.js';
import type { PostDocument } from './posts.js';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');
const { client, posts } = await connectDatabase(uri, process.env.MONGODB_DB || 'alex_blog');
const now = new Date();
const samples: Omit<PostDocument, '_id'>[] = [
  { title: 'Building a GraphQL blog API', slug: 'building-a-graphql-blog-api', excerpt: 'Notes from building a personal API with Node.js and MongoDB.', contentMarkdown: '# Building a GraphQL blog API\n\nA work in progress.', category: 'CODE', tags: ['Node.js', 'GraphQL', 'MongoDB'], status: 'published', publishedAt: now },
  { title: '日本語: cats and katakana', slug: 'japanese-cats-and-katakana', excerpt: 'A small Japanese-language test post.', contentMarkdown: '# 日本語の勉強\n\n猫（ねこ） means cat. ブランケット is written in katakana.\n\n<ruby>猫<rt>ねこ</rt></ruby>', category: 'JAPANESE', tags: ['Japanese', 'Katakana'], status: 'published', publishedAt: now },
];
try {
  for (const sample of samples) {
    await posts.updateOne({ slug: sample.slug }, { $setOnInsert: sample }, { upsert: true });
  }
  console.log('Seed complete: 2 sample posts (existing posts preserved)');
} finally { await client.close(); }
