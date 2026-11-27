import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Collection } from 'mongodb';
import { createApp } from '../src/app.js';
import { editorResolvers, type PostInput } from '../src/editor.js';
import { signEditorToken, type AppContext } from '../src/editor-auth.js';
import type { PostDocument } from '../src/posts.js';

const secret = '0123456789abcdef0123456789abcdef';
const editor: AppContext = { editor: { githubId: '12345' }, authFailure: null };
const anonymous: AppContext = { editor: null, authFailure: null };
const input: PostInput = {
  title: ' 猫の話 ',
  slug: 'neko-no-hanashi',
  excerpt: 'A draft',
  contentMarkdown: '<ruby>猫<rt>ねこ</rt></ruby>',
  category: 'CATS',
  tags: ['Cat', 'Cat', ' 近所 '],
};

function callsThrow(message: string) {
  const fail = () => { throw new Error(message); };
  return { find: fail, findOne: fail, insertOne: fail, findOneAndUpdate: fail } as unknown as Collection<PostDocument>;
}

describe('editor authorization', () => {
  it.each(['createPost', 'updatePost', 'publishPost', 'unpublishPost'] as const)(
    'does not run %s without an editor token',
    async (name) => {
      const resolvers = editorResolvers(callsThrow('database used'));
      const args = name === 'createPost' ? { input, githubId: '12345' } : { id: new ObjectId().toHexString(), input, githubId: '12345' };
      await expect(resolvers.Mutation[name]({}, args, anonymous)).rejects.toMatchObject({
        message: 'Authentication required',
        extensions: { code: 'UNAUTHENTICATED' },
      });
    },
  );

  it('does not list or load drafts for an anonymous caller', async () => {
    const resolvers = editorResolvers(callsThrow('database used'));
    await expect(resolvers.Query.editorPosts({}, {}, anonymous)).rejects.toMatchObject({ extensions: { code: 'UNAUTHENTICATED' } });
    await expect(resolvers.Query.editorPost({}, { id: new ObjectId().toHexString() }, anonymous)).rejects.toMatchObject({
      extensions: { code: 'UNAUTHENTICATED' },
    });
  });

  it('rejects a signed token for a GitHub id that is not allow-listed', async () => {
    const resolvers = editorResolvers(callsThrow('database used'));
    const ctx: AppContext = { editor: null, authFailure: 'forbidden' };
    await expect(resolvers.Mutation.publishPost({}, { id: 'x' }, ctx)).rejects.toMatchObject({
      message: 'Not an allowed editor',
      extensions: { code: 'FORBIDDEN' },
    });
  });
});

describe('editor mutations', () => {
  it('trims Markdown for the human editor', async () => {
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const created = await editorResolvers({ insertOne } as unknown as Collection<PostDocument>).Mutation.createPost(
      {}, { input: { ...input, contentMarkdown: '  \n本文\n  ' } }, editor,
    );
    expect(created.contentMarkdown).toBe('本文');
    expect(insertOne.mock.calls[0][0].contentMarkdown).toBe('本文');
  });

  it('creates a draft without trusting a browser-supplied GitHub id', async () => {
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const collection = { insertOne } as unknown as Collection<PostDocument>;
    const created = await editorResolvers(collection).Mutation.createPost({}, { input }, editor);
    expect(created.status).toBe('DRAFT');
    expect(created.publishedAt).toBeNull();
    expect(created.title).toBe('猫の話');
    expect(created.tags).toEqual(['Cat', '近所']);
    const stored = insertOne.mock.calls[0][0] as PostDocument & { githubId?: string };
    expect(stored.status).toBe('draft');
    expect(stored.publishedAt).toBeNull();
    expect(stored.slug).toBe('neko-no-hanashi');
    expect(stored).not.toHaveProperty('githubId');
    expect(created.id).toBe(stored._id?.toHexString());
  });

  it('rejects invalid title, slug, category, and duplicate slugs', async () => {
    const insertOne = vi.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));
    const resolvers = editorResolvers({ insertOne } as unknown as Collection<PostDocument>);
    await expect(resolvers.Mutation.createPost({}, { input: { ...input, title: '  ' } }, editor)).rejects.toThrow(/title/);
    await expect(resolvers.Mutation.createPost({}, { input: { ...input, slug: 'Neko' } }, editor)).rejects.toThrow(/slug/);
    await expect(resolvers.Mutation.createPost({}, { input: { ...input, category: 'DOGS' as PostInput['category'] } }, editor)).rejects.toThrow(/category/);
    expect(insertOne).not.toHaveBeenCalled();
    await expect(resolvers.Mutation.createPost({}, { input }, editor)).rejects.toMatchObject({
      message: 'slug already exists',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('updates text without changing id, status, or publishedAt', async () => {
    const publishedAt = new Date('2026-11-23T12:00:00Z');
    const _id = new ObjectId();
    const findOneAndUpdate = vi.fn().mockImplementation(async (_filter, update: { $set: Partial<PostDocument> }) => ({
      _id, title: update.$set.title, slug: update.$set.slug, excerpt: update.$set.excerpt,
      contentMarkdown: update.$set.contentMarkdown, category: update.$set.category, tags: ['Cat'],
      status: 'published', publishedAt,
    }));
    const updated = await editorResolvers({ findOneAndUpdate } as unknown as Collection<PostDocument>).Mutation.updatePost(
      {}, { id: _id.toHexString(), input: { ...input, tags: undefined } }, editor,
    );
    expect(updated.id).toBe(_id.toHexString());
    expect(updated.status).toBe('PUBLISHED');
    expect(updated.publishedAt).toBe('2026-11-23T12:00:00.000Z');
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id },
      { $set: { title: '猫の話', slug: 'neko-no-hanashi', excerpt: 'A draft', contentMarkdown: input.contentMarkdown, category: 'CATS' } },
      { returnDocument: 'after' },
    );
  });

  it('publishes once, keeps the original date, and unpublish hides the post as a draft', async () => {
    const _id = new ObjectId();
    const existing = {
      _id, title: '猫', slug: 'neko', excerpt: 'Cat', contentMarkdown: '本文', category: 'CATS' as const,
      tags: [], status: 'draft' as const, publishedAt: null,
    };
    const findOne = vi.fn().mockResolvedValue(existing);
    const findOneAndUpdate = vi.fn().mockImplementation(async (_filter, update: { $set: Partial<PostDocument> }) => ({ ...existing, ...update.$set }));
    const collection = { findOne, findOneAndUpdate } as unknown as Collection<PostDocument>;
    const published = await editorResolvers(collection).Mutation.publishPost({}, { id: _id.toHexString() }, editor);
    const publishedAt = findOneAndUpdate.mock.calls[0][1].$set.publishedAt as Date;
    expect(published.status).toBe('PUBLISHED');
    expect(published.publishedAt).toBe(publishedAt.toISOString());
    expect(findOneAndUpdate.mock.calls[0][1].$set).toEqual({ status: 'published', publishedAt });
    findOne.mockResolvedValue({ ...existing, status: 'published', publishedAt });
    await editorResolvers(collection).Mutation.publishPost({}, { id: _id.toHexString() }, editor);
    expect(findOneAndUpdate.mock.calls[1][1].$set.publishedAt).toEqual(publishedAt);
    const hidden = await editorResolvers(collection).Mutation.unpublishPost({}, { id: _id.toHexString() }, editor);
    expect(hidden.status).toBe('DRAFT');
    expect(hidden.contentMarkdown).toBe('本文');
    expect(findOneAndUpdate.mock.calls[2][1]).toEqual({ $set: { status: 'draft' } });
  });

  it('returns a draft to the editor and does not require published status', async () => {
    const _id = new ObjectId();
    const draft = {
      _id, title: '下書き', slug: 'shitagaki', excerpt: 'Draft', contentMarkdown: 'まだ', category: 'CODE' as const,
      tags: [], status: 'draft' as const, publishedAt: null,
    };
    const findOne = vi.fn().mockResolvedValue(draft);
    const found = await editorResolvers({ findOne } as unknown as Collection<PostDocument>).Query.editorPost({}, { id: _id.toHexString() }, editor);
    expect(found).toMatchObject({ id: _id.toHexString(), status: 'DRAFT', publishedAt: null, title: '下書き' });
    expect(findOne).toHaveBeenCalledWith({ _id });
  });
});

