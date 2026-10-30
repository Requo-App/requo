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
- Cross-tenant coverage is required at the data boundary for each record
  family: inquiries, quotes, invoices, attachments and knowledge files,
  analytics, exports, and AI tools. Denial cases assert both a null/empty
  result and that the stored row did not change. Extend the existing
  `tests/integration/*-tenant-isolation.test.ts` files rather than relying on
  action-level tests alone.
- Roles govern business permissions; plan entitlements govern paid access.
  Check paid access server-side before expensive or state-changing work; hiding
  navigation or UI is not an authorization check.
- [`0007_enable_rls_all_tables.sql`](../../drizzle/0007_enable_rls_all_tables.sql)
  enables RLS and installs default-deny policies for Supabase
  `anon`/`authenticated` roles. Application traffic uses a direct PostgreSQL
  connection through Drizzle with the `postgres` table-owner role, which
  bypasses those policies. RLS is therefore not an application tenant-isolation
  layer today; server-side authorization and tenant-scoped predicates are the
  boundary, not defense in depth. Do not describe enabling or forcing RLS as
  sufficient protection without also changing the application role and every
  query path.
- Scope every business query and mutation through verified membership and
  `businessId`-aware helpers such as `getBusinessActionContext()`. Even after a
  scoped read, include both the record id and `businessId` in each `UPDATE` or
  `DELETE` predicate; a read-then-write that filters only on the record id
  leaves a cross-tenant window.
- Direct database access belongs in `features/<domain>/queries.ts` and
  `features/<domain>/mutations.ts`. UI components, pages, and layouts must not
  import the DB client, Drizzle, or the Supabase admin client. Server action
  modules — files with a top-level `"use server"` directive, not only
  `actions.ts` names — may only do so through the explicit allowlist in
  [`scripts/audit-tenant-boundary.ts`](../../scripts/audit-tenant-boundary.ts).
  The audit resolves static, side-effect, relative, dynamic, and `require`
  imports; add new allowlist entries with a reason, or move the query into the
  feature module. `npm run audit:tenant-boundary` runs as part of
  `npm run check`.
- Admin pages and operations use server-side admin guards. Preserve the
  server checks even where `proxy.ts` also gates `/admin`. `requireAdminUser()`
  always re-reads `user.role` and `user.banned` from the database and grants
  only on `role = "admin"`, so a demotion or ban is enforced on the next admin
  request even while Better Auth's cookie cache still shows the old role to the
  proxy (up to 300 seconds). The proxy gate is an early rejection, not the
  boundary. `ADMIN_EMAILS` is a bootstrap input for promoting accounts and a
  hint for that gate, not a runtime grant. Demotion, suspension, session
  revocation, and account deletion remove the target's own sessions and any
  impersonation sessions they started. Revoking an impersonation session also
  expires Better Auth's session cookies, because its signed cookie cache can
  otherwise keep the deleted session usable until the payload lapses. See
  [`features/admin/access.ts`](../../features/admin/access.ts),
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
- Public quote discussions are gated by the quote's existing bearer token.
  Anyone with the link can read that quote's thread and post; the guest display
  name is unverified, and the guest cookie only groups a browser's messages
  (its HMAC hash is persisted, never the token). Every post re-validates the
  token's quote and business and checks the quote lifecycle under a row lock,
  so a closed quote cannot receive messages even from a stale client. Public
  writes use the per-fingerprint, per-IP, and quote-wide rate limits; message
  bodies are plain text, length-limited server-side, and escaped in email
  templates. Business reads and replies are scoped by `businessId` and checked
  through the member context; unread state is per member, not global.
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
  from the client. Server Actions have a separate 4 MB body limit, below
  the hosting request cap and sufficient for existing 2 MB logo uploads.

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
