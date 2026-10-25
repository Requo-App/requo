# Scheduler Ownership

Requo runs recurring work through two schedulers: Inngest and Vercel Cron.
Both are supported, but each recurring task has exactly one owner. A task must
never be registered in both schedulers, and a migrated task must be removed
from the old registration rather than left behind as a disabled duplicate.

This page is the inventory operators and contributors use when changing a
schedule, debugging a missed run, or deciding where a new job belongs.

## Ownership rule

| Use | Scheduler |
|---|---|
| Multi-step work, per-step retries, concurrency limits, event fan-out, or provider calls that can rate-limit | **Inngest** |
| A bounded maintenance sweep that is a single idempotent query or storage pass and completes well inside the route limit | **Vercel Cron** |

Inngest functions are registered in
[`lib/inngest/functions/`](../../lib/inngest/functions) and exposed at
`/api/inngest`. Vercel Cron paths are declared in
[`vercel.json`](../../vercel.json) and implemented under
[`app/api/cron/`](../../app/api/cron).

## Inngest recurring functions

All times are UTC. Registration and retry settings live in
[`lib/inngest/functions/cron.ts`](../../lib/inngest/functions/cron.ts).

| Task | Function ID | Schedule | Retry / concurrency | Re-run safety | Failure visibility |
|---|---|---|---|---|---|
| Follow-up reminders | `cron-follow-up-reminders` | `0 8 * * *` | 2 retries | `reminderSentAt` gate plus a date-keyed email idempotency key | Inngest run history |
| Automatic follow-up sends | `cron-follow-up-auto-send` | `0 * * * *` | 2 retries, concurrency 1 | Row-locked transition, activity row, per-plan send budget, email idempotency key | Inngest run history |
| Quote auto follow-ups | `cron-auto-follow-ups` | `0 * * * *` | 2 retries, concurrency 1 | Attempt counter advances only after delivery; attempt-keyed email idempotency key | Inngest run history |
| Viewed-quote follow-ups | `cron-quote-viewed-follow-ups` | `0 7 * * *` | 2 retries | Candidate query excludes quotes that already have the follow-up | Inngest run history |
| Expiring-quote notifications | `cron-quote-expiring-soon` | `0 8 * * *` | 2 retries | Notification query excludes an existing `quote_expiring` notification | Inngest run history |
| Stale-inquiry auto-archive | `cron-auto-archive-stale-inquiries` | `0 3 * * *` | 2 retries | Archive mutation is conditional on the inquiry still being eligible | Inngest run history |
| Overdue-invoice notifications | `cron-invoice-overdue` | `0 8 * * *` | 2 retries | `overdue_notified_at` gate plus notification dedupe | Inngest run history |
| Abandoned Agent session expiry | `cron-expire-agent-sessions` | `0 * * * *` | 2 retries | Time-window deletes are naturally retry-safe | Inngest run history |
| Embedding backfill | `cron-embedding-backfill` | `0 * * * *` | 2 retries, concurrency 1 | Only rows with a null embedding are selected | Inngest run history |
| Analytics daily rollups | `cron-analytics-rollup` | `0 4 * * *` | 2 retries, concurrency 1 | Upserts by business and day | Inngest run history |
| Analytics weekly digest | `cron-analytics-digest` | `0 9 * * 1` | 2 retries, concurrency 1 | Week-keyed email idempotency key | Inngest run history |
| Scheduled analytics reports | `cron-analytics-scheduled-reports` | `0 * * * *` | 2 retries, concurrency 1 | Report/period/recipient-keyed email idempotency key and `lastSentAt` | Inngest run history |
| Analytics benchmarks | `cron-analytics-benchmarks` | `0 3 1 * *` | 2 retries, concurrency 1 | Upsert by benchmark key | Inngest run history |

Event-triggered Inngest functions (push notifications, inquiry qualification,
quote drafting, knowledge-file processing, and auto follow-up enablement) are
not recurring schedules. They are registered in the same directory and use the
same retry policy.

## Vercel Cron routes

`vercel.json` is the schedule source of truth. Every route authenticates with
`CRON_SECRET` through [`lib/security/cron.ts`](../../lib/security/cron.ts) and
fails closed when the secret is missing.

| Task | Path | Schedule | Re-run safety | Failure visibility |
|---|---|---|---|---|
| Expire stale quotes | `/api/cron/expire-quotes` | `0 1 * * *` | Conditional update of still-`sent`, still-expired rows in bounded batches | Vercel cron run log and non-2xx response |
| Expire subscriptions and trials | `/api/cron/expire-subscriptions` | `0 2 * * *` | Expiry transition is conditional on the observed subscription state | Vercel cron run log and non-2xx response |
| Delete AI token logs past retention | `/api/cron/token-log-cleanup` | `0 3 * * *` | Age-bounded batch deletes | Vercel cron run log and non-2xx response |
| Expire approvals and send reminders | `/api/cron/expire-approvals` | `0 4 * * *` | Exact-version pending-state gates; `reminderSentAt` claim | Vercel cron run log and non-2xx response |
| Remove orphaned inquiry uploads | `/api/cron/cleanup-inquiry-uploads` | `0 5 * * *` | Age cutoff plus attachment-table check before removal | Vercel cron run log and non-2xx response |

## Failure monitoring

- **Inngest:** inspect the Requo app in the Inngest dashboard after changing a
  schedule or function. Failed runs, retry attempts, and final failures are
  visible there. Configure failure notifications for the deployment's on-call
  channel; this repository does not ship an alerting integration.
- **Vercel Cron:** inspect the project's cron run history and function logs.
  A non-2xx response is a failed run. Cron routes request
  `Authorization: Bearer <CRON_SECRET>`; a missing or rotated secret produces
  `401` responses rather than silent success.
- **Application logs:** use the route path, Inngest function ID, or the
  `x-correlation-id` returned by a cron route to find the matching structured
  log lines (`correlationId`). A run that returns a non-2xx response or ends in
  a final Inngest failure is not a success, even when earlier retries passed.
  See [Observability and correlation IDs](OBSERVABILITY.md).
- **Admin console:** the system health surface reports provider configuration
  and availability where implemented. It does not replace the scheduler
  dashboards.

## Adding or migrating a recurring task

1. Choose one owner using the rule above.
2. Implement the job so a repeated run cannot duplicate a customer-visible
   side effect: use a conditional transition, a dedupe marker, an idempotency
   key, or an upsert. Do not rely on a scheduler's retry count for correctness.
3. Bound the work per run. Long sweeps must batch and either resume next run or
   report the remaining backlog.
4. Set the retry and concurrency policy deliberately. Any job that sends email,
   push, or other customer-visible output needs an overlap guard or a
   row-level claim.
5. Remove the old registration when migrating between schedulers. Do not keep a
   deprecated function registered "for reference".
6. Add the task to this table.
7. Verify the schedule in the owning provider's dashboard after deployment.
