# Requo Self-Hosted

Requo is one open-source application (AGPL-3.0-only) with two deployment
modes. The same public repository and the same application support both.

- **Requo Cloud** is the managed service at <https://requo.app>. It includes
  the hosted subscription plans (Free, Pro, Business), Polar and PayMongo
  checkout, billing webhooks, and Cloud plan entitlements.
- **Requo Self-Hosted** is an independent installation operated by you. It
  includes the Requo product without a Requo Cloud account, subscription,
  pricing page, checkout, billing portal, or license check.

The mode is selected with `REQUO_DEPLOYMENT_MODE`:

```env
# cloud | self-hosted
REQUO_DEPLOYMENT_MODE=self-hosted
```

The value is independent of `NODE_ENV`. A production build can be either mode.
If the variable is missing, Requo keeps the historical **Cloud** behavior so
existing deployments do not change on upgrade. Requo Cloud sets it explicitly
to `cloud` in local development and in Vercel; independent installations should
set it to `self-hosted`.

## What self-hosted mode changes

| Area | Requo Cloud | Requo Self-Hosted |
| --- | --- | --- |
| Requo subscription | Free/Pro/Business plans | Not required and not assigned |
| Pricing page (`/pricing`, `/pricing.md`) | Available | Returns 404 |
| Billing settings (`/settings/billing`) | Available | Returns 404 |
| Checkout, portal, billing webhooks | Available | Return 404 |
| Subscription expiry job | Runs | No-op |
| Upgrade prompts, trial banners, plan badges | Available | Hidden |
| Cloud plan restrictions | Apply | Not applied to the product |
| Requo license or phone-home | None | None |
| Core inquiries, quotes, invoices, customers | Available | Available |
| Manual customer payments | Available | Available |
| AI and email providers | Operator-configured | Operator-configured |

Self-hosted is not "Cloud on the Free plan". It is a separate deployment type.
Entitlement reads resolve to the full product tier, and the application does
not require any Requo Cloud certificate, feature flag, subscription row, or
network call.

Customer payment records are unrelated to Requo subscriptions. Cash, bank
transfer, GCash, Maya, check, and other manually recorded customer payments
remain available in both modes.

## Infrastructure you provide

You own and pay for every service below. Requo does not fall back to Requo
Cloud credentials or infrastructure.

