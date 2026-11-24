# Technical design — personal blog

## Purpose
Add a blog to the existing Next.js portfolio at `www.alexgarulli.org.uk`, preserving its visual style, CV navigation and existing Contentful integration. Build a **separate** Node.js/TypeScript GraphQL backend with MongoDB, publicly visible as a portfolio project.

## Categories and content
Four initial categories: **Code, Japanese, Cats, Cooking**. Articles may mix English and Japanese (kanji, hiragana, katakana) and use furigana via accessible HTML `<ruby>` / `<rt>`. Content is stored as UTF-8 Markdown; rendering must sanitize or explicitly allow-list any embedded HTML (including ruby) to avoid XSS. Cat stories can concern neighborhood cats, not necessarily owned pets. Cosplay/costume work can be covered within Japanese initially.

## Architecture
- Existing frontend: Next.js + TypeScript on Vercel; new routes `/blog` and `/blog/[slug]`, nav item Blog, link back to CV.
- Independent backend: Node.js 22 + TypeScript + GraphQL Yoga, endpoint `/graphql`.
- Persistence: MongoDB Atlas M0 cluster `alex-blog`, database `alex_blog`, collection `posts`. Credentials stay outside the repository.
- Deploy backend separately from the Vercel frontend on a Render Free web service (Frankfurt), defined in `render.yaml`. The service is not created until the blueprint is applied. See [deployment](DEPLOYMENT.md).
- Contentful continues to serve the existing portfolio; MongoDB only serves the blog.

## Data model (phase 1)
`Post`: `_id`, `title`, unique `slug`, `excerpt`, `contentMarkdown`, `category` enum, `tags`, `status` (`draft`/`published`), `publishedAt` nullable Date. Indexes: unique slug; status/category/date. Public GraphQL resolvers return only published posts whose date is not in the future. Results ordered newest first, paginated and capped at 50. The public `Post` type exposes ISO dates and never exposes internal status.

## API contract (phase 1)
`posts(category: Category, limit: Int = 20, offset: Int = 0): [Post!]!`
`post(slug: String!): Post`
`Category = CODE | JAPANESE | CATS | COOKING`
No mutation in phase 1. Seed script inserts two placeholder posts idempotently. GraphQL endpoint CORS allow-list configured via environment variable. Secrets must remain server-side.

## Milestones / acceptance
**1. Backend local:** repository, documentation, typed GraphQL API, MongoDB connection, seed script, tests and GitHub Actions. A query returns two demo posts from `alex_blog`.

**2. Backend live:** Render Free service, `GET /health`, CORS allow-list, and a public `/graphql` response, with credentials kept in the host dashboard. Blueprint is in the repo. Still to do, with approval: apply it, set `MONGODB_URI`, and choose Atlas network access. Free-tier sleep is documented in [deployment](DEPLOYMENT.md).

**3. Frontend live:** preserve portfolio; add Blog nav, listing, detail routes, category filters, back-to-CV navigation, Japanese fonts and furigana. Verify mobile and desktop, SEO metadata, and safe Markdown rendering. Blog URL on existing domain.

**4. Editor:** authenticated admin (only site owner), Markdown + preview (fastest), drafts, publish/edit; GraphQL mutations protected on backend. Authentication architecture TBD; do not trust client-supplied identity.

**5. Comments:** Google/GitHub sign-in, backend verified identity, comments initially `pending`, moderation dashboard, only `approved` visible; spam/rate limiting and privacy notice before enabling.

**6. Experiments:** cat sightings or lost-cat aggregation only where lawful/public API access exists; Japanese study tools; possible Python/FastAPI service later.

## Not in first release
Admin editor, OAuth, comments, Python, notifications, full-text search, image uploads, public mutations, migration of existing Contentful content.

## Risks / future decisions
Render Free spin-down (about one minute to wake) versus a later $7 always-on instance before Next.js server-renders `/blog`. Atlas M0 has no private link, and Render Free has no static outbound IP, so network access is either a password-protected `0.0.0.0/0` entry or a paid static egress address. Secret management stays in the Render dashboard. Authentication strategy, comment privacy and abuse, rich Markdown and ruby rendering, and caching/revalidation on Next.js remain open. Document decisions rather than prematurely implementing.
