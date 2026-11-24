# Deployment

The API is prepared for a [Render](https://render.com) **Free** web service. Nothing in this repository creates that service, spends money, or stores the MongoDB connection string. Create the service only after the choices in [Before the first deploy](#before-the-first-deploy) are confirmed.

## Why Render

The process is a normal Node.js server that opens a MongoDB driver connection and listens for HTTP. It needs a host that can run that process and make outbound TCP connections to Atlas.

Render’s Free web service is the fastest fit that stays at $0:

- Native Node.js 22, deploy from GitHub, TLS included, no credit card.
- 750 Free instance hours per workspace each month. One service fits in that allowance. Hours are consumed only while the instance is awake.
- `PORT` is injected by Render. `npm start` runs `node dist/server.js`, which binds `0.0.0.0` and that port.
- A health check can call `GET /health` without touching GraphQL or the database.

The Free plan spins the service down after 15 minutes without an inbound request. The next request waits about a minute while it starts, and Render shows a loading page to browsers during that wake. Render may also restart Free instances. That is acceptable for proving a public GraphQL URL. It is a poor fit for a Next.js server render that must finish in a few seconds.

Fly.io does not offer a continuing free allowance for new accounts. Railway’s ongoing free credit is about $1 per month, which will not keep a service awake. A Render instance that never sleeps starts at $7 per month. Do not switch `plan: free` in `render.yaml` until that spend is approved. Syncing the blueprint later would otherwise recreate the plan named in the file.

Region is **Frankfurt**, the Render region closest to the UK site. A service’s region cannot be changed after it is created. Say so before the blueprint is applied if the Atlas cluster is somewhere else and you want the API beside it.

## What the service runs

| Setting | Value |
| --- | --- |
| Build | `npm ci --include=dev && npm run build` |
| Start | `npm start` |
| Health | `GET /health` → `{"status":"ok"}` |
| GraphQL | `POST /graphql` (GraphiQL is off when `NODE_ENV=production`) |
| Database | `MONGODB_URI` from the Render dashboard, database name `alex_blog` |
| CORS | `https://www.alexgarulli.org.uk`, `https://alexgarulli.org.uk`, `http://localhost:3000` |
| Editor secret | `EDITOR_AUTH_SECRET` in the Render dashboard and on the Next.js server. Public reads do not need it. |
| Editor allow-list | `ADMIN_GITHUB_IDS` in the Render dashboard: numeric GitHub ids, not logins. |

`NODE_ENV=production` is set for the running service. The build still installs devDependencies, because `tsc` is one of them. `--include=dev` is what makes that succeed.

`/health` only proves the process is listening. The process refuses to listen at all when MongoDB is unreachable, so a failed Atlas connection fails the deploy instead of serving an empty API. The check does not print configuration or connection details.

Browser calls from the portfolio are limited to `CORS_ORIGINS`. Server-side fetches, including a future Next.js server render and `curl`, do not send a browser `Origin` and are not blocked by that list. Production boot fails closed when `CORS_ORIGINS` is empty. Add a Vercel preview origin in the Render dashboard when a preview deployment needs browser access. Do not use `*`.

Startup still creates the existing indexes. The database user therefore needs write access to `alex_blog`, not only `find`. Keep using a dedicated user scoped to that database. Do not use an Atlas admin user for the API.

Seed the database from a trusted machine with `npm run seed`. Do not add a Render deploy hook for seeding. The two demo posts are already loaded, and the seed script depends on dev tooling.

## Before the first deploy

1. Confirm Frankfurt as the region, or name a different Render region so `render.yaml` can be changed first.
2. Choose how Atlas will accept traffic from Render. Do this before the first deploy. If Atlas rejects the connection, the process exits and Render never sees `/health`.
3. Confirm the CORS origins above. `localhost` is there so a local Next.js app can call the public API from a browser.

### MongoDB network access

Render Free web services do not have a stable outbound IP address. A paid static-IP add-on would be required to allowlist Render specifically. Atlas M0 cannot use private networking. That leaves two practical choices:

**Allow access from anywhere (`0.0.0.0/0`), protected by the database user.** Atlas still requires the username and password in `MONGODB_URI`. A person who does not have that URI cannot authenticate. A person who does can connect from any network, not only from Render. Use a long random password, a user limited to `alex_blog`, and rotate the password if the URI is ever exposed. This is the usual free-host setup. It is a real widening of the network perimeter. Do not turn it on until that tradeoff is accepted.

**Keep the current IP allowlist and do not deploy yet.** The API can stay local until a paid static egress address exists and those addresses are the only Atlas entries. That option spends money, so it needs a separate approval.

Never commit `.env`, `MONGODB_URI`, or an Atlas password. `.gitignore` already excludes `.env` and `.env.*` except `.env.example`.

## Create the Render service

After this change is on `main` and the Atlas choice above is done:

1. In the Render dashboard, create a new **Blueprint** and select `artitudinale1/alex-blog-api`.
2. Render reads `render.yaml`. Leave the plan on **Free**.
3. When asked for `MONGODB_URI`, paste the Atlas connection string for the `alex_blog` user. Render stores it as a secret. It is not written back to Git.
4. Deploy. The first boot connects to Atlas, ensures indexes, then listens.
5. The service URL looks like `https://alex-blog-api.onrender.com`. The exact subdomain is shown in the dashboard.

Merging the pull request does not create the Render service. Render deploys later pushes to `main` only after the blueprint exists.

## Verify

Wait until the deploy is live. The first request after an idle period can take about a minute.

```bash
curl -fsS https://alex-blog-api.onrender.com/health
curl -fsS https://alex-blog-api.onrender.com/graphql \
  -H 'content-type: application/json' \
  -d '{"query":"{ posts(limit: 2) { title slug } }"}'
```

Expect `{"status":"ok"}` and the two published demo posts. A browser request from an origin outside `CORS_ORIGINS` must not receive an allow-origin header for that origin.

## Later, for `/blog` on www.alexgarulli.org.uk

A Vercel server function that calls this API will fail when Render is asleep, because the wake takes longer than a typical function timeout. Before building `/blog`, either accept a client-side fetch that can wait for the wake, or approve the $7 always-on Render plan and change `plan` in `render.yaml` on purpose. This document does not turn that plan on.
