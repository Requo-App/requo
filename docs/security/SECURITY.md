# Security Requirements

This document describes implementation boundaries contributors must preserve.
The repository's public vulnerability reporting instructions remain in the
root [`SECURITY.md`](../../SECURITY.md).

## Identity and authorization

- Better Auth is the only application identity/session system. Do not add
  Supabase Auth. Its configuration and catch-all route are in `lib/auth/` and
  `app/api/auth/[...all]/route.ts`.
- Authenticate on the server and authorize each page, action, route, query, or
  mutation that reads or changes protected data. `proxy.ts` is an early route
  gate, not a substitute for server-side checks.
- Business records must be scoped through verified membership and
  `businessId`-aware helpers such as `getBusinessActionContext()`. Never trust
  a client-supplied business identifier as authorization.
- Roles govern workspace permissions; plan entitlements govern paid access.
  Check paid access server-side before expensive or state-changing work; hiding
  navigation or UI is not an authorization check.
- [`0007_enable_rls_all_tables.sql`](../../drizzle/0007_enable_rls_all_tables.sql)
  enables RLS and installs default-deny policies for Supabase
  `anon`/`authenticated` roles. Application traffic uses a direct PostgreSQL
  connection through Drizzle, which bypasses those policies; server-side
  authorization and tenant-scoped queries are therefore essential, not
  optional defense in depth.
- Admin pages and operations use server-side admin guards. Preserve the
  server checks even where `proxy.ts` also gates `/admin`. The session role
  fast path can trust a cached `admin` role or unbanned status for up to 300
  seconds, so a recent demotion or ban may not take effect immediately.
  `requireAdminUser()` is not a fresh database-authoritative role check in that
  branch. See [`features/admin/access.ts`](../../features/admin/access.ts),
  [`lib/auth/admin-identity.ts`](../../lib/auth/admin-identity.ts), and
  [`lib/auth/config.ts`](../../lib/auth/config.ts) before changing this boundary.

## Public capabilities and files

- Public quote, approval, and chat tokens grant narrow capabilities; validate
  token scope, expiry, and associated business/record on the server.
- Quote public tokens are stored in plaintext as well as an HMAC hash because
  owner resend/copy flows recover the original link. A database read therefore
  grants bearer access to sent quotes: never expose the plaintext token in
  logs, list responses, or unrelated queries. Invite and approval tokens use
  hashed lookups; Agent session tokens are separately scoped and expire.
- Private Supabase Storage objects are accessed through authenticated server
  code. Keep service-role credentials out of client bundles and public
  responses. Validate file metadata and use the existing safe path/name
  helpers.
- Public inquiry submissions use server validation, rate limits, and abuse
  checks. Preserve those controls when changing intake paths. The public
  limiter has three ceilings: a per-fingerprint bucket (IP + User-Agent), a
  per-IP bucket, and a scope-wide bucket that no client-supplied value can
  influence. The fingerprint limit alone is bypassable by rotating the
  User-Agent; the per-IP bucket is what actually bounds a sender, and the
  scope-wide bucket is a high backstop so one sender cannot lock a form for
  every other customer.
- Public intake output is untrusted. Escape visitor-supplied text before it
  reaches an email body or a spreadsheet cell: the inquiry acknowledgment
  template escapes it, and `lib/csv.ts` neutralizes leading formula
  characters in every export.
- Inquiry attachments upload straight to storage through a signed URL, not
  through a server action — a Vercel Function rejects any request body
  above 4.5 MB before Next.js sees it. The browser then submits a signed
  upload token, which is what binds the upload to one business; the server
  re-checks the plan limit and confirms the object exists before it
  attaches. Treat the token as a capability: never accept a storage path
  from the client.

## AI boundaries

- Treat user content and retrieved business knowledge as untrusted input.
- Route model calls through `lib/ai/`; preserve input sanitization, output
  filtering, rate/usage limits, and security telemetry.
- Tools independently establish session and business scope. Never authorize
  from model-generated IDs or claims.
- Public Agent proposals require visitor approval before inquiry creation.
  Business operators cannot browse unrelated Agent transcripts.
- Require confirmation for customer-visible sends and pipeline-mutating
  Assistant actions. Model output cannot set authoritative quote prices.

## Secrets, billing, and data integrity

- `lib/env.ts` and `.env.example` define environment names. Commit names and
  safe placeholders only, never real values. `NEXT_PUBLIC_*` values are public
  by design; never use that prefix for secrets.
- Polar webhook processing must preserve signature verification, event
  idempotency, and business subscription resolution. Keep subscription writes
  in the shared billing service.
- Preserve transactional constraints, immutable sent/accepted snapshots,
  payment idempotency, and void-only payment corrections. Do not describe
  manual payment records as money processed by Requo.

## Verification

Authorization and tenant-boundary changes require tests at the server/data
boundary, including denial cases. Use database integration coverage for
authorization-sensitive mutations and real persistence guarantees. Relevant
source and tests live under `lib/auth/`, `lib/db/`, `features/`, and
`tests/integration/`; see [`tests/README.md`](../../tests/README.md).
