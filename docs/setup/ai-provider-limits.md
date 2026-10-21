# AI Provider Limits

Requo routes **free-tier-first**. A provider normally belongs in the catalog
only when it offers an ongoing no-card free tier with no expiring trial
credits and no paid-plan requirement. `lib/ai/catalog.ts` is the single
source of truth for model IDs, capabilities, allowances, reset boundaries,
and list prices. It is also the allowlist for pinned/manual model overrides:
a request that names a provider and model is refused before any provider
call unless the exact identifier is in the catalog.

**NVIDIA NIM is a deliberate production exception.** NVIDIA documents the
hosted `build.nvidia.com` endpoints for prototyping and development, and
states that production use requires NVIDIA AI Enterprise. Requo nevertheless
routes the hosted `nvidia:openai/gpt-oss-20b` endpoint in production because
that was explicitly requested. This is an operational policy decision, not a
claim that NVIDIA's hosted free tier is licensed for production; see
[NVIDIA NIM production exception](#nvidia-nim-production-exception).

Catalog metadata was verified on **2026-10-22** against the official sources
linked below. Provider dashboards remain authoritative for a specific
account. Limits are stored as conservative deployment budgets, not as claims
about a provider's published quota.

## Retained providers

| Provider | Models | Free allowance | Shared bucket | Daily reset |
| --- | --- | --- | --- | --- |
| Groq | `openai/gpt-oss-120b`, `openai/gpt-oss-20b`, `qwen/qwen3.8-27b` | 30 RPM · 1K RPD · 8K TPM · 200K TPD | All four dimensions, per organisation | 00:00 UTC |
| Gemini | `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.1-flash-lite`, `gemini-3.5-flash-lite` | Conservative local budgets (see below) | Per model / project | Pacific midnight |
| Cloudflare Workers AI | `@cf/openai/gpt-oss-120b`, `@cf/openai/gpt-oss-20b`, `@cf/zai-org/glm-4.7-flash`, `@cf/qwen/qwen3-30b-a3b-fp8` | 10,000 neurons/day (00:00 UTC); 300 RPM text generation | RPM account-wide; neurons share one daily pool | 00:00 UTC |
| NVIDIA NIM (production exception) | `openai/gpt-oss-20b` | 40 RPM free prototype tier; configured at 20 RPM · 20K TPM; no per-token billing | No shared dimensions modelled | 00:00 UTC |
| OpenRouter | Four `:free` Nemotron/Gemma identifiers | 20 RPM · 50 RPD while <10 credits purchased | RPM and RPD account-wide; no TPM/TPD published | 00:00 UTC |

Sources:

- Groq: [rate limits](https://console.groq.com/docs/rate-limits), model pages
  under `https://console.groq.com/docs/model/...`.
- Gemini: [pricing](https://ai.google.dev/gemini-api/docs/pricing),
  [models](https://ai.google.dev/gemini-api/docs/models),
  [rate limits](https://ai.google.dev/gemini-api/docs/rate-limits).
- Cloudflare:
  [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/),
  [limits](https://developers.cloudflare.com/workers-ai/platform/limits/),
  and each model page under
  `https://developers.cloudflare.com/workers-ai/models/`.
- NVIDIA:
  [API catalog](https://build.nvidia.com/), [API docs](https://build.nvidia.com/api-docs),
  [NIM FAQ](https://forums.developer.nvidia.com/t/nvidia-nim-faq/300317/1),
  [AI Enterprise](https://www.nvidia.com/en-us/data-center/products/ai-enterprise/get-started/).
- OpenRouter:
  [limits](https://openrouter.ai/docs/api-reference/limits); live metadata
  from `https://openrouter.ai/api/v1/models`.

## Removed providers and models

**Cerebras** was removed:

- Cerebras requires a payment method at signup. Its free allocation is trial
  credit that expires, not an automatically renewing no-cost tier.
  ([rate limits](https://inference-docs.cerebras.ai/support/rate-limits),
  [pricing](https://www.cerebras.net/pricing))

**Gemini 2.5 Flash** and **2.5 Pro** were removed because 2.5 access is
restricted to prior users. **Gemini 4 Argon** and **3.1 Pro Preview** are not
free and were never added.

**Mistral was removed entirely.** Mistral is not part of Requo's provider set,
routing profiles, environment, admin surface, tests, or legal disclosures.

## NVIDIA NIM production exception

Direct NVIDIA NIM is retained in production routing:

- Model: `nvidia:openai/gpt-oss-20b`.
- Endpoint: `https://integrate.api.nvidia.com/v1`.
- Modelled limits: 20 RPM and 20,000 TPM; NVIDIA publishes a 40 RPM free-tier
  cap for most models. No daily cap or cost is modelled because the catalog
  entry uses the free API key and has no per-token billing.
- Capability: no tool calling and no strict structured output; therefore it
  is only eligible for the quote and short-text profiles, not the tool-using
  Assistant/Agent profiles.

NVIDIA's own documentation says the hosted API is for prototyping and
development, and that serving real end-users in production requires an
NVIDIA AI Enterprise license. Requo now routes it in production anyway by
explicit request. Before enabling `NVIDIA_NIM_API_KEY` in a real deployment,
confirm that the account has the necessary entitlement; otherwise disable the
key. The quota guard prevents runaway usage but does not make the use
compliant with NVIDIA's terms.

## Gemini: conservative budgets, not published quotas

Google no longer publishes static per-model free RPM/RPD. The catalog uses
these deployment budgets, all overridable with `AI_*` variables:

| Model | RPM | RPD | TPM |
| --- | ---: | ---: | ---: |
| `gemini-3.8-flash` | 10 | 250 | 250,000 |
| `gemini-3.6-flash` | 10 | 250 | 250,000 |
| `gemini-3.1-flash-lite` | 15 | 500 | 250,000 |
| `gemini-3.5-flash-lite` | 15 | 500 | 250,000 |

AI Studio's per-project rate-limit page is authoritative. Free-tier content
is used to improve Google products; that differs from the paid API tier and
is disclosed in the privacy policy.

## Cloudflare: neurons are the real budget

The 10,000-neuron daily pool is the constraint, not RPM. The catalog records
the official neuron rates per million tokens:

| Model | Context | Input neurons/M | Output neurons/M | List price in/out per M |
| --- | ---: | ---: | ---: | --- |
| `@cf/openai/gpt-oss-120b` | 128,000 | 31,818 | 68,182 | $0.35 / $0.75 |
| `@cf/openai/gpt-oss-20b` | 128,000 | 18,182 | 27,273 | $0.20 / $0.30 |
| `@cf/zai-org/glm-4.7-flash` | 131,072 | 5,500 | 36,400 | $0.0605 / $0.40 |
| `@cf/qwen/qwen3-30b-a3b-fp8` | 32,768 | 4,625 | 30,475 | $0.051 / $0.335 |

All four support function calling. Workers AI does not publish a per-model
output cap; `maxOutputTokens` is a conservative 8K deployment ceiling. The
current catalog models are not on Cloudflare's paid-model list, so they draw
on the free neuron allowance.

## Quota enforcement and accounting

- **80% is a deprioritization threshold**, not a spending allowance. Healthy
  candidates are tried before stressed ones.
- **100% is a hard stop.** A candidate whose next-request load would exceed
  any modelled RPM, RPD, TPM, TPD, neuron, or shared bucket is dropped from
  selection. `selectModels` returns only candidates at or below the ceiling;
  if none remain, the router reports that free capacity is exhausted instead
  of calling a provider.
- **Shared buckets are counted once.** Groq shares RPM/RPD/TPM/TPD across all
  its models. OpenRouter shares RPM/RPD across every `:free` model.
  Cloudflare shares RPM across the account and a single neuron pool. Gemini
  limits are per model/project.
- **Request and token counters are separate.** Request counters power
  RPM/RPD. Token counters charge the preflight estimate first, then post the
  difference against actual usage after the turn or stream settles, so the
  counters converge on real spend. Cloudflare neurons are corrected by rate
  as well as by token count.
- **Provider refusals cool down the scope that failed.** A daily-quota error
  cools until the provider's day boundary; a per-minute error cools for one
  minute and marks the provider bucket when limits are shared. A 404 marks
  the identifier dead for six hours without consuming an attempt.
- **Pinned overrides are allowlisted.** The router refuses any provider/model
  absent from `lib/ai/catalog.ts`, any model already at its quota, and any
  model remembered dead. It does not fall back to a different model, so a
  stale manual setting cannot silently spend another quota.

`costCentsPerMillion` stores provider list prices for observability only.
Free-tier billing is zero; logged cost is a list-price equivalent, not
spend. Do not use it as a billing source.

## Routing profiles

The order in `lib/ai/routing-profiles.ts` is deliberate:

- **Assistant chat** starts with Gemini's high-TPM free models, then Groq,
  then Cloudflare's neuron pool, then OpenRouter's reserve tier.
- **Agent chat** starts with Groq for latency, then Gemini, then Cloudflare
  and OpenRouter.
- **Quote draft/improvement** excludes Groq because a 4K output plus a
  grounded prompt cannot fit its 8K TPM. Gemini's 1M-context models lead;
  NVIDIA NIM and Cloudflare are last.
- **Short text** starts on Cloudflare's small models to keep the chat and
  quote allowances free, then Groq/Gemini/NVIDIA, then OpenRouter.
- **Extraction** is Gemini-only because the importer sends multimodal
  document parts directly.

Every profile identifier must exist in the catalog; a catalog/profile
invariant test enforces this. OpenRouter entries are marked `reserve` so the
50 RPD account cap is spent last even if a profile lists one earlier.

## Tuning

Set only the providers you use. Example:

```text
AI_TPM_GROQ=6000
AI_TPM_GEMINI=100000
AI_TPM_CLOUDFLARE=8000
AI_TPM_NVIDIA=20000
AI_TPM_OPENROUTER=0
```

The full override pattern is:

- `AI_RPM_<PROVIDER>`, `AI_RPD_<PROVIDER>`, `AI_TPM_<PROVIDER>`,
  `AI_TPD_<PROVIDER>`
- `AI_RPD_OPENROUTER` (alias `OPENROUTER_DAILY_REQUESTS`)
- `AI_NEURONS_CLOUDFLARE_DAILY` (alias `CLOUDFLARE_DAILY_NEURONS`)

Set a dimension to `0` when it is not published or not modelled. These are
local routing ceilings; they do not change the provider's quota.

## Embeddings share the Gemini budget

The `AI_TPM_*` budgets cover chat traffic only — there is no separate
embedding budget. Embeddings are a **second consumer of the same Gemini
free-tier quota** (`gemini-embedding-001`; roughly 100 RPM / 1,000 RPD, with
batch enqueued tokens capped at 500,000 on the free tier). Three callers draw
on it:

- Knowledge file indexing, in batches of 20 texts with `maxParallelCalls: 5`.
- Manual memory writes, one call each.
- `cron-embedding-backfill`, hourly, bounded at 100 rows per table per run —
  so at most ~20 provider calls per run, ~480/day at worst.

Two levers reduce the draw: configuring Upstash Redis makes the 24h
content-hash embedding cache actually shared (`docs/setup/redis.md`), and the
ingestion retry budget (`EMBEDDING_MAX_ATTEMPTS_WRITE = 3`) is only spent on
errors with positive evidence of being transient, so an unclassifiable failure
does not burn three attempts.

## Remaining uncertainties

- On 2026-10-22, the live `models` comparison passed for Gemini, Cloudflare,
  NVIDIA, and OpenRouter; Groq was skipped because `GROQ_API_KEY` was not
  configured. Generation smoke tests succeeded through Cloudflare and
  OpenRouter. Gemini and NVIDIA model listings passed, but inference requests
  timed out from the audit environment, so their end-to-end generation paths
  still need validation from a normal network or deployment.
- Gemini's free RPM/RPD are project-specific and unpublished; the table
  above is a conservative budget.
- OpenRouter's free RPM/RPD are account-level and change with credit
  purchases; the catalog assumes the <10-credit tier.
- Cloudflare's per-model output ceiling is unpublished; 8K is a deployment
  cap, not a provider claim.
- NVIDIA's hosted NIM endpoints are documented for development/testing only;
  production use requires NVIDIA AI Enterprise. The direct provider remains
  enabled by explicit request, so treat its terms and account entitlement as
  an open operational risk rather than a resolved compliance question.