describe('GraphQL HTTP authorization', () => {
  const auth = { secret, adminGithubIds: new Set(['12345']) };
  const published = {
    _id: new ObjectId(), title: 'Live', slug: 'live', excerpt: 'Public', contentMarkdown: 'text',
    category: 'CODE' as const, tags: [], status: 'published' as const, publishedAt: new Date('2026-11-23T12:00:00Z'),
  };

  function app() {
    const toArray = vi.fn().mockResolvedValue([published]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    const find = vi.fn().mockReturnValue({ sort });
    const collection = { find, findOne: vi.fn(), insertOne: vi.fn(), findOneAndUpdate: vi.fn() } as unknown as Collection<PostDocument>;
    return { yoga: createApp(collection, ['http://localhost:3000'], auth), find };
  }

  async function query(authorization: string | null, source: string) {
    const { yoga, find } = app();
    const headers = new Headers({ 'content-type': 'application/json' });
    if (authorization) headers.set('authorization', authorization);
    const response = await yoga.fetch('http://localhost:4000/graphql', { method: 'POST', headers, body: JSON.stringify({ query: source }) });
    return { body: await response.json() as { data?: { posts?: { title: string }[]; editorPosts?: { title: string }[] }; errors?: { message: string; extensions?: { code?: string } }[] }, find };
  }

  it('keeps public posts available when the editor token is missing or invalid', async () => {
    for (const authorization of [null, 'Bearer garbage']) {
      const { body, find } = await query(authorization, '{ posts { title } }');
      expect(body.errors).toBeUndefined();
      expect(body.data?.posts).toEqual([{ title: 'Live' }]);
      expect(find).toHaveBeenCalledWith(expect.objectContaining({ status: 'published' }));
    }
  });

  it('hides drafts from callers who do not present an allow-listed editor token', async () => {
    const missing = await query(null, '{ editorPosts { title status } }');
    expect(missing.body.data?.editorPosts).toBeUndefined();
    expect(missing.body.errors?.[0]).toMatchObject({ message: 'Authentication required', extensions: { code: 'UNAUTHENTICATED' } });
    const token = signEditorToken(secret, '12345');
    const allowed = await query(`Bearer ${token}`, '{ editorPosts { title } }');
    expect(allowed.body.errors).toBeUndefined();
    expect(allowed.body.data?.editorPosts).toEqual([{ title: 'Live' }]);
  });

  it('does not leak unexpected failures to the client', async () => {
    const find = () => { throw new Error('mongodb+srv://user:password@cluster.example'); };
    const collection = { find, findOne: vi.fn(), insertOne: vi.fn(), findOneAndUpdate: vi.fn() } as unknown as Collection<PostDocument>;
    const yoga = createApp(collection, ['http://localhost:3000'], auth);
    const token = signEditorToken(secret, '12345');
    const response = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: '{ editorPosts { title } }' }),
    });
    const body = await response.json() as { errors?: { message: string }[] };
    expect(JSON.stringify(body)).not.toContain('password');
    expect(body.errors?.[0].message).toBe('Unexpected error.');
  });
});
