# Alex Blog API

Independent Node.js + TypeScript + GraphQL Yoga + MongoDB backend for the blog section of [alexgarulli.org.uk](https://www.alexgarulli.org.uk/).

**Status:** Phase 1 is implemented locally against MongoDB Atlas (`alex-blog` / `alex_blog`). Public hosting is configured for a Render Free web service and is not live until that blueprint is applied. See [deployment](docs/DEPLOYMENT.md).

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

## Deployment

Render configuration is in `render.yaml`. It selects the Free plan, Frankfurt, `npm start`, and `GET /health`. `MONGODB_URI` is entered in the Render dashboard and is not part of the repository. Applying the blueprint, and any change to Atlas network access, waits for approval. Instructions and the network-access tradeoff are in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Security

Never commit `.env`, database credentials, real private data, or copyrighted images. Production requires `CORS_ORIGINS`. The service binds all interfaces so the host can reach it, and it listens only after MongoDB connects.
