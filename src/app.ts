import { createYoga, createSchema } from 'graphql-yoga';
import type { Collection } from 'mongodb';
import { typeDefs } from './schema.js';
import { postResolvers, type PostDocument } from './posts.js';

export function createApp(posts: Collection<PostDocument>, allowedOrigins: string[]) {
  return createYoga({
    schema: createSchema({ typeDefs, resolvers: postResolvers(posts) }),
    graphqlEndpoint: '/graphql',
    cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'OPTIONS'] },
    maskedErrors: true,
    graphiql: process.env.NODE_ENV !== 'production',
  });
}
