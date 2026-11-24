import type { Collection, Document, WithId } from 'mongodb';

export type Category = 'CODE' | 'JAPANESE' | 'CATS' | 'COOKING';
export interface PostDocument extends Document {
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  category: Category;
  tags: string[];
  status: 'draft' | 'published';
  publishedAt: Date | null;
}
export function publicPost(doc: WithId<PostDocument>) {
  return {
    id: doc._id.toHexString(), title: doc.title, slug: doc.slug,
    excerpt: doc.excerpt, contentMarkdown: doc.contentMarkdown,
    category: doc.category, tags: doc.tags,
    publishedAt: doc.publishedAt!.toISOString(),
  };
}
export function postResolvers(collection: Collection<PostDocument>) {
  return {
    Query: {
      posts: async (_: unknown, args: { category?: Category; limit?: number; offset?: number }) => {
        const limit = args.limit ?? 20;
        const offset = args.offset ?? 0;
        if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('limit must be between 1 and 50');
        if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error('Invalid offset');
        const filter = { status: 'published' as const, publishedAt: { $lte: new Date(), $ne: null }, ...(args.category ? { category: args.category } : {}) };
        const docs = await collection.find(filter).sort({ publishedAt: -1, _id: -1 }).skip(offset).limit(limit).toArray();
        return docs.map(publicPost);
      },
      post: async (_: unknown, args: { slug: string }) => {
        const doc = await collection.findOne({ slug: args.slug, status: 'published', publishedAt: { $lte: new Date(), $ne: null } });
        return doc ? publicPost(doc) : null;
      },
    },
  };
}
