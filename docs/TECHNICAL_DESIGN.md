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
`Post`: `_id`, `title`, unique `slug`, `excerpt`, `contentMarkdown`, `category` enum, `tags`, `status` (`draft`/`published`), `publishedAt` nullable Date, optional `coverImageUrl`. Indexes: unique slug; status/category/date. Public GraphQL resolvers return only published posts whose date is not in the future. Results ordered newest first, paginated and capped at 50. The public `Post` type exposes ISO dates and never exposes internal status. A missing cover is `null`.

## API contract (phase 1)
`posts(category: Category, limit: Int = 20, offset: Int = 0): [Post!]!`
`post(slug: String!): Post`
`Category = CODE | JAPANESE | CATS | COOKING`
No mutation in phase 1. Seed script inserts two placeholder posts idempotently. GraphQL endpoint CORS allow-list configured via environment variable. Secrets must remain server-side.

## Editor API (phase 2)
The public queries and the public `Post` type stay as specified above. Drafts remain invisible to them. Stored documents keep the same fields, ids, and slug index. New writes still use `status: "draft" | "published"` and a nullable `publishedAt`. Nothing in this phase rewrites posts that are already stored.

Authenticated operations, executed only with a valid editor token:

- `editorPosts(status: PostStatus, limit: Int = 20, offset: Int = 0): [EditorPost!]!`
- `editorPost(id: ID!): EditorPost`
- `createPost(input: PostInput!): EditorPost!` inserts a draft with `publishedAt: null`
- `updatePost(id: ID!, input: PostInput!): EditorPost!` changes title, slug, excerpt, Markdown, category, tags, and the optional cover URL. It does not change `_id`, `status`, or `publishedAt`. Omitting `tags` keeps the current tags. Omitting `coverImageUrl` keeps the current cover; `null` clears it.
- `publishPost(id: ID!): EditorPost!` sets `published`. The first publish sets `publishedAt` to the current time. A later publish keeps the original timestamp.
- `unpublishPost(id: ID!): EditorPost!` sets `draft` and leaves `publishedAt` and the body untouched, so the public filters hide it.

`EditorPost` adds `status` (`DRAFT` or `PUBLISHED`) and a nullable `publishedAt`. `PostInput` requires title (max 160), slug (lowercase hyphenated, max 80, unique), excerpt (max 300), Markdown (max 100000), and category. Tags are optional, deduplicated, and capped at 20. Invalid input returns `BAD_USER_INPUT`. A duplicate slug returns that same code and does not replace the other post.

### Cover image
`coverImageUrl` is optional on public `Post`, `EditorPost`, and `PostInput`. Documents written before the field existed stay unchanged, and every query returns `null` when it is absent. No database migration runs.

The value must be an `https` URL of at most 2048 characters, with no username or password. A Cloudinary delivery URL is accepted when the host is `res.cloudinary.com` and the path contains `/image/upload/`, `/image/fetch/`, `/image/private/`, or `/image/authenticated/`. Any other URL must use `https` and end in `avif`, `gif`, `jpg`, `jpeg`, `png`, `svg`, or `webp`. `http`, `data`, `javascript`, and other protocols are rejected. This API does not receive file uploads. The Next.js app uploads to Cloudinary and sends back the delivery URL.

### Authentication
GitHub OAuth runs only in the Next.js app. This API never redirects to GitHub and never accepts a GitHub access token. The browser must not send `EDITOR_AUTH_SECRET`, and it must not call these mutations itself.

After the portfolio server has completed GitHub sign-in, it reads the numeric user id from that session. It must ignore any id, login, or email submitted by the browser. It then signs an HS256 JWT with `EDITOR_AUTH_SECRET` and calls `POST /graphql` from the server:

- header `{"alg":"HS256","typ":"JWT"}`
- payload `sub` (numeric id as a string), `iat`, `exp`
- `exp - iat` must be greater than 0 and at most 300 seconds
- `Authorization: Bearer <token>`

The API checks the HMAC, the lifetime, and that `sub` is one of the comma-separated numeric ids in `ADMIN_GITHUB_IDS`. Logins in that list are ignored. A missing header is anonymous. A bad token is `UNAUTHENTICATED`. A valid token for any other GitHub id is `FORBIDDEN`. If either variable is unset, editor operations fail with `UNAUTHENTICATED` and the public queries continue to work.

```js
import { createHmac } from 'node:crypto';
const iat = Math.floor(Date.now() / 1000);
const exp = iat + 300;
const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
const payload = Buffer.from(JSON.stringify({ sub: githubUserId, iat, exp })).toString('base64url');
const data = `${header}.${payload}`;
const signature = createHmac('sha256', process.env.EDITOR_AUTH_SECRET).update(data).digest('base64url');
const token = `${data}.${signature}`;
```

`githubUserId` is `String(session.user.id)` from the verified GitHub profile, not `profile.login`. The same `EDITOR_AUTH_SECRET` (at least 32 characters) lives on Render and on the Next.js server. `ADMIN_GITHUB_IDS` lives only on Render. The GitHub OAuth client id and secret live only on the Next.js host. None of these values are committed.

## Milestones / acceptance
**1. Backend local:** repository, documentation, typed GraphQL API, MongoDB connection, seed script, tests and GitHub Actions. A query returns two demo posts from `alex_blog`.

**2. Backend live:** Render Free service, `GET /health`, CORS allow-list, and a public `/graphql` response. Credentials stay in the host dashboard. Free-tier sleep is documented in [deployment](DEPLOYMENT.md).

**3. Frontend live:** preserve portfolio; add Blog nav, listing, detail routes, category filters, back-to-CV navigation, Japanese fonts and furigana. Verify mobile and desktop, SEO metadata, and safe Markdown rendering. Blog URL on existing domain.

**4. Editor:** API mutations and draft queries are protected by the server-signed token above. Posts may store an optional cover URL. Still to build in the portfolio: GitHub sign-in, `/admin/blog` with Markdown editing, and the Cloudinary upload that produces `coverImageUrl`. The API does not render Markdown and does not upload images.

**5. Comments:** Google/GitHub sign-in, backend verified identity, comments initially `pending`, moderation dashboard, only `approved` visible; spam/rate limiting and privacy notice before enabling.

**6. Experiments:** cat sightings or lost-cat aggregation only where lawful/public API access exists; Japanese study tools; possible Python/FastAPI service later.

## Not in first release
Portfolio admin UI, comments, Python, notifications, full-text search, image uploads, anonymous mutations, migration of existing Contentful content.

## Risks / future decisions
Render Free spin-down (about one minute to wake) versus a later $7 always-on instance before Next.js server-renders `/blog`. Atlas M0 has no private link, and Render Free has no static outbound IP, so network access is either a password-protected `0.0.0.0/0` entry or a paid static egress address. Editor and database secrets stay in the host dashboards. The portfolio still has to verify the GitHub session before it signs a token. Comment privacy and abuse, rich Markdown and ruby rendering, and caching/revalidation on Next.js remain open.
