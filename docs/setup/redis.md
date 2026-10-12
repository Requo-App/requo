# Upstash Redis

Redis backs Requo's distributed cache layer. It is **optional** — the app runs
without it — but several behaviours degrade in ways that are easy to miss, so
this page covers what is actually lost and how to confirm Redis is live.

## What it is used for

| Consumer | Purpose | Without Redis |
| --- | --- | --- |
| `lib/ai/cache-layer.ts` | Shared get/set/delete/increment | In-process `Map` per instance |
| `lib/ai/embeddings.ts` | 24h content-hash embedding cache | Never hits across cold starts |
| `lib/ai/ai-cache.ts` | AI response cache | Per-instance only |
| `lib/ai/request-dedup.ts` | Duplicate-request suppression | Per-instance only |
| `lib/ai/usage-limiter.ts` | Cooldowns + monthly quota counters | Per-instance counters |
| `lib/db/circuit-breaker.ts` | Failure-state sharing | Per-instance only |
| `lib/ai/capacity-selector.ts` | TPM headroom accounting | Per-instance only |
| `lib/ai/input-sanitizer.ts` | Lockout counters | Per-instance only |
| `lib/rate-limit/redis-rate-limiter.ts` | Sliding-window rate limits | Falls back to DB (`public_action_events`) |

Every one of these degrades gracefully — nothing throws when Redis is absent.
That is also why a missing Redis is easy to overlook.

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

## Provisioning

1. Create a database at <https://console.upstash.com>.
2. Copy the **REST API** credentials — the REST URL and token, not the Redis
   connection string.
3. Set both variables:

```text
UPSTASH_REDIS_REST_URL=https://<name>.upstash.io
UPSTASH_REDIS_REST_TOKEN=<token>
```

Both are already stubbed in `.env.example` (~line 206). The URL is validated as
a URL and the token as non-empty; a whitespace-only value counts as unset.

## Verifying

The admin health report includes a `Redis (Upstash)` check under the **cache**
category. It reports:

- `warn` / "Not configured — in-memory fallback" — variables absent.
- `warn` / a connection error — variables present but unreachable (5s timeout).
- `pass` / "Connected" — a real round trip to `<url>/ping` succeeded.

The same check is exposed on the integration config matrix as "Redis cache".

You can also verify directly:

```bash
curl -H "Authorization: Bearer $UPSTASH_REDIS_REST_TOKEN" "$UPSTASH_REDIS_REST_URL/ping"
# expected: {"result":"PONG"}
```

## Related

- Provider quota context: `docs/setup/ai-provider-limits.md`
- AI architecture: [`TRD.md`](../architecture/TRD.md#ai-and-model-integrations)
- Integration boundaries: [`TRD.md`](../architecture/TRD.md#apis-integrations-and-asynchronous-work)
