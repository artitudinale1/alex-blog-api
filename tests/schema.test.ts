import { describe, expect, it } from 'vitest';
import { buildSchema, graphql, GraphQLObjectType } from 'graphql';
import { typeDefs } from '../src/schema.js';

describe('public GraphQL contract', () => {
  it('has a valid schema', () => expect(() => buildSchema(typeDefs)).not.toThrow());
  it('keeps public posts free of status and ignores a browser-supplied GitHub id', async () => {
    const schema = buildSchema(typeDefs);
    const post = schema.getType('Post');
    expect(post).toBeInstanceOf(GraphQLObjectType);
    expect(Object.keys((post as GraphQLObjectType).getFields()).sort()).toEqual([
      'category', 'contentMarkdown', 'coverImageUrl', 'excerpt', 'id', 'publishedAt', 'slug', 'tags', 'title',
    ]);
    expect((post as GraphQLObjectType).getFields().coverImageUrl.type.toString()).toBe('String');
    expect(Object.keys(schema.getMutationType()?.getFields() ?? {}).sort()).toEqual([
      'createPost', 'publishPost', 'unpublishPost', 'updatePost',
    ]);
    expect(schema.getMutationType()?.getFields().createPost.args.map((arg) => arg.name)).toEqual(['input']);
    const leaked = await graphql({
      schema,
      source: 'mutation { createPost(input: { title: "a", slug: "a", excerpt: "a", contentMarkdown: "a", category: CODE }, githubId: "1") { id } }',
    });
    expect(leaked.errors?.[0].message).toMatch(/githubId/);
    const status = await graphql({ schema, source: '{ posts { status } }' });
    expect(status.errors?.[0].message).toMatch(/status/);
  });
  it('supports Japanese content in the GraphQL response', async () => {
    const schema = buildSchema('type Query { greeting: String! }');
    const result = await graphql({ schema, source: '{ greeting }', rootValue: { greeting: '猫（ねこ）' } });
    expect(result.data?.greeting).toBe('猫（ねこ）');
  });
});
