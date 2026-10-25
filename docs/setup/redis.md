# Redis

Redis backs Requo's distributed cache layer. It is **optional** — the app runs
without it — but several behaviours degrade in ways that are easy to miss, so
this page covers what is actually lost and how to confirm Redis is live. The
hosted Upstash setup and the full-local Docker Compose setup use the same
`@upstash/redis` client and the same REST contract.

## What it is used for

Every Redis consumer is best-effort. No hard limit is enforced by a Redis
counter, because Redis is optional and its in-process fallback cannot
coordinate two application instances. Losing Redis degrades caching, routing
quality, and abuse friction; it never opens a spend or capacity ceiling.

| Consumer | Purpose | Without Redis |
| --- | --- | --- |
| `lib/ai/cache-layer.ts` | Shared get/set/delete/increment, reservation mirror | In-process `Map` per instance |
| `lib/ai/embeddings.ts` | 24h content-hash embedding cache | Never hits across cold starts |
| `lib/ai/ai-cache.ts` | AI response cache | Per-instance only |
| `lib/ai/request-dedup.ts` | Duplicate-request suppression | Per-instance only |
| `lib/ai/usage-limiter.ts` | Request cooldowns | Per-instance cooldowns |
| `lib/db/circuit-breaker.ts` | Failure-state sharing | Per-instance only |
| `lib/ai/capacity-selector.ts` | Capacity-selection mirror (ranking) | Per-instance ranking; durable reservations are unaffected |
| `lib/ai/input-sanitizer.ts` | Lockout counters | Per-instance only |
| `lib/rate-limit/redis-rate-limiter.ts` | Sliding-window rate limits | Falls back to the DB ledger (`public_action_events`) |

Every one of these degrades gracefully — nothing throws when Redis is absent.
That is also why a missing Redis is easy to overlook.

## Limits that do not depend on Redis

These are the correctness-critical paths. They use Postgres so that every
instance sees the same state even when Redis is missing or unreachable.

- **Monthly AI spend.** `reserveUsage` in `lib/ai/usage-limiter.ts` takes a
  per-business advisory lock, sums the plan-scoped `ai_usage_events` rows, and
  inserts the reservation in the same transaction. `checkUsageLimit` reads the
  same database total; there is no cached quota to go stale.
- **Provider free-tier capacity.** `reserveDurableCapacity` in
  `lib/ai/capacity-store.ts` locks the affected counter keys in sorted order,
  checks every bucket, and increments all of them or none. The counters live in
  `ai_capacity_counters`. `lib/ai/capacity-selector.ts` mirrors them into Redis
  after the durable reservation, for selection/ranking only; it never gates a
  dispatch on the mirror. Direct provider paths (embeddings, importer
  extraction) record their usage into the same durable counters.
- **Public action rate limits.** The public limiter falls back to the
  `public_action_events` ledger and fails closed if neither Redis nor the
  database can answer. Business action limits fall back fail-open, because the
  database is already the authorization and tenancy boundary for those
  requests.

## Why the embedding cache is the one to care about

The embedding cache is keyed by a SHA-256 hash of the input text with a 24h
TTL. With Redis configured, identical text (repeated queries, re-processed
files) resolves from cache instead of calling Gemini.

Without Redis, the cache lives in a per-process `Map`. On serverless each cold
start gets an empty map, so the hit rate is effectively zero. The cost is paid
in two ways:

- **Latency** on the retrieval path, which sits in front of quote generation.
- **Rate-limit headroom.** Embeddings draw on the same Gemini free-tier quota
  (~100 RPM / ~1,000 RPD). Wasted calls reduce how many knowledge files can be
  indexed or repaired per day. See `docs/setup/ai-provider-limits.md`.

## Local development (Docker Compose)

The full-local stack starts two Redis-related services:

- `redis` — Redis 7 with append-only persistence on `localhost:6379`.
- `redis-http` — [`serverless-redis-http`](https://github.com/hiett/serverless-redis-http),
  pinned to `0.0.10`, an Upstash-compatible REST proxy on `localhost:8079`.

Both host port mappings bind to `127.0.0.1`; the Compose app reaches
`redis-http` over the Compose network instead.

For host `npm run dev`, set:

```text
UPSTASH_REDIS_REST_URL=http://127.0.0.1:8079
UPSTASH_REDIS_REST_TOKEN=local-dev-token
```

The compose `app` service overrides the URL to `http://redis-http:80` and uses
the same token. The cache client needs no changes: SRH speaks the REST API that
the `@upstash/redis` client already uses, including the Lua `EVAL` scripts in
`lib/ai/cache-layer.ts`. The admin health check was updated to use the
body-command form described below because SRH does not support path commands.

SRH only accepts commands through the request body, not URL paths. That is why
the health check and the manual verification below POST `["ping"]` instead of
calling `/ping`.

## Hosted Upstash

1. Create a database at <https://console.upstash.com>.
2. Copy the **REST API** credentials — the REST URL and token, not the Redis
   connection string.
3. Set both variables:

```text
UPSTASH_REDIS_REST_URL=https://<name>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
```

Both are stubbed in `.env.example`. The URL is validated as a URL and the
token as non-empty; a whitespace-only value counts as unset.

## Verifying

The admin health report includes a `Redis` check under the **cache**
category. It reports:

- `warn` / "Not configured — in-memory fallback" — variables absent.
- `warn` / a connection error — variables present but unreachable after the
  retry policy (5s per attempt; timeouts get one retry).
- `pass` / "Connected" — a real round trip to the REST endpoint succeeded.

The same check is exposed on the integration config matrix as "Redis cache".

You can also verify directly with the body-command form used by both Upstash
and SRH:

```bash
curl -X POST \
  -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '["ping"]' \
  "$UPSTASH_REDIS_REST_URL"
# expected: {"result":"PONG"}
```

For the local Compose stack, `redis-cli -h 127.0.0.1 -p 6379 ping` checks the
Redis server itself.

## Related

- Provider quota context: `docs/setup/ai-provider-limits.md`
- AI architecture: [`TRD.md`](../architecture/TRD.md#ai-and-model-integrations)
- Integration boundaries: [`TRD.md`](../architecture/TRD.md#apis-integrations-and-asynchronous-work)
