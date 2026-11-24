# Architecture decision log

- **2026-11-23 — Two independent apps:** retain existing Next.js portfolio; create a separate Node backend/repository. Reason: learn backend architecture and keep deployments independent.
- **2026-11-23 — GraphQL instead of REST:** user preference; backend learning includes schema and resolvers. Yoga is an initial lightweight choice, not a claim that other servers are unsuitable.
- **2026-11-23 — MongoDB instead of PostgreSQL:** explicit requirement; use official MongoDB Node driver to minimize layers.
- **2026-11-23 — Fastest public path:** seed two posts before building an editor; public API is read-only until authentication exists.
- **2026-11-23 — Markdown for editor phase:** lowest implementation overhead; exact editor component postponed.
- **2026-11-24 — Render Free web service:** first public host for the GraphQL API. Native Node, GitHub deploy, no card, and outbound TCP to Atlas. The service sleeps after 15 idle minutes; the always-on plan is $7/month and is not enabled. Region Frankfurt, because the site is in the UK and a Render region cannot be changed later. Fly.io has no ongoing free tier for new accounts, and Railway’s free credit will not keep a process up.
- **Open:** whether Atlas may allow `0.0.0.0/0` for this free host (the URI remains the secret) or deployment waits for paid static egress IPs. Authentication provider. Whether to pay for an always-on instance before `/blog` server-renders the API.
