import { describe, expect, it } from 'vitest';
import { buildSchema, graphql } from 'graphql';
import { typeDefs } from '../src/schema.js';

describe('public GraphQL contract', () => {
  it('has a valid schema', () => expect(() => buildSchema(typeDefs)).not.toThrow());
  it('exposes read-only queries, without public mutations', () => {
    const schema = buildSchema(typeDefs);
    expect(schema.getMutationType()).toBeUndefined();
    expect(schema.getQueryType()?.getFields()).toHaveProperty('posts');
    expect(schema.getQueryType()?.getFields()).toHaveProperty('post');
  });
  it('supports Japanese content in the GraphQL response', async () => {
    const schema = buildSchema('type Query { greeting: String! }');
    const result = await graphql({ schema, source: '{ greeting }', rootValue: { greeting: '猫（ねこ）' } });
    expect(result.data?.greeting).toBe('猫（ねこ）');
  });
});
