import { describe, expect, it, vi } from 'vitest';
import { ObjectId, type Collection } from 'mongodb';
import { createApp } from '../src/app.js';
import { editorResolvers, type PostInput } from '../src/editor.js';
import { signEditorToken, type AppContext } from '../src/editor-auth.js';
import type { PostDocument } from '../src/posts.js';

const agentSecret = 'agent-secret-0123456789abcdef0123456789';
const editorSecret = 'editor-secret-0123456789abcdef012345';
const agent: AppContext = { editor: null, authFailure: null, agent: true, agentFailure: null };
const editor: AppContext = { editor: { githubId: '12345' }, authFailure: null };
const input: PostInput = {
  title: 'Draft',
  slug: 'agent-draft',
  excerpt: 'Notes',
  contentMarkdown: '本文',
  category: 'CODE',
};

function closed(): Collection<PostDocument> {
  const fail = () => { throw new Error('database used'); };
  return { find: fail, findOne: fail, insertOne: fail, findOneAndUpdate: fail } as unknown as Collection<PostDocument>;
}

function draftDoc(id: ObjectId): PostDocument & { _id: ObjectId } {
  return {
    _id: id, title: 'Draft', slug: 'agent-draft', excerpt: 'Notes', contentMarkdown: '本文',
    category: 'CODE', tags: [], status: 'draft', publishedAt: null,
  };
}

