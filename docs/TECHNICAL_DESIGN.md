# Technical design — personal blog

## Purpose
Add a blog to the existing Next.js portfolio at `www.alexgarulli.org.uk`, preserving its visual style, CV navigation and existing Contentful integration. Build a **separate** Node.js/TypeScript GraphQL backend with MongoDB, publicly visible as a portfolio project.

## Categories and content
Four initial categories: **Code, Japanese, Cats, Cooking**. Articles may mix English and Japanese (kanji, hiragana, katakana) and use furigana via accessible HTML `<ruby>` / `<rt>`. Content is stored as UTF-8 Markdown; rendering must sanitize or explicitly allow-list any embedded HTML (including ruby) to avoid XSS. Cat stories can concern neighborhood cats, not necessarily owned pets. Cosplay/costume work can be covered within Japanese initially.

## Architecture
- Existing frontend: Next.js + TypeScript on Vercel; new routes `/blog` and `/blog/[slug]`, nav item Blog, link back to CV.
- Independent backend: Node.js 22 + TypeScript + GraphQL Yoga, endpoint `/graphql`.
- Persistence: MongoDB Atlas, `posts` collection; no database account or credentials created yet.
- Deploy backend separately from Vercel frontend; hosting provider TBD, chosen before first public release.
- Contentful continues to serve the existing portfolio; MongoDB only serves the blog.

## Data model (phase 1)
`Post`: `_id`, `title`, unique `slug`, `excerpt`, `contentMarkdown`, `category` enum, `tags`, `status` (`draft`/`published`), `publishedAt` nullable Date. Indexes: unique slug; status/category/date. Public GraphQL resolvers return only published posts whose date is not in the future. Results ordered newest first, paginated and capped at 50. The public `Post` type exposes ISO dates and never exposes internal status.

## API contract (phase 1)
`posts(category: Category, limit: Int = 20, offset: Int = 0): [Post!]!`
`post(slug: String!): Post`
`Category = CODE | JAPANESE | CATS | COOKING`
No mutation in phase 1. Seed script inserts two placeholder posts idempotently. GraphQL endpoint CORS allow-list configured via environment variable. Secrets must remain server-side.

## Milestones / acceptance
**1. Backend local:** repository, documentation, typed GraphQL API, MongoDB connection, seed script, tests and GitHub Actions. Verify a query returns two demo posts from a configured database. **Blocked only on database setup.**

**2. Backend live:** deploy independent API, restrict CORS and database access, verify GraphQL responses, avoid exposing credentials. Hosting choice TBD.

**3. Frontend live:** preserve portfolio; add Blog nav, listing, detail routes, category filters, back-to-CV navigation, Japanese fonts and furigana. Verify mobile and desktop, SEO metadata, and safe Markdown rendering. Blog URL on existing domain.

**4. Editor:** authenticated admin (only site owner), Markdown + preview (fastest), drafts, publish/edit; GraphQL mutations protected on backend. Authentication architecture TBD; do not trust client-supplied identity.

**5. Comments:** Google/GitHub sign-in, backend verified identity, comments initially `pending`, moderation dashboard, only `approved` visible; spam/rate limiting and privacy notice before enabling.

**6. Experiments:** cat sightings or lost-cat aggregation only where lawful/public API access exists; Japanese study tools; possible Python/FastAPI service later.

## Not in first release
Admin editor, OAuth, comments, Python, notifications, full-text search, image uploads, public mutations, migration of existing Contentful content.

## Risks / future decisions
Hosting free-tier availability, MongoDB Atlas account/network access, secret management, authentication strategy, comment privacy and abuse, rich Markdown and ruby rendering, and caching/revalidation on Next.js. Document decisions rather than prematurely implementing.
