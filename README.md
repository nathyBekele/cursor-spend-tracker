# Cursor Spend Tracker

Tracks how much you're actually spending on Claude models used through
Cursor's **BYOK** (bring-your-own Anthropic API key) setup, and shows it in a
small dashboard deployed on Vercel.

## Why this exists

- Cursor's official APIs (Cloud Agents API / TypeScript SDK) only report
  token usage for **Cloud Agents** you create through that API — not your
  regular IDE chat/Composer/Tab usage.
- Cursor's Team/Enterprise Admin API has proper usage/cost endpoints, but
  that's gated behind a paid Team plan.
- For an individual account, the only place this data exists is the personal
  usage dashboard at `cursor.com/dashboard/usage`. This app pulls the same
  data that page shows, using the same (undocumented) endpoint your browser
  calls, and persists it to Postgres so you get real history and charts
  instead of Cursor's own rolling window.

**This relies on an undocumented Cursor endpoint.** It could change without
notice. Every raw API response is stored in the `raw` JSON column so nothing
is lost even if Cursor changes field names — see "If ingestion breaks" below.

## How it works

1. You copy your `WorkosCursorSessionToken` browser cookie value from an
   active `cursor.com` session into the `/admin` page of this app once.
2. A Vercel Cron job hits `/api/cron/sync` daily (configurable), which calls
   Cursor's internal `get-filtered-usage-events` endpoint with that cookie,
   and upserts every usage event (model, tokens, cost) into Postgres.
3. Cursor already computes a cost-in-cents per event (public list API price,
   applied even to BYOK requests) — we use that directly. If that field is
   ever missing, we fall back to a small hardcoded Anthropic pricing table
   (`src/lib/pricing.ts`) and compute it ourselves from raw token counts.
4. The dashboard (`/`) shows daily spend, spend by model, and totals — split
   into "model cost" (what Anthropic actually charges) vs. "Cursor token fee"
   ($0.25/M tokens Cursor adds on top, even for BYOK).

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind
- Prisma + Neon Postgres
- Recharts for charts
- A single shared admin password gates the whole app (this is a personal
  tool, not multi-tenant)

## Local setup

Requires Node.js **20.9+** (Next.js 16 requirement).

```bash
nvm use   # picks up .nvmrc (20)
npm install
cp .env.example .env.local
# fill in DATABASE_URL / DIRECT_URL (from Neon), ADMIN_PASSWORD, SESSION_SECRET, CRON_SECRET
npm run db:push   # creates tables in your Neon database
npm run dev
```

Open http://localhost:3000, log in with `ADMIN_PASSWORD`, go to `/admin`,
paste your session token (see below), and hit "Sync now".

### Getting your `WorkosCursorSessionToken`

1. Open https://cursor.com/dashboard/usage while logged into Cursor.
2. Open DevTools → Application (Chrome) or Storage (Firefox) → Cookies →
   `https://cursor.com`.
3. Copy the value of the `WorkosCursorSessionToken` cookie.
4. Paste it into the token field on this app's `/admin` page.

This is a session cookie, so it will eventually expire (exact lifetime isn't
documented). When sync starts failing with an auth error, just repeat the
steps above and paste a fresh value — no redeploy needed.

## Deploying to Vercel

1. Push this repo to GitHub.
2. Create a [Neon](https://neon.tech) project, grab the pooled `DATABASE_URL`
   and the direct `DIRECT_URL` connection strings.
3. Import the repo in Vercel, set the environment variables from
   `.env.example` (`DATABASE_URL`, `DIRECT_URL`, `ADMIN_PASSWORD`,
   `SESSION_SECRET`, `CRON_SECRET`) in Project Settings → Environment
   Variables.
4. Deploy. Run `npx prisma db push` once (locally, pointed at the Neon URL,
   or via a one-off Vercel deployment build step) to create tables.
5. Vercel Cron (configured in `vercel.json`) will hit `/api/cron/sync` daily
   at 06:00 UTC automatically once deployed to production.
   - **Hobby plan**: cron jobs are limited to once per day — the default
     schedule already respects that.
   - **Pro plan**: you can tighten `vercel.json`'s schedule (e.g. hourly,
     `"0 * * * *"`) for fresher data.
6. Visit your deployment, log in, and paste your session token in `/admin`
   just like local setup.

## If ingestion breaks

Cursor's dashboard endpoints aren't documented or versioned, so field names
could change. If `/admin` shows sync errors that aren't auth-related:

1. Open `cursor.com/dashboard/usage` in a browser, open DevTools → Network,
   reload, and inspect the `get-filtered-usage-events` and `usage-summary`
   requests/responses.
2. Compare the response shape to `mapRawEvent()` in
   `src/lib/cursorClient.ts` and adjust the field lookups (`pick(...)` calls)
   to match.
3. Nothing is lost in the meantime — every event's untouched raw payload is
   kept in `UsageEvent.raw`, so you can backfill/reprocess after fixing the
   mapping.

## Project structure

```
src/
  app/
    page.tsx                 dashboard (charts + totals)
    login/page.tsx           password gate
    admin/page.tsx           token management + manual sync trigger
    api/
      admin/login/route.ts   sets the admin session cookie
      admin/logout/route.ts
      admin/token/route.ts   get/set the Cursor session token + sync status
      admin/sync/route.ts    manually trigger a sync
      cron/sync/route.ts     Vercel Cron entrypoint (CRON_SECRET protected)
      summary/route.ts       aggregated data for the dashboard
  lib/
    cursorClient.ts          calls to Cursor's undocumented usage API
    pricing.ts                fallback Anthropic pricing table
    sync.ts                  sync orchestration + settings persistence
    auth.ts                  admin password + signed session cookie
    db.ts                    Prisma client
  proxy.ts                   auth gate for all routes except /login, cron
prisma/schema.prisma         Setting + UsageEvent tables
vercel.json                  cron schedule
```
