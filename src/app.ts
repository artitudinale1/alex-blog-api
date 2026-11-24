import { createYoga, createSchema } from 'graphql-yoga';
import type { Collection } from 'mongodb';
import { typeDefs } from './schema.js';
import { postResolvers, type PostDocument } from './posts.js';
import { editorResolvers, maskClientError } from './editor.js';
import { resolveAuthorization, type EditorAuthConfig } from './editor-auth.js';

export function createApp(posts: Collection<PostDocument>, allowedOrigins: string[], auth: EditorAuthConfig) {
  const editing = editorResolvers(posts);
  return createYoga({
    schema: createSchema({
      typeDefs,
      resolvers: {
        Query: { ...postResolvers(posts).Query, ...editing.Query },
        Mutation: editing.Mutation,
      },
    }),
    graphqlEndpoint: '/graphql',
    cors: { origin: allowedOrigins, methods: ['GET', 'POST', 'OPTIONS'] },
    maskedErrors: { maskError: maskClientError },
    graphiql: process.env.NODE_ENV !== 'production',
    context: ({ request }) => resolveAuthorization(request.headers.get('authorization'), auth),
  });
}
