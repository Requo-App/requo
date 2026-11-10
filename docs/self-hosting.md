<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:2381c605500aa697cf7ef504cc509814f57f9df35b4ec43111d1548c8edd8e35 -->

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

Infrastructure is selected separately from the deployment mode. Storage,
Realtime, billing, and email each have an explicit driver variable, and the
defaults preserve the historical stack. Billing is a capability rather than a
hard-coded edition: `REQUO_BILLING_DRIVER=none` grants the full product tier,
while `polar` or `paymongo` re-enables billing routes and plan entitlements even
on a self-hosted installation.

## What self-hosted mode changes

| Area | Requo Cloud | Requo Self-Hosted (default) |
| --- | --- | --- |
| Requo subscription | Free/Pro/Business plans | Not required and not assigned |
| Pricing page (`/pricing`, `/pricing.md`) | Available | Available when a billing driver is enabled; 404 when `none` |
| Billing settings (`/settings/billing`) | Available | Available when a billing driver is enabled; 404 when `none` |
| Checkout, portal, billing webhooks | Available | Available when a billing driver is enabled; 404 when `none` |
| Subscription expiry job | Runs | No-op when billing is disabled |
| Upgrade prompts, trial banners, plan badges | Available | Hidden when billing is disabled |
| Cloud plan restrictions | Apply | Not applied when billing is disabled |
| Requo license or phone-home | None | None |
| Core inquiries, quotes, invoices, customers | Available | Available |
| Manual customer payments | Available | Available |
| AI and email providers | Operator-configured | Operator-configured |

Self-hosted without a billing driver is not "Cloud on the Free plan". It is a
separate deployment type. With `REQUO_BILLING_DRIVER=none`, entitlement reads
resolve to the full product tier, and the application does not require any
Requo Cloud certificate, feature flag, subscription row, or network call.
Setting a billing driver opts back into the plan model.

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
| Object storage | Required for file uploads | Supabase Storage, any S3-compatible bucket, or local disk. Uploads are served through authenticated application routes. |
| Realtime | Optional | Supabase Realtime when configured; in-app notifications still work with `REQUO_REALTIME_DRIVER=none`. |
| Email provider | Required for auth email | Resend, Mailtrap, Brevo, or any SMTP server. Verification and password-reset email cannot be delivered without a provider. |
| Billing provider | Optional | Polar or PayMongo only when `REQUO_BILLING_DRIVER` selects one. Leave it as `none` for a billing-free install. |
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

# Object storage: supabase | s3 | local (auto-detects Supabase when unset)
REQUO_STORAGE_DRIVER=local
LOCAL_STORAGE_ROOT=.data/storage          # use a persistent volume in production

# Supabase Storage (REQUO_STORAGE_DRIVER=supabase)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=     # or NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=

# S3-compatible storage (REQUO_STORAGE_DRIVER=s3)
S3_BUCKET=
S3_REGION=auto                           # AWS S3: use the bucket’s AWS region before storage:setup; R2: auto
S3_ENDPOINT=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_FORCE_PATH_STYLE=                      # 1 for MinIO and path-style endpoints
S3_PREFIX=

# Realtime: supabase | none. Unset uses Supabase when the JWT secret exists.
REQUO_REALTIME_DRIVER=
SUPABASE_JWT_SECRET=                      # only for Supabase Realtime

# Email: auto | resend | mailtrap | brevo | smtp
REQUO_EMAIL_DRIVER=auto
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=                              # 1 for implicit TLS (usually port 465)
SMTP_USER=
SMTP_PASSWORD=
SMTP_ALLOW_INSECURE_AUTH=                 # true only for trusted local relays
AUTH_REQUIRE_EMAIL_VERIFICATION=true      # false only when running without email

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
REQUO_BILLING_DRIVER=none

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
Unless you explicitly set `REQUO_BILLING_DRIVER` to `polar` or `paymongo`,
self-hosted mode refuses checkout, portal, and webhook requests instead of
charging anyone.

