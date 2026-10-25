# Observability and correlation IDs

Server-side diagnostics emitted through the structured logger produce one JSON
line per event. The goal is to join a user-visible failure to its route, job,
webhook delivery, AI invocation, or email attempt without threading an ID
through every feature signature.

## Log shape

`lib/observability/logger.ts` emits:

```json
{
  "timestamp": "2026-01-02T03:04:05.000Z",
  "level": "info",
  "event": "polar_webhook.completed",
  "service": "requo",
  "environment": "production",
  "correlationId": "inngest_run_123",
  "durationMs": 42
}
```

`logInfo`, `logWarn`, `logError`, and `logDebug` add caller fields. `logError`
also serializes the thrown value as `{ name, message }` plus a stack outside
production. Error messages keep only the first line, redact bearer tokens and
email addresses, and are capped at 500 characters. The development stack is
rebuilt from the scrubbed message and frame lines, so multiline error text is
not copied into the log. Debug lines are dropped in production.

Callers must not log request bodies, prompts, message content, or secrets.
The logger additionally redacts credential-shaped keys (authorization,
cookies, passwords, API keys, client/webhook secrets, and tokens), truncates
long strings, caps arrays, bounds nesting depth, and marks circular references.
Redaction is a backstop, not permission to pass sensitive values.

## Correlation sources

| Boundary | Correlation ID | Returned to caller |
|---|---|---|
| AI Agent and Assistant chat routes | `x-correlation-id`, then `x-request-id`, else `req_*` | `x-correlation-id` response header |
| Polar webhook | same request-header rule | `x-correlation-id` response header |
| Vercel cron routes | same request-header rule | `x-correlation-id` response header |
| Inngest function or step | `inngest_<runId>` for the whole run | Inngest run dashboard |
| Email sent outside a request scope | new `email_*`, reused when one exists | None; use the logged `idempotencyKey` and `emailOutboxId` |

Incoming header values are treated as opaque log keys, never as authorization.
Only 1–128 characters from `[A-Za-z0-9._:-]` are accepted; anything else is
discarded and replaced with a generated ID. The ID is carried in
`AsyncLocalStorage`, so any line emitted through the logger inside the boundary
picks it up automatically, including streaming callbacks and awaited provider
calls.

## Following a failure

1. Start with the provider surface: a non-2xx Vercel cron run, a failed Inngest
   run, or a Polar webhook delivery.
2. Use its path, function ID, run ID, or the response's `x-correlation-id` to
   search application logs for the matching `correlationId`. Inngest logs also
   include `runId`, `functionId`, `stepId`, and `stepType`.
3. AI invocation logs keep `type: "ai_invocation"` alongside the structured
   fields for existing dashboards.
4. Email attempts log `email.provider.attempt_started`,
   `email.provider.accepted`, `email.provider.attempt_failed`, and
   `email.send.skipped_sent` with `emailOutboxId` and `idempotencyKey`.
5. The persisted AI invocation, security-event, audit, and activity tables
   remain the durable record; logs are the operational trail.

## Adding a boundary

- Route handlers: wrap the handler in `withRequestCorrelation` from
  `lib/observability/request.ts`.
- Background entry points: wrap the work in `ensureCorrelationId` so a nested
  call reuses an existing ID instead of forking the trail.
- New logs: use the helpers in `lib/observability/logger.ts` rather than
  `console.*`, so fields and redaction stay consistent.
- Cron routes created through `makeCronRoute` inherit the wrapper; do not add a
  second one.

## Known limits

- Lines emitted with `console.*` do not carry the correlation ID. Migrate new
  diagnostics to the logger, and expect older call sites outside the wrapped
  boundaries to remain unstructured until they are migrated.
- Completion is logged when the handler returns the response. For streamed AI
  responses, `durationMs` measures setup and headers, not the full stream.
- There is no OpenTelemetry/distributed-trace export, log drain, alert route, or
  dashboard checked into this repository. Provider dashboards (Vercel, Inngest,
  Polar, email, AI) remain authoritative for external health and quotas.
- Correlation IDs are for diagnosis only. Do not use them for authorization,
  idempotency, or billing decisions.
