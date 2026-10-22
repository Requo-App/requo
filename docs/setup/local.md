# Requo Local Setup

Requo supports two development setups. Both run the same code — only the
values in `.env.local` differ:

1. **Cloud Supabase (default)** — point env values at a hosted Supabase
   project, then `npm run dev`. No Docker required.
2. **Full local (Docker)** — the Supabase CLI stack (database, storage,
   realtime, Studio) plus `docker compose` for the app and Inngest. Fully
   offline.

## Prerequisites

- Node.js 22 or newer and npm
- Cloud Supabase: a Supabase project
- Full local: a container runtime (Docker Desktop with WSL integration on
  Windows, Docker Engine on Linux); `docker ps` must work from your shell

## Mode 1: Cloud Supabase

```bash
cp .env.example .env.local
npm install
npm run db:migrate   # first run, or after pulling new migrations
npm run dev          # app + Inngest Dev Server
```

Fill `.env.local` with at least:

- `DATABASE_URL` and `DATABASE_MIGRATION_URL` from the Supabase project
  (pooler host; see [Supabase](#supabase) below for how to get them)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`

Notes:

- This talks to the real project — reads and writes are real. The demo seeder
  (`npm run db:seed`) refuses non-local databases, so demo data is a
  full-local step only.
- Storage uploads (logos, avatars, inquiry attachments, knowledge files) need
  the real project. Leave email, AI, and billing keys blank to skip those
  flows locally.
- The dashboard notification bell refreshes on tab focus and every ~45s.
  Live push additionally needs a hosted project configured with the
  `supabase_realtime` publication and RLS policies for the bell tables; the
  committed migrations deliberately leave RLS deny-all.
- `npm run dev:tunnel` adds an ngrok tunnel when testing inbound callbacks or
  webhooks (for example Polar webhooks).

## Mode 2: Full local (Docker)

Why full local: `next dev` does not prefetch, so every click pays a network
round trip per query against a remote pooler. A local database removes that
cost and gives you storage and realtime without touching a hosted project.

Start the Supabase CLI stack (first run pulls images):

```bash
npx supabase start    # prints URLs and keys
npx supabase status   # re-print URLs and keys at any time
npx supabase stop     # stop; database volumes are kept
```

Point `.env.local` at the local stack (defaults):

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_MIGRATION_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from status>
SUPABASE_JWT_SECRET=<JWT_SECRET from status>
BETTER_AUTH_SECRET=<generate: openssl rand -hex 32>
BETTER_AUTH_URL=http://localhost:3000
```

Prepare the database and start the app:

```bash
npm install
npm run db:local:setup   # migrations + demo data + local realtime setup
docker compose up --build
```

`db:local:setup` applies pending migrations, resets and re-seeds demo data,
then configures the `supabase_realtime` publication and the subscription
policies the notification bell needs. It refuses non-local hosts and is safe
to re-run (for example after `npm run db:reset`, a fresh `npx supabase start`,
or new migrations).

`docker compose up --build` starts:

- `app` — Next.js dev server with hot reload on http://localhost:3000
- `inngest` — Inngest Dev Server on http://localhost:8288

Inside the app container, Postgres is reached over the Supabase CLI Docker
network by container hostname (`supabase_db_requo:5432`, with
`sslmode=disable`), and browser-facing storage/realtime use
`host.docker.internal:54321`.

Notes:

- Docker Desktop (Windows/macOS) resolves `host.docker.internal`
  automatically. On Linux, add `127.0.0.1 host.docker.internal` to
  `/etc/hosts` once — otherwise the browser cannot connect to realtime (and
  the bell falls back to polling).
- Rebuild the app image after dependency changes (`docker compose up
  --build`); code edits hot-reload without a rebuild.
- Bind mounts use polling for hot reload (`WATCHPACK_POLLING` is set in
  `docker-compose.yml`).

### Local ports

| Port | Service |
| --- | --- |
| 3000 | Requo (compose `app`) |
| 8288 | Inngest Dev Server (compose `inngest`) |
| 54321 | Supabase API gateway — storage + realtime |
| 54322 | Postgres (direct connection for the app and migrations) |
| 54323 | Supabase Studio — `http://127.0.0.1:54323` |
| 54324 | Email catcher for the Supabase stack's own auth emails |

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the values you want to use.
Command-line environment variables always win over file values.

Minimum requirements:

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

Optional but commonly needed:

- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `APP_TOKEN_HASH_SECRET`
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `RESEND_API_KEY`
- `MAILTRAP_API_TOKEN`
- `BREVO_API_KEY`
- `EMAIL_DOMAIN`
- `EMAIL_FROM_DEFAULT`
- `EMAIL_FROM_NOTIFICATIONS`
- `EMAIL_FROM_SYSTEM`
- `EMAIL_FROM_QUOTES`
- `EMAIL_FROM_SUPPORT`
- `RESEND_FROM_EMAIL` (legacy fallback)
- `RESEND_REPLY_TO_EMAIL`
- `GROQ_API_KEY`
- `GEMINI_API_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `NVIDIA_NIM_API_KEY`
- `OPENROUTER_API_KEY`
- Polar variables from `docs/setup/billing.md` when testing checkout or webhooks
- `INNGEST_DEV=1` when running background jobs against the local Inngest Dev Server

Generate Web Push VAPID keys with:

```bash
npx web-push generate-vapid-keys
```

Generate `BETTER_AUTH_SECRET` and similar secrets with:

```bash
openssl rand -hex 32
```

## Provider Expectations

### Better Auth

- Set `BETTER_AUTH_SECRET` to a secret with at least 32 characters.
- Set `BETTER_AUTH_URL` to the exact origin you will open in the browser.
- `NEXT_PUBLIC_BETTER_AUTH_URL` is optional. Keep it aligned with `/api/auth` when you set it.
- If you switch between `localhost` and `127.0.0.1`, update the auth URL to match the browser origin.
- Social sign-in is optional. Set provider credentials only for the providers you want to enable:
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
  - Passwordless email sign-in uses the magic link plugin; configure transactional email (Resend/Mailtrap/Brevo) so sign-in links can be delivered.
- Provider callback URLs use `/api/auth/callback/<provider>`.

### Supabase

- Cloud Supabase: use your Supabase pooler host for both database env vars:
  - `DATABASE_URL` on port `6543`
  - `DATABASE_MIGRATION_URL` on port `5432`
  - Keep the host, username, password, and database the same between those two values. Only the port should change.
  - If the Supabase dashboard only shows you a `6543` pooler string, copy it and change the port to `5432` for `DATABASE_MIGRATION_URL`.
  - Avoid using the direct `db.<project-ref>.supabase.co:5432` string for migrations unless your machine has working IPv6 access or your project has the IPv4 add-on.
  - Where to get it in Supabase:
    1. Open your project dashboard.
    2. Open the `Connect` dialog.
    3. Copy the pooler connection string.
    4. Use that string as `DATABASE_URL`.
    5. Copy it again and change only the port from `6543` to `5432` for `DATABASE_MIGRATION_URL`.
- Full local: use the values printed by `npx supabase status` (see Mode 2).
  Bucket definitions come from migration `0034`; no extra storage setup is
  needed.
- Supabase-backed uploads and asset downloads need a reachable Supabase
  project — the cloud project in Mode 1, or the local stack in Mode 2.
- The repo validates Supabase envs even when you are not actively using upload flows.
- Local builds and tests can use placeholder Supabase values when you are not exercising storage-backed functionality.
- Realtime dashboard notifications need `SUPABASE_JWT_SECRET` from the Supabase project API settings. Without it, the bell still renders server data but will not live-update. In Mode 2, `npm run db:local:setup` enables live push; in Mode 1 the bell falls back to polling unless the hosted project is configured with the realtime publication and policies.

Example (cloud):

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:6543/postgres
DATABASE_MIGRATION_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:5432/postgres
```

### Email Delivery

- Fallback order is Resend, then Mailtrap, then Brevo.
- Leave all email API keys blank if you do not need live email locally.
- Set `EMAIL_DOMAIN=test.requo.app` or your verified sending domain.
- Configure branded senders with `EMAIL_FROM_DEFAULT`, `EMAIL_FROM_NOTIFICATIONS`, `EMAIL_FROM_SYSTEM`, `EMAIL_FROM_QUOTES`, and `EMAIL_FROM_SUPPORT`.
- Do not use consumer mailbox domains such as `gmail.com`, `outlook.com`, `hotmail.com`, `yahoo.com`, or `icloud.com` for senders.
- Keep your normal inbox in `RESEND_REPLY_TO_EMAIL` if you want customer replies to go there.
- Verify the sending domain in every provider you enable: Resend, Mailtrap, and Brevo.
- DNS setup is outside the app. Expect SPF, DKIM, and DMARC records from each provider before production sending.
- Password reset and inquiry notification emails are skipped when no email provider is configured.
- Quote sending intentionally returns an error when no email provider is configured, because the action is explicit and user-facing.
- The local Supabase stack's email catcher (port `54324`) only receives emails
  sent by the stack's own auth service. Requo's transactional email goes
  through the API providers above, so leave their keys blank locally unless
  you want real sends.

### AI Providers

- The router registers free-tier-first providers in this order: Groq, Gemini, Cloudflare Workers AI, NVIDIA NIM, then OpenRouter. Each routing profile defines the model order for its kind of work.
- Leave AI provider keys blank if you do not need live AI locally.
- Configure at least one provider to test AI-assisted inquiry replies or drafting.
- The inquiry assistant returns a configuration-related error when no AI provider is configured, and a quota-exhausted error when every configured free allowance is used up.
- Only models listed in `lib/ai/catalog.ts` are routable. See `docs/setup/ai-provider-limits.md` for the free-tier rules.

## Demo Data

`npm run db:local:setup` (or `npm run db:seed` directly) resets local
application data and creates deterministic sample accounts for Free, Pro, and
Business plans, multiple businesses, services, inquiries, quotes,
follow-ups, notifications, and billing records. Both scripts refuse
non-local databases (`ALLOW_REMOTE_SEED=1` overrides, for disposable remote
dev databases only).

The seed prints the generated account emails and the default password
(`12345678`) when it finishes. The primary account uses `user@email.com`;
additional Free, Pro, and Business accounts are created for plan testing.

- Business name: `BrightSide Print Studio`
- Business slug: `brightside-print-studio`
- Sent quote token: `demoquote1002senttoken`
- Expired quote token: `demoquote1005expiredtoken`
- Voided quote token: `demoquote1006voidedtoken`

The seed supports overriding these values through the `DEMO_*` env variables in `.env.local`.

## Windows Dev Performance

**Defender real-time scanning.** Every chunk Turbopack writes into `.next`, and
every file npm rewrites in `node_modules`, is scanned as it lands. Excluding
those paths is the first Windows recommendation in the bundled Next.js guide
(`node_modules/next/dist/docs/01-app/02-guides/local-development.md`). Run from
an **elevated** PowerShell prompt:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\dev-defender-exclusions.ps1
```

The script excludes the repo root (which covers `.next` and `node_modules`) and
the npm cache, plus `node.exe` as a process exclusion. Reverse it with `-Remove`.
Read the trade-off in the script header first: an excluded path is no longer
scanned in real time, and `node_modules` is exactly where a malicious
postinstall script would land. It is a reasonable trade for a repo you trust on
a machine you control, and a poor default anywhere else.

**Memory headroom.** `npm run dev:app` sets `--max-old-space-size=4096`. Raising
that on a 16 GB machine is counterproductive: Node defers garbage collection
until it approaches the ceiling, so a ceiling above available physical memory
pushes the heap into the pagefile instead of collecting it. If dev feels slow
and the commit charge exceeds physical RAM, close browser and editor windows
before raising the ceiling.

## Verification

Run the repo health checks:

```bash
npm run check
npm run test
npm run test:integration
npm run build
npm run test:e2e:smoke
```

## Notes for Local Testing

- The Playwright suite starts its own local server, sets `BETTER_AUTH_URL` to `127.0.0.1`, and disables live email and AI provider calls.
- The E2E suite uses the seeded demo business and fixed public quote tokens.
- The current automated suite does not cover live storage uploads, live email delivery, or live AI generation.
- If port `3000` is already occupied, run Playwright with another port, for example `$env:PORT='3100'; npm run test:e2e:smoke` in PowerShell.

### Canonical Dashboard Routes

Use one canonical route set in docs and tests:

- Business home: `/<slug>/home` (or `/<slug>` redirects here)
- Inquiries: `/<slug>/inquiries`
- Quotes: `/<slug>/quotes`
- Services: `/<slug>/services`
- Members: `/<slug>/settings/members`
- Settings hub: `/<slug>/settings`
- Settings sections:
  - General: `/<slug>/settings/general`
  - Profile: `/<slug>/settings/profile`
  - Quote defaults: `/<slug>/settings/quote`
  - Quote library: `/<slug>/quote-library`
  - Assistant and knowledge: `/<slug>/settings/ai`
  - Billing: `/<slug>/settings/billing`

### Product Notes

- Onboarding starts with one guided starter template and keeps everything editable later.
- The current starter templates are:
  - `Agency / Studio`
  - `Consultant / Professional Services`
  - `Contractor / Home Service`
  - `General Service Business`
- Public inquiry pages can include supporting cards, optional showcase images, and editable intro copy.

The quote library and members are main dashboard destinations. Do not document the removed settings pricing or settings members routes.