## Database

PostgreSQL is the source of truth for businesses, memberships, inquiries,
quotes, invoices, customer payments, subscriptions (Cloud only), and audit
records. Tenant isolation is enforced by `businessId`-scoped queries and
membership checks, not by the deployment mode.

Apply the committed migrations before starting the application. On a plain
PostgreSQL database that was not provisioned by Supabase, run the one-time
bootstrap first; it creates the `anon`/`authenticated` roles and the
`storage.buckets` stand-in that the committed migrations expect:

```bash
npm run db:bootstrap:vanilla   # once per plain PostgreSQL database
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

File uploads go through one provider-neutral storage port. Choose a driver with
`REQUO_STORAGE_DRIVER`:

- `supabase` uses Supabase Storage. Set `NEXT_PUBLIC_SUPABASE_URL`, a
  browser-safe key (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and `SUPABASE_SERVICE_ROLE_KEY`.
- `s3` uses one S3-compatible bucket (AWS S3, MinIO). Set the `S3_*` variables; `S3_PREFIX` keeps the logical buckets apart.
- `local` writes under `LOCAL_STORAGE_ROOT`. This is the zero-dependency
  default for a single host. Use a persistent volume, and do not use local disk
  across multiple app instances unless the directory is shared.

When the variable is unset, Supabase is selected if its credentials exist;
otherwise uploads use local disk. Run `npm run storage:setup` after configuring
the driver: it creates the four private Supabase buckets with per-bucket size
limits, checks an S3 bucket, or creates the local root. S3 buckets must already
exist. The application still owns authorization, file limits, and content-type
checks. Keep buckets private: downloads and approval artifacts are proxied
through authenticated or token-scoped application routes, never a public bucket
URL.

Cloudflare R2 and Backblaze B2 are unsupported by this browser POST upload flow.

Inquiry attachments upload directly to S3 with a presigned POST policy that
caps the object at the plan limit. The bucket must allow browser `POST`
requests from the application origin; a typical CORS rule is:

```json
[
  {
    "AllowedOrigins": ["https://requo.example.com"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["Content-Type"],
    "MaxAgeSeconds": 3000
  }
]
```

The policy also fixes the object key and content type. Downloads remain
same-origin through Requo, so the bucket itself stays private.

Realtime is separate. `REQUO_REALTIME_DRIVER=supabase` requires
`NEXT_PUBLIC_SUPABASE_URL`, a browser-safe key
(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` or `NEXT_PUBLIC_SUPABASE_ANON_KEY`), and
`SUPABASE_JWT_SECRET`. With `none`, or when the JWT secret is unset, Realtime is
disabled and the rest of the application — including notifications stored in
the database — continues to work.

The service-role key, S3 secret, and SMTP password must never be exposed to the
browser or committed to the repository.

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

Embeddings and multimodal importer extraction require Gemini. Without a
Gemini key, semantic retrieval falls back to lexical search and AI-assisted
file extraction is unavailable.

### Use your own OpenAI-compatible provider

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:da9b43dc347d4bb0788ace7cae9bce081987b194e8e7eb2059084cd2bbef52a0 -->

Self-hosted mode can use an OpenAI-compatible API, including OpenAI, Ollama,
vLLM, LiteLLM, Together, Fireworks, and similar services.

<!-- /coderabbit-ai-generated:v1 -->

```env
AI_CUSTOM_BASE_URL=http://127.0.0.1:11434/v1
AI_CUSTOM_API_KEY=
AI_CUSTOM_MODEL=qwen3:8b
```

`AI_CUSTOM_BASE_URL` and `AI_CUSTOM_MODEL` must be set together.
`AI_CUSTOM_API_KEY` is optional for local endpoints that do not authenticate.

<!-- coderabbit-ai-generated:v1 -->

When `AI_CUSTOM_API_KEY` is set, requests include the key as a Bearer token,
so use an `https://` base URL for remote endpoints. Plain `http://` is suitable
for loopback or another trusted local path.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:fede8182e4381c4e595eef7e84605cf629643413eed069a5592541375412cdee -->

