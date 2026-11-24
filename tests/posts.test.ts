import { describe, expect, it, vi } from 'vitest';
import type { Collection } from 'mongodb';
import { ObjectId } from 'mongodb';
import { postResolvers, type PostDocument } from '../src/posts.js';

const sample = { _id: new ObjectId(), title: '猫', slug: 'neko', excerpt: 'Cat', contentMarkdown: '<ruby>猫<rt>ねこ</rt></ruby>', category: 'JAPANESE', tags: [], status: 'published', publishedAt: new Date('2026-11-23T12:00:00Z') };
function mockCollection() {
  const toArray = vi.fn().mockResolvedValue([sample]);
  const limit = vi.fn().mockReturnValue({ toArray });
  const skip = vi.fn().mockReturnValue({ limit });
  const sort = vi.fn().mockReturnValue({ skip });
  const find = vi.fn().mockReturnValue({ sort });
  const findOne = vi.fn().mockResolvedValue(sample);
  return { collection: { find, findOne } as unknown as Collection<PostDocument>, find, findOne };
}
describe('post resolvers', () => {
  it('returns published posts and serializes dates and Japanese text', async () => {
    const { collection, find } = mockCollection();
    const posts = await postResolvers(collection).Query.posts({}, { category: 'JAPANESE' });
    expect(posts[0].title).toBe('猫');
    expect(posts[0].publishedAt).toBe('2026-11-23T12:00:00.000Z');
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', category: 'JAPANESE' }));
  });
  it('rejects unbounded page sizes', async () => {
    const { collection } = mockCollection();
    await expect(postResolvers(collection).Query.posts({}, { limit: 1000 })).rejects.toThrow('limit');
  });
  it('looks up published slugs', async () => {
    const { collection, findOne } = mockCollection();
    await postResolvers(collection).Query.post({}, { slug: 'neko' });
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ slug: 'neko', status: 'published' }));
  });
});
