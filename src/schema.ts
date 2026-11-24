export const typeDefs = /* GraphQL */ `
  enum Category { CODE JAPANESE CATS COOKING }
  type Post {
    id: ID!
    title: String!
    slug: String!
    excerpt: String!
    contentMarkdown: String!
    category: Category!
    tags: [String!]!
    publishedAt: String!
  }
  type Query {
    posts(category: Category, limit: Int = 20, offset: Int = 0): [Post!]!
    post(slug: String!): Post
  }
`;