| Service | Requirement | Notes |
| --- | --- | --- |
| PostgreSQL | Required | Supabase Postgres is the tested target. Use `DATABASE_URL` for runtime and `DATABASE_MIGRATION_URL` for migrations when they differ. |
| Better Auth | Built in | Runs inside the app; it needs a strong secret and the public application URL. No external identity service is required. |
| Supabase Storage | Required for file uploads | Uploads are served through authenticated application routes. Use your own project and keep the service-role key server-side. |
| Supabase Realtime | Optional | Enabled by `SUPABASE_JWT_SECRET`; in-app notifications still work without it. |
| Email provider | Required for auth email | Resend, Mailtrap, or Brevo. Verification and password-reset email cannot be delivered without a provider. |
| Inngest | Required for background automation | Runs follow-ups, digests, and event-driven jobs. Core request/response workflows still work if it is down, but queued jobs wait. |
| Redis (Upstash-compatible) | Optional | Caches, rate-limit mirrors, and cooldown state degrade to in-process or database fallbacks. |
| AI provider | Optional | AI features show a configuration message when no provider is set; the rest of the product keeps working. |
| Web push (VAPID) | Optional | Browser push is disabled when the key pair is not configured. |
| Cron scheduler | Required for timed jobs | Five route handlers under `/api/cron/*`; see [Scheduled work](#scheduled-work). |

Google OAuth, Crisp support, Sentry browser reporting, and Vercel
Analytics/Speed Insights are optional integrations. They are only active when
their own environment variables or hosting platform enable them. They do not
send data to Requo Cloud.

## Required environment variables

Copy `.env.example` to `.env.local` for local use, or set the same names in
your hosting provider. Never commit the filled file.

```env
REQUO_DEPLOYMENT_MODE=self-hosted

DATABASE_URL=postgresql://...
DATABASE_MIGRATION_URL=postgresql://...   # direct connection for migrations

BETTER_AUTH_SECRET=<at least 32 random characters>
BETTER_AUTH_URL=https://requo.example.com
NEXT_PUBLIC_BETTER_AUTH_URL=              # optional when same-origin
APP_TOKEN_HASH_SECRET=                    # optional; falls back to BETTER_AUTH_SECRET

NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=     # or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=                      # only for Supabase Realtime

CRON_SECRET=<at least 16 random characters>
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
```

`BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` must be the public origin users
visit. OAuth callbacks and emailed links are built from them.

### Cloud billing variables are not required

Do **not** set Requo Cloud's Polar or PayMongo credentials on a self-hosted
installation. These names are read only by Cloud billing code, and the related
routes are disabled in self-hosted mode:

```env
POLAR_ACCESS_TOKEN=
POLAR_WEBHOOK_SECRET=
POLAR_PRO_PRODUCT_ID=
POLAR_BUSINESS_PRODUCT_ID=
POLAR_PRO_YEARLY_PRODUCT_ID=
POLAR_BUSINESS_YEARLY_PRODUCT_ID=

PAYMONGO_SECRET_KEY=
PAYMONGO_WEBHOOK_SECRET=
```

Reusing Requo's production credentials in your own deployment is unsupported.
If billing credentials are present, self-hosted mode still refuses checkout,
portal, and webhook requests instead of charging anyone.

## Database

PostgreSQL is the source of truth for businesses, memberships, inquiries,
quotes, invoices, customer payments, subscriptions (Cloud only), and audit
records. Tenant isolation is enforced by `businessId`-scoped queries and
membership checks, not by the deployment mode.

Apply the committed migrations before starting the application:

```bash
npm run db:migrate
```

`npm run db:migrate:strict` is the production form used by the Vercel build. It
requires `DATABASE_MIGRATION_URL` and rejects a pooler port. Never edit SQL
migrations that are already committed. Self-hosted installations do not need
`business_subscriptions`, `business_trial_claims`, or PayMongo records, but the
tables stay in the schema so the same codebase and migrations serve both modes.

Back up the database before upgrades and test a restore. The operator owns
schema rollout, migration timing, and rollback planning.

## Storage and realtime

File uploads use Supabase Storage through server-side application routes. Set
`NEXT_PUBLIC_SUPABASE_URL`, a browser-safe key
(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and
`SUPABASE_SERVICE_ROLE_KEY`. The service-role key must never be exposed to the
browser or committed to the repository.

Keep buckets private. The application authorizes file access before issuing a
signed or proxied URL. If `SUPABASE_JWT_SECRET` is unset, Realtime is disabled;
the rest of the application, including notifications stored in the database,
continues to work.

## AI providers

Set your own key for at least one registered provider, or point Requo at any
OpenAI-compatible endpoint. No Requo key is used.

```env
GROQ_API_KEY=
GEMINI_API_KEY=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
NVIDIA_NIM_API_KEY=
OPENROUTER_API_KEY=
```

### Use your own OpenAI-compatible provider

Self-hosted mode can route first to an OpenAI-compatible API, including
OpenAI, Ollama, vLLM, LiteLLM, Together, Fireworks, and similar services.

```env
AI_CUSTOM_BASE_URL=http://127.0.0.1:11434/v1
AI_CUSTOM_API_KEY=
AI_CUSTOM_MODEL=qwen3:8b
```

`AI_CUSTOM_BASE_URL` and `AI_CUSTOM_MODEL` must be set together.
`AI_CUSTOM_API_KEY` is optional for local endpoints that do not authenticate.
The custom provider is available only in self-hosted mode; Cloud ignores these
variables.

The custom model is prepended to every chat and completion routing profile and
then uses the same capacity-aware selector, cooldown, fallback chain, and
invocation logging as the built-in providers. If the endpoint is at capacity,
over its context window, or failing, routing advances to the configured
free-tier providers. Configure its behaviour with:

```env
AI_CUSTOM_TOOLS=true
AI_CUSTOM_QUALITY=9
AI_CUSTOM_CONTEXT_WINDOW=131072
AI_CUSTOM_MAX_OUTPUT_TOKENS=8192
AI_RPM_CUSTOM=60
AI_CUSTOM_COST_INPUT=0
AI_CUSTOM_COST_OUTPUT=0
```

- `AI_CUSTOM_TOOLS=false` skips the custom model for the tool-using Assistant
  and Agent profiles while still using it for quote and short-text work.
- `AI_CUSTOM_QUALITY` is 1-10; a model below a profile's minimum quality is
  skipped for that profile.
- `AI_RPM_CUSTOM=0` removes the local request cap. The provider may still
  enforce its own limit.
- Embeddings and multimodal importer extraction remain Gemini-specific. If no
  Gemini key is configured, semantic retrieval falls back to lexical search and
  AI-assisted file extraction is unavailable.

The built-in registry and routing profiles live in `lib/ai/`. Provider
allowances, routing ceilings, and the provider order are documented in
[AI provider limits](setup/ai-provider-limits.md). When no provider is
configured, AI surfaces show a clear configuration message; inquiries, quotes,
invoices, and manual payment records continue to work.

## Email providers

Set your own sender and provider credentials:

```env
RESEND_API_KEY=
RESEND_FROM_EMAIL=
RESEND_REPLY_TO_EMAIL=
# or
MAILTRAP_API_TOKEN=
# or
BREVO_API_KEY=

EMAIL_DOMAIN=mail.example.com
EMAIL_FROM_DEFAULT=
EMAIL_FROM_NOTIFICATIONS=
EMAIL_FROM_SYSTEM=
EMAIL_FROM_QUOTES=
EMAIL_FROM_SUPPORT=
LOW_EMAIL_MODE=
```

Authentication email (verification and password reset) needs a working
provider and sender. Optional operational emails are controlled by
`LOW_EMAIL_MODE` and per-business settings. Missing optional email credentials
do not crash unrelated features; the affected send path reports that email is
not configured. See [Billing and Polar](setup/billing.md) only for Cloud
billing; it is not required here.

## Scheduled work

The application registers event-driven functions through Inngest at
`/api/inngest`. Configure your Inngest environment with the same
`INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.

Timed route handlers need a scheduler that sends
`Authorization: Bearer $CRON_SECRET`:

- `/api/cron/expire-quotes`
- `/api/cron/expire-approvals`
- `/api/cron/cleanup-inquiry-uploads`
- `/api/cron/token-log-cleanup`
- `/api/cron/expire-subscriptions` (returns a no-op summary in self-hosted mode)

`vercel.json` contains the Cloud schedule. On another host, reproduce the same
paths and frequencies or let Inngest cron functions handle the equivalent work
where one is defined. An unauthenticated or secret-less cron request fails
closed.

## Local startup

```bash
cp .env.example .env.local
# Fill in the database, auth, storage, and at least one email sender.
# Keep REQUO_DEPLOYMENT_MODE=self-hosted for an independent install.
npm install
npm run db:migrate
npm run dev            # Next.js app + local Inngest dev server
```

For a fully local stack (Supabase CLI, Redis, and Inngest):

```bash
npm run services:up
npm run db:local:setup
npm run dev:local
```

`npm run db:local:setup` resets and seeds local application data. It is for
local development only.

## Independent deployment

The application is a standard Next.js App Router build:

```bash
npm run build
npm run start
```

Set the environment variables in the hosting provider, apply migrations
before promoting the build, and point the scheduler and Inngest at the public
origin. Any Node.js 24+ host that can run Next.js works; Vercel is supported
but not required.

Health checks are available to administrators in the admin console. The
billing health row reports `Not used (self-hosted)` instead of warning about
missing Polar configuration.

## Environment and application security

- Only `NEXT_PUBLIC_*` values are exposed to the browser. Database URLs,
  Better Auth secrets, service-role keys, webhook secrets, and provider keys
  stay server-side.
- Use HTTPS in production. Set `BETTER_AUTH_URL` to the exact public origin and
  keep OAuth redirect URLs aligned.
- Keep `ADMIN_EMAILS` limited to operators you trust. Admin access still
  requires `user.role = "admin"` in the database; the allowlist does not grant
  access by itself.
- Better Auth, roles, permission checks, server-side authorization, and
  `businessId` tenant isolation remain enforced in self-hosted mode. Only
  Requo Cloud subscription restrictions are removed.
- Rotate secrets after a suspected leak. Do not reuse Requo Cloud production
  credentials or copy them into an independent deployment.
- Self-hosted checks are enforced on the server (route handlers, server
  actions, jobs). Hiding a button is not the access control.

## Backups and operational responsibility

You are responsible for:

- Database backups, point-in-time recovery, and tested restores.
- Storage bucket backups and retention.
- TLS, DNS, host patching, and network access.
- Inngest and cron scheduling, retries, and monitoring.
- Email and AI provider accounts, quotas, costs, and deliverability.
- Applying migrations and application updates.
- Log retention, incident response, and support for your users.

Requo Cloud's SLA, support, and managed backups do not apply to an independent
installation. Budget for provider costs directly.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Startup fails with `REQUO_DEPLOYMENT_MODE must be "cloud" or "self-hosted"` | Use exactly `cloud` or `self-hosted`; empty values default to `cloud`. |
| `/pricing` or `/settings/billing` returns 404 | Expected in self-hosted mode. |
| Checkout or billing webhook returns 404 | Expected in self-hosted mode; Cloud billing endpoints are disabled. |
| AI features show a configuration message | Set at least one provider key and restart/redeploy. |
| Verification or password-reset email does not arrive | Configure a supported email provider and sender, then check provider logs. |
| Follow-ups or digests do not run | Check Inngest keys, the `/api/inngest` endpoint, and scheduler authorization. |
| Uploads fail | Check Supabase URL, keys, bucket policy, and storage quotas. |

For repository setup conventions, see the [documentation index](README.md) and
[local setup](setup/local.md).
