import { GraphQLError } from 'graphql';
import { ObjectId, type Collection, type Filter, type WithId } from 'mongodb';
import type { AppContext } from './editor-auth.js';
import { parseCoverImageUrl } from './cover-image.js';
import { coverImageValue, type Category, type PostDocument } from './posts.js';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

export interface PostInput {
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  category: Category;
  tags?: string[] | null;
  coverImageUrl?: string | null;
}

interface ValidatedFields {
  title: string;
  slug: string;
  excerpt: string;
  contentMarkdown: string;
  category: Category;
  tags?: string[];
  coverImageUrl?: string | null;
}

const CLIENT_CODES = new Set(['UNAUTHENTICATED', 'FORBIDDEN', 'BAD_USER_INPUT', 'NOT_FOUND']);

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT' } });
}

export function maskClientError(error: unknown, message: string): GraphQLError {
  const trusted = clientError(error);
  if (!trusted) return new GraphQLError(message, { extensions: { code: 'INTERNAL_SERVER_ERROR' } });
  const path = error && typeof error === 'object' && 'path' in error && Array.isArray(error.path) ? error.path : undefined;
  return new GraphQLError(trusted.message, { path, extensions: { code: trusted.extensions.code } });
}

function clientError(error: unknown): GraphQLError | null {
  if (!error || typeof error !== 'object' || error === null) return null;
  const candidate = error as GraphQLError & { originalError?: unknown };
  const code = candidate.extensions?.code;
  if (typeof candidate.message === 'string' && typeof code === 'string' && CLIENT_CODES.has(code)) return candidate;
  if (candidate.originalError && candidate.originalError !== error) return clientError(candidate.originalError);
  return null;
}

function notFound(): GraphQLError {
  return new GraphQLError('Post not found', { extensions: { code: 'NOT_FOUND' } });
}

export function requireEditor(ctx: AppContext | undefined): NonNullable<AppContext['editor']> {
  if (ctx?.editor) return ctx.editor;
  if (ctx?.authFailure === 'forbidden') {
    throw new GraphQLError('Not an allowed editor', { extensions: { code: 'FORBIDDEN' } });
  }
  if (ctx?.authFailure === 'unconfigured') {
    throw new GraphQLError('Editor authentication is not configured', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  if (ctx?.authFailure === 'invalid') {
    throw new GraphQLError('Invalid editor token', { extensions: { code: 'UNAUTHENTICATED' } });
  }
  throw new GraphQLError('Authentication required', { extensions: { code: 'UNAUTHENTICATED' } });
}

function agentCredentialError(ctx: AppContext | undefined): GraphQLError | null {
  if (ctx?.agentFailure === 'invalid') return new GraphQLError('Invalid agent credentials', { extensions: { code: 'UNAUTHENTICATED' } });
  if (ctx?.agentFailure === 'unconfigured') return new GraphQLError('Agent authentication is not configured', { extensions: { code: 'UNAUTHENTICATED' } });
  return null;
}

function requireWriter(ctx: AppContext | undefined): 'editor' | 'agent' {
  if (ctx?.editor) return 'editor';
  if (ctx?.agent) return 'agent';
  if (ctx?.authFailure) requireEditor(ctx);
  const agentError = agentCredentialError(ctx);
  if (agentError) throw agentError;
  requireEditor(ctx);
  return 'editor';
}

function requireEditorOnly(ctx: AppContext | undefined): void {
  if (ctx?.editor) return;
  if (ctx?.agent) throw new GraphQLError('Agents cannot publish or unpublish', { extensions: { code: 'FORBIDDEN' } });
  if (ctx?.authFailure) requireEditor(ctx);
  const agentError = agentCredentialError(ctx);
  if (agentError) throw agentError;
  requireEditor(ctx);
}

function requireText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw badInput(`${label} is required`);
  const trimmed = value.trim();
  if (!trimmed) throw badInput(`${label} is required`);
  if (trimmed.length > max) throw badInput(`${label} is too long`);
  return trimmed;
}

function contentMarkdownValue(value: unknown, preserveExact: boolean): string {
  if (!preserveExact) return requireText(value, 'contentMarkdown', 100_000);
  if (typeof value !== 'string' || value.trim().length === 0) throw badInput('contentMarkdown is required');
  if (value.length > 100_000) throw badInput('contentMarkdown is too long');
  return value;
}

export function validatePostInput(input: PostInput | undefined, mode: 'create' | 'update', options?: { preserveMarkdown?: boolean }): ValidatedFields {
  const title = requireText(input?.title, 'title', 160);
  const slug = requireText(input?.slug, 'slug', 80);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw badInput('slug must be lowercase words separated by hyphens');
  const excerpt = requireText(input?.excerpt, 'excerpt', 300);
  const contentMarkdown = contentMarkdownValue(input?.contentMarkdown, options?.preserveMarkdown === true);
  const category = input?.category;
  if (category !== 'CODE' && category !== 'JAPANESE' && category !== 'CATS' && category !== 'COOKING') {
    throw badInput('category is invalid');
  }
  const fields: ValidatedFields = { title, slug, excerpt, contentMarkdown, category };
  const coverImageUrl = parseCoverImageUrl(input?.coverImageUrl);
  if (coverImageUrl !== undefined) fields.coverImageUrl = coverImageUrl;
  if (input?.tags == null) {
    if (mode === 'create') fields.tags = [];
    return fields;
  }
  if (!Array.isArray(input.tags)) throw badInput('tags must be a list');
  if (input.tags.length > 20) throw badInput('tags are limited to 20');
  const tags: string[] = [];
  for (const tag of input.tags) {
    const value = requireText(tag, 'tag', 40);
    if (!tags.includes(value)) tags.push(value);
  }
  fields.tags = tags;
  return fields;
}

function toEditorPost(doc: WithId<PostDocument>) {
  return {
    id: doc._id.toHexString(),
    title: doc.title,
    slug: doc.slug,
    excerpt: doc.excerpt,
    contentMarkdown: doc.contentMarkdown,
    category: doc.category,
    tags: doc.tags,
    status: doc.status === 'published' ? 'PUBLISHED' : 'DRAFT',
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    coverImageUrl: coverImageValue(doc.coverImageUrl),
  };
}

function parseObjectId(id: string): ObjectId {
  if (!OBJECT_ID.test(id)) throw badInput('Invalid post id');
  return new ObjectId(id);
}

function rethrowWrite(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 11000) {
    throw badInput('slug already exists');
  }
  throw error;
}

