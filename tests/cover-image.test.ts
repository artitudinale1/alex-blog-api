import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Collection } from 'mongodb';
import { parseCoverImageUrl } from '../src/cover-image.js';
import { editorResolvers, type PostInput } from '../src/editor.js';
import type { AppContext } from '../src/editor-auth.js';
import { publicPost, type PostDocument } from '../src/posts.js';

const editor: AppContext = { editor: { githubId: '12345' }, authFailure: null };
const jpg = 'https://cdn.example.com/covers/neko.jpg';
const cloudinary = 'https://res.cloudinary.com/demo/image/upload/c_fill,w_1200,f_auto/v1/blog/neko';
const input: PostInput = {
  title: 'Cover',
  slug: 'cover-post',
  excerpt: 'A post',
  contentMarkdown: '本文',
  category: 'CATS',
};

describe('cover image URLs', () => {
  it('accepts https images and Cloudinary delivery URLs', () => {
    expect(parseCoverImageUrl(`  ${jpg}?w=800  `)).toBe(`${jpg}?w=800`);
    expect(parseCoverImageUrl(cloudinary)).toBe(cloudinary);
    expect(parseCoverImageUrl('https://cdn.example.com/cat.WEBP')).toBe('https://cdn.example.com/cat.WEBP');
    expect(parseCoverImageUrl(undefined)).toBeUndefined();
    expect(parseCoverImageUrl(null)).toBeNull();
  });

  it.each([
    'http://cdn.example.com/cat.jpg',
    'javascript:alert(1)',
    'data:image/png;base64,aaaa',
    'https://user:secret@cdn.example.com/cat.jpg',
    'https://cdn.example.com/page',
    'https://cdn.example.com/cat.jpg.exe',
    'https://res.cloudinary.com/demo/video/upload/clip.mp4',
    'https://res.cloudinary.com.evil.example/demo/image/upload/cat',
    'not a url',
    '',
  ])('rejects %s', (value) => {
    expect(() => parseCoverImageUrl(value)).toThrow(/https image URL/);
  });
});

describe('cover image on posts', () => {
  it('leaves existing posts without a cover as null', () => {
    const doc = {
      _id: new ObjectId(), title: '猫', slug: 'neko', excerpt: 'Cat', contentMarkdown: '本文',
      category: 'CATS' as const, tags: [], status: 'published' as const, publishedAt: new Date('2026-11-23T12:00:00Z'),
    };
    expect(publicPost(doc).coverImageUrl).toBeNull();
    expect(publicPost({ ...doc, coverImageUrl: jpg }).coverImageUrl).toBe(jpg);
  });

  it('stores a cover on create and omits it when absent', async () => {
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const resolvers = editorResolvers({ insertOne } as unknown as Collection<PostDocument>);
    const without = await resolvers.Mutation.createPost({}, { input }, editor);
    expect(without.coverImageUrl).toBeNull();
    expect(insertOne.mock.calls[0][0]).not.toHaveProperty('coverImageUrl');
    const withCover = await resolvers.Mutation.createPost({}, { input: { ...input, slug: 'with-cover', coverImageUrl: cloudinary } }, editor);
    expect(withCover.coverImageUrl).toBe(cloudinary);
    expect(insertOne.mock.calls[1][0].coverImageUrl).toBe(cloudinary);
  });

  it('rejects an unsafe cover before writing', async () => {
    const insertOne = vi.fn();
    const resolvers = editorResolvers({ insertOne } as unknown as Collection<PostDocument>);
    await expect(resolvers.Mutation.createPost({}, { input: { ...input, coverImageUrl: 'http://cdn.example.com/cat.jpg' } }, editor)).rejects.toMatchObject({
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(insertOne).not.toHaveBeenCalled();
  });

  it('replaces a cover, clears it with null, and leaves it unchanged when omitted', async () => {
    const _id = new ObjectId();
    const findOneAndUpdate = vi.fn().mockImplementation(async (_filter, update: { $set: Partial<PostDocument>; $unset?: { coverImageUrl: '' } }) => ({
      _id,
      title: update.$set.title,
      slug: update.$set.slug,
      excerpt: update.$set.excerpt,
      contentMarkdown: update.$set.contentMarkdown,
      category: update.$set.category ?? 'CATS',
      tags: [],
      status: 'draft' as const,
      publishedAt: null,
      coverImageUrl: update.$unset ? undefined : update.$set.coverImageUrl,
    }));
    const resolvers = editorResolvers({ findOneAndUpdate } as unknown as Collection<PostDocument>);
    const replaced = await resolvers.Mutation.updatePost({}, { id: _id.toHexString(), input: { ...input, coverImageUrl: jpg } }, editor);
    expect(replaced.coverImageUrl).toBe(jpg);
    expect(findOneAndUpdate.mock.calls[0][1].$set.coverImageUrl).toBe(jpg);
    expect(findOneAndUpdate.mock.calls[0][1].$unset).toBeUndefined();
    const cleared = await resolvers.Mutation.updatePost({}, { id: _id.toHexString(), input: { ...input, coverImageUrl: null } }, editor);
    expect(cleared.coverImageUrl).toBeNull();
    expect(findOneAndUpdate.mock.calls[1][1].$unset).toEqual({ coverImageUrl: '' });
    expect(findOneAndUpdate.mock.calls[1][1].$set).not.toHaveProperty('coverImageUrl');
    await resolvers.Mutation.updatePost({}, { id: _id.toHexString(), input }, editor);
    expect(findOneAndUpdate.mock.calls[2][1]).toEqual({
      $set: { title: 'Cover', slug: 'cover-post', excerpt: 'A post', contentMarkdown: '本文', category: 'CATS' },
    });
  });

  it('returns a stored cover from the editor query', async () => {
    const _id = new ObjectId();
    const doc = {
      _id, title: 'Cover', slug: 'cover-post', excerpt: 'A post', contentMarkdown: '本文',
      category: 'CATS' as const, tags: [], status: 'draft' as const, publishedAt: null, coverImageUrl: jpg,
    };
    const found = await editorResolvers({ findOne: vi.fn().mockResolvedValue(doc) } as unknown as Collection<PostDocument>)
      .Query.editorPost({}, { id: _id.toHexString() }, editor);
    expect(found?.coverImageUrl).toBe(jpg);
  });
});
