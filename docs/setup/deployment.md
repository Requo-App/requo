# Requo Deployment Setup

## Summary

Requo deploys as a Next.js app with a Postgres database, Supabase storage credentials,
Better Auth secrets, transactional email providers, AI provider keys, and optional billing providers.

The deployed product is aimed at service businesses that need to capture
inquiries, turn them into quotes, share or send quotes, follow up, and track quote
views plus customer responses from one place.

Only the `main` branch deploys. Preview deployments are disabled in
`vercel.json` (`git.deploymentEnabled`: `main: true`, `"**": false`), so
pushes to any other branch or PRs build nothing on Vercel.

## Environment Variables

### Core runtime

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `APP_TOKEN_HASH_SECRET`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

### Database tooling

- `DATABASE_MIGRATION_URL`

### Optional but recommended

- `NEXT_PUBLIC_BETTER_AUTH_URL`
- `ADMIN_EMAILS`
- `VERCEL_URL`
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
- `NVIDIA_NIM_API_KEY` (production exception: hosted NIM is documented for development/testing)
- `OPENROUTER_API_KEY`
- Polar billing variables when checkout is enabled
- `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for Inngest Cloud background jobs

## Inngest Checklist

- Background jobs (cron schedules, workflow defaults, push notification side effects) run through Inngest at `/api/inngest`.
- Local development: set `INNGEST_DEV=1` and run `npm run dev` (app + Inngest); use `npm run dev:tunnel` when a public webhook URL is needed.
- Production:
  - Create an Inngest Cloud app for Requo.
  - Set `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` in Vercel.
  - Sync the app URL to `https://<your-domain>/api/inngest`.
  - Confirm all cron functions appear in the Inngest dashboard with the expected schedules.
- Do not expose `INNGEST_SIGNING_KEY` or `INNGEST_EVENT_KEY` to the browser.

## Better Auth Checklist

- Set `BETTER_AUTH_SECRET` to a stable production secret.
- Set `BETTER_AUTH_URL` to the canonical public app origin.
- Set `NEXT_PUBLIC_BETTER_AUTH_URL` only if you need an explicit browser-facing auth route override.
- Keep preview and production origins aligned with Better Auth trusted origins.
- If you deploy on Vercel, `VERCEL_URL` can be used to allow preview-origin requests.
- Add provider credentials only for the OAuth providers you want to expose:
  - `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
  - Configure transactional email for optional magic-link sign-in.
- Provider callback URLs use `/api/auth/callback/<provider>`.

## Supabase Checklist

- Provide `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.
- Provide `SUPABASE_JWT_SECRET` so Better Auth users can subscribe to Supabase Realtime for dashboard notifications.
- Use the Supabase pooler host for both database env vars:
  - `DATABASE_URL` on port `6543`
  - `DATABASE_MIGRATION_URL` on port `5432`
- Keep the host, username, password, and database the same between those two values. Only the port should change.
- If the Connect dialog only shows the `6543` pooler string, duplicate it and change the port to `5432` for `DATABASE_MIGRATION_URL`.
- Run the existing Drizzle migrations before exercising storage-backed features.
- The app expects the migrations to manage the private bucket configuration for:
  - `inquiry-attachments`
  - `knowledge-files`
  - `business-assets`
  - `profile-assets`
- Keep private asset access server-side. The current design uses authenticated route handlers to download private files.

Example:

```env
DATABASE_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:6543/postgres
DATABASE_MIGRATION_URL=postgresql://postgres.<project-ref>:<db-password>@aws-<region>.pooler.supabase.com:5432/postgres
```

## Email Delivery Checklist

- Configure providers in fallback order: Resend, Mailtrap, then Brevo.
- Create API keys for each provider you want to enable: `RESEND_API_KEY`, `MAILTRAP_API_TOKEN`, and `BREVO_API_KEY`.
- For a small deployment, keep only one provider configured. Fallback across
  Resend/Mailtrap/Brevo remains available, but unnecessary provider
  configuration should be avoided.
- Set `EMAIL_DOMAIN` to the verified sending domain. For this Requo environment, use `test.requo.app`.
- Configure senders centrally with `EMAIL_FROM_DEFAULT`, `EMAIL_FROM_NOTIFICATIONS`, `EMAIL_FROM_SYSTEM`, `EMAIL_FROM_QUOTES`, and `EMAIL_FROM_SUPPORT`.
- Do not use personal mailbox domains such as `gmail.com`, `outlook.com`, `hotmail.com`, `yahoo.com`, or `icloud.com` for sender addresses.
- Set `RESEND_REPLY_TO_EMAIL` to the reply target mailbox if customer replies should go to a different inbox.
- Verify the sending domain in Resend, Mailtrap, and Brevo before relying on that provider in production.
- Publish the SPF, DKIM, and DMARC DNS records required by the providers you enable. Provider-specific domain verification is handled outside code.
- Expect password reset email flows to be best-effort when email providers are absent.
- Expect quote sending to fail clearly when no email provider is configured.

### Low-email deployments (limited/free quotas)

Set `LOW_EMAIL_MODE=1` to reduce outbound email to authentication plus the
core inquiry-to-quote workflow. This is the intended default for a
low-volume deployment. Do NOT use `DISABLE_TRANSACTIONAL_EMAILS=1` as the
general solution — it skips auth email callbacks and can break verification,
password reset, and magic-link flows.

