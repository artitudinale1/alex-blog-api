# Architecture decision log

- **2026-11-23 — Two independent apps:** retain existing Next.js portfolio; create a separate Node backend/repository. Reason: learn backend architecture and keep deployments independent.
- **2026-11-23 — GraphQL instead of REST:** user preference; backend learning includes schema and resolvers. Yoga is an initial lightweight choice, not a claim that other servers are unsuitable.
- **2026-11-23 — MongoDB instead of PostgreSQL:** explicit requirement; use official MongoDB Node driver to minimize layers.
- **2026-11-23 — Fastest public path:** seed two posts before building an editor; public API is read-only until authentication exists.
- **2026-11-23 — Markdown for editor phase:** lowest implementation overhead; exact editor component postponed.
- **Open:** backend hosting provider, authentication provider and deployment configuration.