describe('agent permissions', () => {
  it('looks up drafts and published articles', async () => {
    const draft = draftDoc(new ObjectId());
    const published = { ...draftDoc(new ObjectId()), status: 'published' as const, publishedAt: new Date('2026-11-23T12:00:00Z') };
    const toArray = vi.fn().mockResolvedValue([draft, published]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    const find = vi.fn().mockReturnValue({ sort });
    const findOne = vi.fn().mockResolvedValue(draft);
    const resolvers = editorResolvers({ find, findOne } as unknown as Collection<PostDocument>);
    const listed = await resolvers.Query.editorPosts({}, {}, agent);
    expect(listed.map((post) => post.status)).toEqual(['DRAFT', 'PUBLISHED']);
    const found = await resolvers.Query.editorPost({}, { id: draft._id.toHexString() }, agent);
    expect(found).toMatchObject({ status: 'DRAFT', title: 'Draft' });
    expect(findOne).toHaveBeenCalledWith({ _id: draft._id });
  });

  it('stores agent Markdown exactly and rejects blank or oversized content', async () => {
    const markdown = '\n  本文\n\n';
    const padded = `  ${markdown}  `;
    const insertOne = vi.fn().mockResolvedValue({ acknowledged: true });
    const id = new ObjectId();
    const findOneAndUpdate = vi.fn().mockImplementation(async (_filter, update: { $set: Partial<PostDocument> }) => ({
      ...draftDoc(id), contentMarkdown: update.$set.contentMarkdown,
    }));
    const resolvers = editorResolvers({ insertOne, findOneAndUpdate } as unknown as Collection<PostDocument>);
    const created = await resolvers.Mutation.createPost({}, { input: { ...input, contentMarkdown: markdown } }, agent);
    expect(created.contentMarkdown).toBe(markdown);
    expect(insertOne.mock.calls[0][0].contentMarkdown).toBe(markdown);
    const updated = await resolvers.Mutation.updatePost({}, { id: id.toHexString(), input: { ...input, contentMarkdown: padded } }, agent);
    expect(updated.contentMarkdown).toBe(padded);
    expect(findOneAndUpdate.mock.calls[0][1].$set.contentMarkdown).toBe(padded);
    const rejectedInsert = vi.fn();
    const rejectedUpdate = vi.fn();
    const rejected = editorResolvers({ insertOne: rejectedInsert, findOneAndUpdate: rejectedUpdate } as unknown as Collection<PostDocument>);
    await expect(rejected.Mutation.createPost({}, { input: { ...input, contentMarkdown: ' \n\t ' } }, agent)).rejects.toThrow(/contentMarkdown/);
    await expect(rejected.Mutation.updatePost({}, { id: id.toHexString(), input: { ...input, contentMarkdown: '   ' } }, agent)).rejects.toThrow(/contentMarkdown/);
    await expect(rejected.Mutation.createPost({}, { input: { ...input, contentMarkdown: `${'a'.repeat(100_000)}\n` } }, agent)).rejects.toThrow(/too long/);
    expect(rejectedInsert).not.toHaveBeenCalled();
    expect(rejectedUpdate).not.toHaveBeenCalled();
  });

  it('creates a draft and rejects a duplicate slug', async () => {
    const insertOne = vi.fn()
      .mockResolvedValueOnce({ acknowledged: true })
      .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: 11000 }));
    const resolvers = editorResolvers({ insertOne } as unknown as Collection<PostDocument>);
    const created = await resolvers.Mutation.createPost({}, { input }, agent);
    expect(created.status).toBe('DRAFT');
    expect(created.publishedAt).toBeNull();
    expect(insertOne.mock.calls[0][0]).toMatchObject({ status: 'draft', publishedAt: null, slug: 'agent-draft' });
    await expect(resolvers.Mutation.createPost({}, { input }, agent)).rejects.toMatchObject({
      message: 'slug already exists',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('updates a draft atomically and refuses a published article', async () => {
    const id = new ObjectId();
    const findOneAndUpdate = vi.fn()
      .mockImplementationOnce(async (filter: { status?: string }, update: { $set: Partial<PostDocument> }) => ({
        ...draftDoc(id), ...update.$set, status: filter.status,
      }))
      .mockResolvedValueOnce(null);
    const findOne = vi.fn().mockResolvedValue({ ...draftDoc(id), status: 'published', publishedAt: new Date('2026-11-23T12:00:00Z') });
    const resolvers = editorResolvers({ findOneAndUpdate, findOne } as unknown as Collection<PostDocument>);
    const updated = await resolvers.Mutation.updatePost({}, { id: id.toHexString(), input: { ...input, title: 'Revised' } }, agent);
    expect(updated).toMatchObject({ title: 'Revised', status: 'DRAFT' });
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(1, { _id: id, status: 'draft' }, expect.any(Object), { returnDocument: 'after' });
    expect(findOneAndUpdate.mock.calls[0][1].$set).not.toHaveProperty('status');
    await expect(resolvers.Mutation.updatePost({}, { id: id.toHexString(), input }, agent)).rejects.toMatchObject({
      message: 'Agents can only update drafts',
      extensions: { code: 'FORBIDDEN' },
    });
    expect(findOneAndUpdate).toHaveBeenNthCalledWith(2, { _id: id, status: 'draft' }, expect.any(Object), { returnDocument: 'after' });
  });

  it('cannot publish or unpublish', async () => {
    const resolvers = editorResolvers(closed());
    await expect(resolvers.Mutation.publishPost({}, { id: new ObjectId().toHexString() }, agent)).rejects.toMatchObject({
      message: 'Agents cannot publish or unpublish',
      extensions: { code: 'FORBIDDEN' },
    });
    await expect(resolvers.Mutation.unpublishPost({}, { id: new ObjectId().toHexString() }, agent)).rejects.toMatchObject({
      extensions: { code: 'FORBIDDEN' },
    });
  });

  it('rejects missing, invalid, and unconfigured credentials before touching the database', async () => {
    const resolvers = editorResolvers(closed());
    const id = new ObjectId().toHexString();
    await expect(resolvers.Mutation.createPost({}, { input }, { editor: null, authFailure: null })).rejects.toMatchObject({
      message: 'Authentication required',
    });
    await expect(resolvers.Query.editorPosts({}, {}, { editor: null, authFailure: null, agentFailure: 'invalid' })).rejects.toMatchObject({
      message: 'Invalid agent credentials',
      extensions: { code: 'UNAUTHENTICATED' },
    });
    await expect(resolvers.Mutation.updatePost({}, { id, input }, { editor: null, authFailure: null, agentFailure: 'unconfigured' })).rejects.toMatchObject({
      message: 'Agent authentication is not configured',
    });
    await expect(resolvers.Mutation.publishPost({}, { id }, { editor: null, authFailure: null, agentFailure: 'invalid' })).rejects.toMatchObject({
      message: 'Invalid agent credentials',
    });
  });

  it('keeps editor updates and publishing on the existing path', async () => {
    const id = new ObjectId();
    const publishedAt = new Date('2026-11-23T12:00:00Z');
    const existing = { ...draftDoc(id), status: 'published' as const, publishedAt };
    const findOneAndUpdate = vi.fn().mockImplementation(async (_filter, update: { $set: Partial<PostDocument> }) => ({ ...existing, ...update.$set }));
    const findOne = vi.fn().mockResolvedValue(existing);
    const resolvers = editorResolvers({ findOne, findOneAndUpdate } as unknown as Collection<PostDocument>);
    const revised = await resolvers.Mutation.updatePost({}, { id: id.toHexString(), input: { ...input, title: 'Editor revision' } }, editor);
    expect(revised.status).toBe('PUBLISHED');
    expect(findOneAndUpdate).toHaveBeenCalledWith({ _id: id }, expect.any(Object), { returnDocument: 'after' });
    const published = await resolvers.Mutation.publishPost({}, { id: id.toHexString() }, editor);
    expect(published.status).toBe('PUBLISHED');
    expect(findOneAndUpdate.mock.calls[1][0]).toEqual({ _id: id });
  });
});

describe('agent HTTP boundary', () => {
  const auth = { secret: editorSecret, adminGithubIds: new Set(['12345']) };
  const agentAuth = { secret: agentSecret };

  it('authenticates the agent header and keeps the editor token separate', async () => {
    const draft = draftDoc(new ObjectId());
    const toArray = vi.fn().mockResolvedValue([draft]);
    const limit = vi.fn().mockReturnValue({ toArray });
    const skip = vi.fn().mockReturnValue({ limit });
    const sort = vi.fn().mockReturnValue({ skip });
    const find = vi.fn().mockReturnValue({ sort });
    const insertOne = vi.fn();
    const findOne = vi.fn();
    const findOneAndUpdate = vi.fn();
    const yoga = createApp(
      { find, findOne, insertOne, findOneAndUpdate } as unknown as Collection<PostDocument>,
      ['http://localhost:3000'],
      auth,
      agentAuth,
    );
    const agentResponse = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-authorization': `Bearer ${agentSecret}` },
      body: JSON.stringify({ query: '{ editorPosts { status title } }' }),
    });
    const agentBody = await agentResponse.json() as { data?: { editorPosts: { status: string }[] }; errors?: { message: string }[] };
    expect(agentBody.errors).toBeUndefined();
    expect(agentBody.data?.editorPosts).toEqual([{ status: 'DRAFT', title: 'Draft' }]);

    const editorResponse = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${signEditorToken(editorSecret, '12345')}` },
      body: JSON.stringify({ query: '{ editorPosts { title } }' }),
    });
    const editorBody = await editorResponse.json() as { errors?: { message: string }[] };
    expect(editorBody.errors).toBeUndefined();

    const rejected = await yoga.fetch('http://localhost:4000/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agent-authorization': `Bearer ${agentSecret}` },
      body: JSON.stringify({ query: `mutation { publishPost(id: "${draft._id.toHexString()}") { id } }` }),
    });
    const rejectedBody = await rejected.json() as { errors?: { message: string }[] };
    expect(rejectedBody.errors?.[0].message).toBe('Agents cannot publish or unpublish');
    expect(JSON.stringify(rejectedBody)).not.toContain(agentSecret);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});