function page(args: { limit?: number; offset?: number }): { limit: number; offset: number } {
  const limit = args.limit ?? 20;
  const offset = args.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw badInput('limit must be between 1 and 50');
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw badInput('Invalid offset');
  return { limit, offset };
}

export function editorResolvers(collection: Collection<PostDocument>) {
  return {
    Query: {
      editorPosts: async (
        _: unknown,
        args: { limit?: number; offset?: number; status?: 'DRAFT' | 'PUBLISHED' },
        ctx?: AppContext,
      ) => {
        requireWriter(ctx);
        const { limit, offset } = page(args);
        const filter: Filter<PostDocument> = {};
        if (args.status) filter.status = args.status === 'PUBLISHED' ? 'published' : 'draft';
        const docs = await collection.find(filter).sort({ _id: -1 }).skip(offset).limit(limit).toArray();
        return docs.map(toEditorPost);
      },
      editorPost: async (_: unknown, args: { id: string }, ctx?: AppContext) => {
        requireWriter(ctx);
        if (!OBJECT_ID.test(args.id)) return null;
        const doc = await collection.findOne({ _id: new ObjectId(args.id) });
        return doc ? toEditorPost(doc) : null;
      },
    },
    Mutation: {
      createPost: async (_: unknown, args: { input: PostInput }, ctx?: AppContext) => {
        const writer = requireWriter(ctx);
        const fields = validatePostInput(args.input, 'create', { preserveMarkdown: writer === 'agent' });
        const doc: WithId<PostDocument> = {
          _id: new ObjectId(),
          title: fields.title,
          slug: fields.slug,
          excerpt: fields.excerpt,
          contentMarkdown: fields.contentMarkdown,
          category: fields.category,
          tags: fields.tags ?? [],
          status: 'draft',
          publishedAt: null,
          ...(fields.coverImageUrl ? { coverImageUrl: fields.coverImageUrl } : {}),
        };
        try {
          await collection.insertOne(doc);
        } catch (error) {
          rethrowWrite(error);
        }
        return toEditorPost(doc);
      },
      updatePost: async (_: unknown, args: { id: string; input: PostInput }, ctx?: AppContext) => {
        const writer = requireWriter(ctx);
        const _id = parseObjectId(args.id);
        const fields = validatePostInput(args.input, 'update', { preserveMarkdown: writer === 'agent' });
        const $set: Partial<PostDocument> = {
          title: fields.title,
          slug: fields.slug,
          excerpt: fields.excerpt,
          contentMarkdown: fields.contentMarkdown,
          category: fields.category,
        };
        if (fields.tags !== undefined) $set.tags = fields.tags;
        const update: { $set: Partial<PostDocument>; $unset?: { coverImageUrl: '' } } = { $set };
        if (fields.coverImageUrl === null) update.$unset = { coverImageUrl: '' };
        else if (fields.coverImageUrl) $set.coverImageUrl = fields.coverImageUrl;
        const filter: Filter<PostDocument> = writer === 'agent' ? { _id, status: 'draft' } : { _id };
        try {
          const updated = await collection.findOneAndUpdate(filter, update, { returnDocument: 'after' });
          if (!updated) {
            if (writer === 'agent') {
              const existing = await collection.findOne({ _id });
              if (!existing) throw notFound();
              throw new GraphQLError('Agents can only update drafts', { extensions: { code: 'FORBIDDEN' } });
            }
            throw notFound();
          }
          return toEditorPost(updated);
        } catch (error) {
          if (error instanceof GraphQLError) throw error;
          rethrowWrite(error);
        }
      },
      publishPost: async (_: unknown, args: { id: string }, ctx?: AppContext) => {
        requireEditorOnly(ctx);
        const _id = parseObjectId(args.id);
        const existing = await collection.findOne({ _id });
        if (!existing) throw notFound();
        const updated = await collection.findOneAndUpdate(
          { _id },
          { $set: { status: 'published', publishedAt: existing.publishedAt ?? new Date() } },
          { returnDocument: 'after' },
        );
        if (!updated) throw notFound();
        return toEditorPost(updated);
      },
      unpublishPost: async (_: unknown, args: { id: string }, ctx?: AppContext) => {
        requireEditorOnly(ctx);
        const _id = parseObjectId(args.id);
        const updated = await collection.findOneAndUpdate(
          { _id },
          { $set: { status: 'draft' } },
          { returnDocument: 'after' },
        );
        if (!updated) throw notFound();
        return toEditorPost(updated);
      },
    },
  };
}