Cloud does not register the custom provider, but still validates the custom
provider environment variables. In particular, `AI_CUSTOM_BASE_URL` and
`AI_CUSTOM_MODEL` must be set together in Cloud mode too.

<!-- /coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:2b398da4533799029b09d8711c14276913bbd4a1b0ab35577c45c25f0d9d062d -->

The custom model is prepended to every chat and completion routing profile.
It is not always tried first: capacity and health ranking can select a built-in
model even when the custom model is healthy. For later steps in a turn, the
router prefers the model that last succeeded. The same cooldown, fallback
chain, and invocation logging apply as for built-in providers. If the endpoint
is at capacity, over its context window, or failing, routing can advance to
the configured free-tier providers. Configure its behaviour with:

<!-- /coderabbit-ai-generated:v1 -->

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
# or any SMTP server
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=
SMTP_USER=
SMTP_PASSWORD=
SMTP_ALLOW_INSECURE_AUTH=                 # true only for trusted local relays

EMAIL_DOMAIN=mail.example.com
EMAIL_FROM_DEFAULT=
EMAIL_FROM_NOTIFICATIONS=
EMAIL_FROM_SYSTEM=
EMAIL_FROM_QUOTES=
EMAIL_FROM_SUPPORT=
LOW_EMAIL_MODE=
```

`REQUO_EMAIL_DRIVER` accepts `auto`, `resend`, `mailtrap`, `brevo`, or `smtp`.
`auto` keeps the historical fallback chain and tries SMTP last; a named driver
is tried first, with the other configured providers as fallback.

Authentication email (verification and password reset) needs a working
provider and sender. Email verification stays required by default; set
`AUTH_REQUIRE_EMAIL_VERIFICATION=false` only when the installation intentionally
runs without email. Optional operational emails are controlled by
`LOW_EMAIL_MODE` and per-business settings. Missing optional email credentials
do not crash unrelated features; the affected send path reports that email is
not configured. See [Billing and Polar](setup/billing.md) only for Cloud
billing; it is not required here.

Authenticated SMTP requires STARTTLS unless implicit TLS is enabled. Set
`SMTP_ALLOW_INSECURE_AUTH=true` only for trusted local relays that cannot use
TLS. Certificate validation remains enabled.

For country detection, set `GEO_COUNTRY_HEADER` to a header supplied by your
trusted proxy. When configured, only that header is read; otherwise
`x-vercel-ip-country` and `cf-ipcountry` are checked in order. The trusted proxy
must overwrite the configured header and strip untrusted default country
headers from incoming requests.

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
- `/api/cron/expire-subscriptions` (returns a no-op summary when billing is disabled)

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
npm run storage:setup          # create local root or Supabase buckets
npm run db:bootstrap:vanilla   # only for a plain, non-Supabase PostgreSQL
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
storage row probes the selected driver, and the billing row reports `Not used`
when `REQUO_BILLING_DRIVER` is `none` instead of warning about missing Polar
configuration.

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
| `/pricing` or `/settings/billing` returns 404 | Expected when billing is disabled (`REQUO_BILLING_DRIVER=none`). |
| Checkout or billing webhook returns 404 | Expected when billing is disabled. |
| AI features show a configuration message | Set at least one provider key and restart/redeploy. |
| Verification or password-reset email does not arrive | Configure a supported email provider and sender, then check provider logs. |
| Follow-ups or digests do not run | Check Inngest keys, the `/api/inngest` endpoint, and scheduler authorization. |
| Uploads fail | Check `REQUO_STORAGE_DRIVER`, that driver's credentials, the bucket policy or `LOCAL_STORAGE_ROOT`, and storage quotas. |

For repository setup conventions, see the [documentation index](README.md) and
[local setup](setup/local.md).


<!-- /coderabbit-ai-generated:v1 -->