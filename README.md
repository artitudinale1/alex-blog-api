# Alex Blog API

Independent Node.js + TypeScript + GraphQL Yoga + MongoDB backend for the blog section of [alexgarulli.org.uk](https://www.alexgarulli.org.uk/).

**Status:** Public read API is live. Phase 2 adds authenticated editor mutations for a future `/admin/blog` page. Set `EDITOR_AUTH_SECRET` and `ADMIN_GITHUB_IDS` before that page can save. See [technical design](docs/TECHNICAL_DESIGN.md).

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

Anonymous clients can only read published posts. `posts` and `post` never return drafts, and the public `Post` type has no status field. Drafts, `createPost`, `updatePost`, `publishPost`, and `unpublishPost` require a short-lived token signed by the Next.js server after GitHub sign-in. This API does not run a second OAuth flow. See [technical design](docs/TECHNICAL_DESIGN.md) and [decisions](docs/DECISIONS.md).

## Deployment

Render configuration is in `render.yaml`. `MONGODB_URI`, `EDITOR_AUTH_SECRET`, and `ADMIN_GITHUB_IDS` are entered in the Render dashboard and are not part of the repository. The editor secret must be the same value on the Next.js server. Public reads keep working when the editor variables are absent. Instructions are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security

Never commit `.env`, database credentials, real private data, or copyrighted images. Production requires `CORS_ORIGINS`. The service binds all interfaces so the host can reach it, and it listens only after MongoDB connects.
