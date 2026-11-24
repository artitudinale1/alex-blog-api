export const typeDefs = /* GraphQL */ `
  enum Category { CODE JAPANESE CATS COOKING }
  enum PostStatus { DRAFT PUBLISHED }
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
  type EditorPost {
    id: ID!
    title: String!
    slug: String!
    excerpt: String!
    contentMarkdown: String!
    category: Category!
    tags: [String!]!
    status: PostStatus!
    publishedAt: String
  }
  input PostInput {
    title: String!
    slug: String!
    excerpt: String!
    contentMarkdown: String!
    category: Category!
    tags: [String!]
  }
  type Query {
    posts(category: Category, limit: Int = 20, offset: Int = 0): [Post!]!
    post(slug: String!): Post
    editorPosts(status: PostStatus, limit: Int = 20, offset: Int = 0): [EditorPost!]!
    editorPost(id: ID!): EditorPost
  }
  type Mutation {
    createPost(input: PostInput!): EditorPost!
    updatePost(id: ID!, input: PostInput!): EditorPost!
    publishPost(id: ID!): EditorPost!
    unpublishPost(id: ID!): EditorPost!
  }
`;
