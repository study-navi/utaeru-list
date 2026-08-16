# Utaeru API Worker

Cloudflare Worker backend for [Utaeru](https://github.com/study-navi/utaeru-list) — public song-list publishing, Google sign-in, and streamer ID claims.

Deployed at: `https://utaeru-api.<your-subdomain>.workers.dev`

## Prerequisites

- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) (`npm i -g wrangler` or use `npx wrangler`)
- Cloudflare account with access to D1 database `utaeru-db`

## Setup

```bash
cd worker
wrangler login
```

Apply the D1 schema (creates `users` and `streamer_owners`; `streamers` already exists in production):

```bash
wrangler d1 execute utaeru-db --remote --file=schema.sql
```

For local development:

```bash
wrangler d1 execute utaeru-db --local --file=schema.sql
```

## Secrets

**Never commit secrets to git.** Set them via Wrangler:

```bash
wrangler secret put SESSION_SECRET
wrangler secret put DEV_WRITE_TOKEN
wrangler secret put GOOGLE_CLIENT_ID
```

| Secret | Purpose |
|---|---|
| `SESSION_SECRET` | HMAC key for signing session JWT cookies |
| `DEV_WRITE_TOKEN` | Optional dev write bypass via `X-Utaeru-Dev-Token` header |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for ID token verification |

`ALLOWED_ORIGIN` is configured in `wrangler.toml` (not a secret).

## Deploy

```bash
cd worker
wrangler deploy
```

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/public/{streamerId}` | None | Fetch public streamer data |
| `PUT` | `/api/public/{streamerId}` | Session owner or dev token | Upsert public data (2 MB max) |
| `POST` | `/api/auth/google` | None | Verify Google ID token, set session cookie |
| `POST` | `/api/auth/logout` | None | Clear session cookie |
| `GET` | `/api/auth/me` | Session cookie | Return `{ email, ownedStreamerIds }` |
| `POST` | `/api/streamer/{streamerId}/claim` | Session cookie | Claim a streamer ID |

### Session cookie

Cross-site credentialed requests from GitHub Pages require:

```
SameSite=None; Secure; HttpOnly; Path=/; Max-Age=2592000
```

### CORS

Only the origin configured in `ALLOWED_ORIGIN` is reflected. Credentials are enabled; `*` is never used.

### Error responses

JSON shape: `{ "error": "<code>" }`

Common codes: `unauthorized`, `invalid_streamer_id`, `not_found`, `already_claimed`, `forbidden`, `invalid_token`, `invalid_body`, `payload_too_large`

## Local dev

```bash
wrangler dev
```

Set local secrets in `.dev.vars` (gitignored):

```
SESSION_SECRET=local-dev-secret-change-me
DEV_WRITE_TOKEN=local-dev-token
GOOGLE_CLIENT_ID=your-google-client-id
```

## Regression test

From the repo root (against the deployed worker):

```bash
node scripts/test-api-phase4c.mjs

# Include write tests:
DEV_WRITE_TOKEN=... node scripts/test-api-phase4c.mjs
```

## Workers Free compatibility

Uses only Workers runtime APIs (Web Crypto, D1, fetch). No paid-only features.
