# Requo Local Setup

## Prerequisites

- Node.js 22 or newer
- npm
- PostgreSQL
- A `.env` file copied from `.env.example`

## One-command Docker setup

```bash
cp .env.example .env.local
npx supabase start   # one-time: local Postgres, Storage, realtime
npm run db:migrate
npm run db:seed
docker compose up --build
```

This starts `app` (Next.js dev server with hot reload on
http://localhost:3000) and `inngest` (Dev Server on http://localhost:8288),
both wired to the Supabase local stack. The `db` service (standalone
Postgres on `:5432`) is for setups that do not use the Supabase stack.

Notes:

- Rebuild the `app` image after dependency changes (`docker compose up
  --build`); code edits hot-reload without a rebuild.
- Inside containers, Postgres is reached by container hostname over the
  `supabase_network_<project>` network with `?sslmode=disable` (honored by
  the dev health check); browsers on Docker Desktop resolve
  `host.docker.internal` for Supabase Storage/realtime.
- The native flow below stays supported; use it when you want the dev
  server, Inngest, or ngrok running as host processes instead.

## Environment Setup

Copy `.env.example` to `.env.local` and fill in the values you want to use locally.

Minimum local requirements:

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
- `CEREBRAS_API_KEY`
- `GEMINI_API_KEY`
- `MISTRAL_API_KEY`
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

- Supabase-backed uploads and asset downloads need a real Supabase project.
- The repo validates Supabase envs even when you are not actively using upload flows.
- Local builds and tests can use placeholder Supabase values when you are not exercising storage-backed functionality.
- Knowledge uploads, inquiry attachments, business logos, and profile avatars need a real Supabase project and valid service-role credentials.
- Realtime dashboard notifications need `SUPABASE_JWT_SECRET` from the Supabase project API settings. Without it, the bell still renders server data but will not live-update.
- Use your Supabase pooler host for both database env vars:
  - `DATABASE_URL` on port `6543`
  - `DATABASE_MIGRATION_URL` on port `5432`
- Keep the host, username, password, and database the same between those two values. Only the port should change.
- If the Supabase dashboard only shows you a `6543` pooler string, copy it and change the port to `5432` for `DATABASE_MIGRATION_URL`.
- Avoid using the direct `db.<project-ref>.supabase.co:5432` string for migrations unless your machine has working IPv6 access or your project has the IPv4 add-on.

Example:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:6543/postgres
DATABASE_MIGRATION_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:5432/postgres
```

Where to get it in Supabase:

1. Open your project dashboard.
2. Open the `Connect` dialog.
3. Copy the pooler connection string.
4. Use that string as `DATABASE_URL`.
5. Copy it again and change only the port from `6543` to `5432` for `DATABASE_MIGRATION_URL`.

### Local Postgres (fastest dev loop)

`next dev` does no prefetching, so every click renders live on the server. With
`DATABASE_URL` pointed at a remote pooler, each query in that render pays the
full network round trip. Measured against the `ap-south-1` Supabase pooler from
a machine in the Philippines:

| Measurement | Result |
| --- | --- |
| Warm `select 1` round trip | 108 ms median |
| Cold connect | ~1.7 s |
| Six sequential queries | 613 ms |
| `/api/auth/sign-in/email` (dev trace) | 1592 ms median |
| `/<slug>/home` render (dev trace) | 2682 ms median, 28 renders |

Those `handle-request` and `render-path` numbers come from `.next/dev/trace`,
which Next writes automatically during `next dev`. The home route never gets
faster with repetition, which is what separates this from a compile cost.

Production does not have the problem: it prefetches route payloads and honors
`experimental.staleTimes`, so the same queries are not on the interaction path.
That asymmetry is why the app can feel fine when built and slow in dev.

Point the database envs at a local Postgres instead:

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/requo
DATABASE_MIGRATION_URL=postgresql://postgres:postgres@127.0.0.1:5432/requo
```

Getting a Postgres to point at, if you do not have one yet:

- **Native install (recommended on this machine).** `winget install -e --id PostgreSQL.PostgreSQL.17`
  then run the installer's prompts. The server costs roughly 100-200 MB resident.
- **Docker.** `docker run -d --name requo-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 -v requo-pg:/var/lib/postgresql/data postgres:17`
  Tidier to remove later, but Docker Desktop on Windows runs a WSL2 VM that costs
  1-2 GB of RAM. Prefer the native install when memory is already tight.

Then create the database and load fixtures:

```bash
createdb -U postgres requo
npm run db:migrate
npm run db:seed
```

Notes:

- **Keep the Supabase envs pointed at the real project.** Only the database
  moves. Storage (uploads, logos, attachments) and realtime notifications still
  go through Supabase.
- **No extensions are required.** Embeddings are stored as `jsonb`
  (`lib/db/schema/memories.ts`, `lib/db/schema/knowledge-files.ts`), and no
  migration issues `CREATE EXTENSION`, so a vanilla Postgres install is enough.
- **Connection options adapt automatically.** `lib/db/connection-options.ts`
  detects a non-pooler URL and raises the pool to `max: 10` while dropping the
  pooler-specific idle timeout. Nothing to configure.
- **Both env vars use port 5432.** The `6543`/`5432` split exists only for
  Supabase's transaction pooler.
- `npm run db:reset` refuses any host other than `localhost`, `127.0.0.1`, or
  `::1`, so it is safe to use here and cannot touch the Supabase project.
- Local data is separate from the Supabase project. Re-seed rather than
  expecting shared state, and switch `DATABASE_URL` back when you need to read
  real project data.

### Supabase local (full stack: database + realtime + storage)

When the hosted project is unreachable (or you want a fully offline loop),
run Supabase locally via the CLI (`supabase` devDependency, `npx supabase`).
Needs a container runtime: Docker Desktop with WSL integration enabled for
your distro, then `docker ps` must work from this shell.

```bash
npx supabase start    # first run pulls images; prints URLs and keys
npx supabase status   # re-print URLs and keys at any time
npx supabase stop     # stop; database volumes are kept
```

Point the Supabase envs at the local stack (defaults):

```env
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
DATABASE_MIGRATION_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from status>
SUPABASE_JWT_SECRET=<JWT_SECRET from status>
```

Then `npm run db:migrate` (buckets come from migration `0034`) and
`npm run db:seed`. Scripts using bare `dotenv/config` (`db:seed`,
`db:reset` consumers, e2e fixtures) only read `.env`, so keep a copy:
`cp .env.local .env`.

Two local-only steps (never as Drizzle migrations — they must not run on
hosted prod):

- Realtime tables need the `supabase_realtime` publication (Studio SQL
  editor at `http://127.0.0.1:54323`, or any PG client on port `54322`):
  `ALTER PUBLICATION supabase_realtime ADD TABLE
  public.business_notifications, public.business_notification_states,
  public.inquiries;`
- Live row events need one extra local-only step (the Drizzle migrations keep
  default-deny RLS for prod parity, and `business_members` is deny-all too, so
  a plain policy subquery sees nothing). Run once per fresh database:
  `npx tsx scripts/apply-local-realtime-policies.ts` — it adds a
  `SECURITY DEFINER` membership helper plus own-business `SELECT` policies on
  the three bell tables. The script refuses non-local hosts, so hosted prod
  is untouched (the bell's polling fallback still covers prod).

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

### AI Providers

- The AI router tries configured providers in this order: Groq, Cerebras, Gemini, Mistral, Cloudflare Workers AI, NVIDIA NIM, then OpenRouter.
- Leave AI provider keys blank if you do not need live AI locally.
- Configure at least one provider to test AI-assisted inquiry replies or drafting.
- The inquiry assistant returns a configuration-related error when no AI provider is configured.

## Local Bootstrap

### 1. Install dependencies

```bash
npm install
```

### 2. Run database migrations

```bash
npm run db:migrate
```

### 3. Seed demo data

```bash
npm run db:seed
```

The seed prints the generated account emails and the default password (`12345678`) when it finishes. The primary account uses `user@email.com`; additional Free, Pro, and Business accounts are created for plan testing.
- Business name: `BrightSide Print Studio`
- Business slug: `brightside-print-studio`
- Sent quote token: `demoquote1002senttoken`
- Expired quote token: `demoquote1005expiredtoken`
- Voided quote token: `demoquote1006voidedtoken`

The seed creates deterministic sample accounts for Free, Pro, and Business plans, multiple businesses, inquiry forms, inquiries, quotes, follow-ups, notifications, and billing records.

The seed supports overriding these values through the `DEMO_*` env variables in `.env`.

### 4. Start the app

```bash
npm run dev:app
```

For background jobs and cron schedules, run the Inngest Dev Server in a second terminal:

```bash
npm run dev:inngest
```

Set `INNGEST_DEV=1` in `.env` so the app sends events to the local Dev Server instead of Inngest Cloud. Open http://localhost:8288 to inspect function runs.

Use `npm run dev` only when you also need an ngrok tunnel for callbacks or webhook testing.

Open the app at the same origin configured in `BETTER_AUTH_URL`.

## Windows Dev Performance

Two machine-level costs sit on top of the database latency covered above.

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

**Memory headroom.** `npm run dev:app` sets `--max-old-space-size=6144`. Raising
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
- Forms: `/<slug>/forms`
- Members: `/<slug>/settings/members`
- Settings hub: `/<slug>/settings`
- Settings sections:
  - General: `/<slug>/settings/general`
  - Profile: `/<slug>/settings/profile`
  - Quote defaults: `/<slug>/settings/quote`
  - Products: `/<slug>/products`
  - Knowledge files: managed from the inquiry and quote workflows when enabled
  - Billing: `/<slug>/settings/billing`

### Product Notes

- Onboarding starts with one guided starter template and keeps everything editable later.
- The current starter templates are:
  - `Agency / Studio`
  - `Consultant / Professional Services`
  - `Contractor / Home Service`
  - `General Service Business`
- Public inquiry pages can include supporting cards, optional showcase images, and editable intro copy.

Products and Members are main dashboard destinations. Do not document the removed settings pricing or settings members routes.
