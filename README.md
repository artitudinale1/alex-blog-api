# Alex Blog API

Independent Node.js + TypeScript + GraphQL Yoga + MongoDB backend for the blog section of [alexgarulli.org.uk](https://www.alexgarulli.org.uk/).

**Status:** Phase 1 scaffold. No MongoDB Atlas account, deployment, or live frontend integration yet.

## Requirements

- Node.js 22+
- MongoDB Atlas database (or local MongoDB)

## Local setup

```bash
npm install
cp .env.example .env
# Add your own MongoDB URI to .env (never commit credentials)
npm run seed
npm run dev
```

Open `http://localhost:4000/graphql` and try:

```graphql
query {
  posts(limit: 10) { title slug category excerpt publishedAt }
}
```

Or `post(slug: "japanese-cats-and-katakana") { title contentMarkdown }`.

`npm run check` runs TypeScript and tests without requiring a database. `npm run seed` adds two idempotent demo posts; replace these before public launch.

## Scope

Phase 1 is intentionally **read-only**. Drafts never appear in public queries; no public mutations or admin endpoints exist. The existing portfolio remains unchanged. See [technical design](docs/TECHNICAL_DESIGN.md) and [decisions](docs/DECISIONS.md).

## Security

Never commit `.env`, database credentials, real private data, or copyrighted images. Before deployment, restrict MongoDB network access appropriately, configure CORS origins, and select a backend host. This scaffold is not deployed.
# alex-blog-api