Active when `LOW_EMAIL_MODE=1` (see `getActiveEmailPaths()` in `lib/env.ts`
for the code-level inventory):

- Kept: email verification, password reset, explicit owner-requested quote
  delivery (`sendQuoteEmail`), manual quote-link sharing (no email involved).
- Kept with independent toggle: magic-link login only when email is
  configured and `DISABLE_MAGIC_LINK` is not `1`.
- Disabled: inquiry acknowledgment email (per-business `sendInquiryAckEmail`
  still controls non-low-email deployments; new businesses default off in
  low-email mode).
- Disabled: follow-up reminder email (in-app `follow_up_due` notifications
  still sent via `notifyInAppOnFollowUpReminder`; control email separately
  with `notifyOnFollowUpReminder`).
- Disabled: quote auto-follow-up processing (feature code retained; the job
  early-returns in low-email mode).
- Disabled: automatic follow-up sends (manual follow-ups and in-app
  reminders unaffected; the job early-returns in low-email mode).
- Disabled: weekly analytics digest emails (dashboard analytics unaffected).
- Disabled: analytics scheduled report emails (set report records to
  `enabled = false` for defense in depth; the job also early-returns).
- Replaced: business member invite email (invite creation still returns a
  secure link — copy/share it manually from Members → pending invites).

Owner events (new inquiries, quote responses, quote views, revisions) use
the existing in-app notification center plus web push — no email required.
`notifyOnNewInquiry`, `notifyOnQuoteSent`, `notifyOnQuoteResponse`, and
`notifyOnMemberInviteResponse` are legacy settings with no active email call
sites; in-app/push equivalents remain authoritative.

## AI Provider Checklist

- Configure one or more free-tier-first AI providers: `GROQ_API_KEY`, `GEMINI_API_KEY`, `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_TOKEN`, `NVIDIA_NIM_API_KEY` (production exception), or `OPENROUTER_API_KEY`.
- The router registers providers in this order: Groq, Gemini, Cloudflare Workers AI, NVIDIA NIM, then OpenRouter. Routing profiles in `lib/ai/routing-profiles.ts` choose the per-task model order. Only models in `lib/ai/catalog.ts` are routable; see `docs/setup/ai-provider-limits.md` for allowances, the NVIDIA exception, and safeguards.
- Keep all AI API keys server-only.
- Plan separate monitoring for rate limits, quota exhaustion, and model-availability failures.

## Billing Checklist

- Billing is business-scoped. `business_subscriptions` is authoritative and `businesses.plan` is a read cache. Each business has its own subscription.
- Configure Polar (https://docs.polar.sh) for recurring USD subscription billing:
  - `POLAR_ACCESS_TOKEN`
  - `POLAR_WEBHOOK_SECRET`
  - `POLAR_SERVER` (`sandbox` for dev / preview; `production` for live charges — cut over only after sandbox validation)
  - `POLAR_PRO_PRODUCT_ID`
  - `POLAR_PRO_YEARLY_PRODUCT_ID`
  - `POLAR_BUSINESS_PRODUCT_ID`
  - `POLAR_BUSINESS_YEARLY_PRODUCT_ID`
- Point webhooks at:
  - `/api/billing/polar/webhook`
- Subscribe the webhook to subscription.* and order.* events (see `docs/setup/billing.md` for the full list). Refunds happen in the Polar customer portal; refund.* events fall through as `ignored` post-refactor.
- Read `docs/setup/billing.md` before enabling live checkout. The "Production cutover" section there documents the full sandbox→production switch step by step, including pre-cutover checks, env replacement order, post-deploy verification, and the rollback path.

## Rollout Order

1. Provision the database and set `DATABASE_URL` plus `DATABASE_MIGRATION_URL`.
2. Set Better Auth envs and deploy the app at the intended public origin.
3. Run `npm run db:migrate`.
4. Configure Supabase storage credentials and verify upload-backed flows.
5. Configure email providers and verify forgot-password plus quote-send flows.
6. Configure at least one AI provider and verify the inquiry assistant.
7. Configure Polar if checkout is part of the deployment.
8. Configure Inngest Cloud and verify cron schedules plus event-triggered functions sync successfully.
9. Bootstrap admin access (see Admin Access Checklist below).
10. Run the baseline health checks and smoke-test dashboard login, non-member denial, public inquiry submission, quote send/share, and public quote response.

## Admin Access Checklist

The admin console lives at the `/admin` path (no subdomain, no separate
login). To make it accessible in production:

1. **Bootstrap admin access.**
   Admin access is role-based: a user with `role = "admin"` signs in
   normally and visits `/admin`. Promote the first admins from the
   `ADMIN_EMAILS` allowlist:
   ```
   npx tsx scripts/bootstrap-admin.ts
   ```
   Re-runs are idempotent.

2. **Verify.**
   Sign in with a promoted admin's Requo account, then visit `/admin`.
   Logged-out visitors go to `/login`; signed-in non-admins get a 403.

## Current Operational Gaps

- Live provider behavior is not covered by the default automated suite.
- There is no deployment-specific observability layer yet for email, AI provider, or Polar failures.
- SQL RLS helpers and policies exist, but the app does not currently inject `app.current_user_id` into the Postgres session, so database-session RLS is not the main enforcement path for runtime queries yet.
