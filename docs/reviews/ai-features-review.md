# AI features review

Code review of every AI surface in the application: the public **Agent**, the
authenticated **Assistant**, the AI quote and suggestion pipeline, the shared
`lib/ai/` infrastructure, and the admin/knowledge surfaces.

| | |
|---|---|
| Base | `origin/main` @ `ca9cd744` (fix(services): harden the service feature) |
| Branch | `chore/ai-features-review` |
| Method | Five independent read-only reviews, one per surface, then cross-checking of every High finding against the source |
| Scope | `lib/ai/**`, `features/quote-drafting/**`, `features/agent/**`, `features/assistant/**`, `features/knowledge/**`, `features/importer/ai-extractor.ts`, `features/quotes/**`, `features/follow-ups/**` AI paths, `features/settings/**` AI paths, `features/admin/components/ai/**`, `app/api/ai/**`, `app/admin/ai/**`, `app/(public)/b/[slug]/chat/**`, `app/(business)/[businessSlug]/(main)/assistant/**`, `app/(business)/[businessSlug]/settings/ai/**`, `lib/db/schema/{ai,agent,assistant,knowledge,knowledge-files}.ts` |
| Status | **Fixed.** Every finding below is addressed on this branch. See [Resolution](#resolution). |

No code was executed while producing this review. Every finding below was
re-checked against the source; behaviour that could only be confirmed by
running code is called out as such.

---

## Summary

The AI surfaces are structurally sound. The Agent/Assistant split is respected
throughout, tenant isolation holds on every read and write path, model output
never sets a unit price, and customer-facing writes are staged for explicit
confirmation. The defects are not in the design — they are in the seams:

- **Money gates that never fire.** The quote AI readiness column is written as
  `NULL` on every save, so the "suggested pricing needs owner confirmation"
  gate is inert, and the AI-pricing audit trail is always empty. Percentage
  discounts are persisted as absolute amounts, so the customer is quoted a
  different total than the owner entered.
- **A knowledge write path that corrupts its own data.** Manual knowledge
  entries store the body text as the title, which silently replaces the
  owner's title and makes any entry over 200 characters unsaveable.
- **Two authorization gaps.** The Assistant resolves its business without
  `requireActiveBusiness`, so a plan-locked business can still create
  inquiries and send quotes through the API. The Agent's approval path ignores
  the business-level public-inquiry kill switch.
- **Cost control that is a read, not a reservation.** Both chat surfaces and
  the quote-draft path check a cached monthly total instead of reserving
  credits, so concurrent requests all pass. Separately, the non-stream router
  applies its token correction on top of an already-recorded actual, which
  drives the per-minute counters negative and hides saturated providers from
  the capacity selector.
- **An untrusted-content fence that does not hold.** Only one of the
  customer-controlled fields is fenced in the quote-draft prompt, the closing
  tag is never stripped, and the customer's own revision request is injected
  under a "HIGHEST PRIORITY" heading.

Test coverage for the AI layer is close to zero: `features/quote-drafting/`,
`features/agent/`, `features/assistant/` and `features/knowledge/` have
no unit or integration tests, and the two e2e specs mock the chat endpoints
outright.

---

## Must fix (High)

### 1. The quote AI readiness gate is inert — `aiReadiness` is never persisted

**`features/quotes/actions.ts:137` (create), `:222` (update), `:466` (send gate)**

The editor submits `aiReadiness`, `aiGenerationId` and `aiMissingInfo` as
hidden inputs and `quoteEditorSchema` declares all three
(`features/quotes/schemas.ts:309-311`). The mutations persist all three
(`features/quotes/mutations.ts:564-566`, `:721-723`). Neither action ever
reads them: both build the `safeParse` payload from thirteen named fields,
none of them AI fields, and Zod strips the unknown keys.

`sendQuoteAction` gates on the persisted column
(`features/quotes/actions.ts:466-474`: `quote.aiReadiness === "needs_confirmation" && !quote.aiAcknowledgedAt`),
and the quote detail page derives `needsAiConfirmation` from the same column
(`app/(business)/[businessSlug]/(main)/quotes/[id]/page.tsx:231-234`). With
the column always `NULL`, a quote priced from *suggested* library matches
sends with no owner confirmation, and `acknowledgeQuoteUncertaintyAction` can
never succeed. `quotes.ai_generation_id` is always `NULL` too, so the
AI-impact analytics that filter on it (`features/analytics/queries.ts:2696-2755`)
permanently report zero AI-drafted quotes.

**Fix:** read the three fields in both actions (mapping `""` → `undefined`),
and recompute readiness server-side from the persisted item statuses instead of
trusting the client-supplied value.

### 2. Percentage discounts and tax are persisted as fixed amounts

**`features/quotes/actions.ts:146-147`, `:231-232`**

The editor posts the owner's raw intent plus its type — `discount` +
`discountType`, `tax` + `taxType` (`features/quotes/components/quote-editor/index.tsx:1060`, `:1114`;
the client contract is asserted in `tests/components/quote-editor.test.tsx:67-94`).
The actions map only `formData.get("discount")` → `discountInCents` and drop
`discountType`, so the intent-aware branch of `quoteEditorSchema`
(`features/quotes/schemas.ts:254-262`, `:388-421`) never runs and the raw
string is parsed by `currencyStringToCents` as an absolute amount.

A 10 % discount on a $1,000 subtotal persists as `discountInCents = 1000`
($10): the editor preview shows $900, the saved quote shows $990, and $990 is
what the customer is emailed and asked to accept. The reverse case also fails
— 10 % of a $5 subtotal becomes $10 and is rejected by the schema's
"Discount cannot be larger than the subtotal" rule.

**Fix:** pass `discountValue`/`discountType`/`taxValue`/`taxType` into
`quoteEditorSchema.safeParse` and stop mapping the raw strings onto
`discountInCents`/`taxInCents`.

### 3. Knowledge entries store the body text as the title

**`features/knowledge/actions.ts:147` and `:225`**

```js
title: sanitization.output || parsed.data.title,
content: sanitization.output || parsed.data.content,
```

`sanitizeKnowledgeContent(title, content)` returns a single `output` that is
always derived from the *content*
(`lib/ai/input-sanitizer.ts:282` sanitized path, `:287` clean path). There is
no sanitized-title return value, so the body text is assigned to both fields.

Two consequences: `business_memories` has a
`char_length(title) <= 200` check (`lib/db/schema/knowledge.ts:66`) while the
Zod schema allows 4000 characters of content
(`features/knowledge/schemas.ts:18`), so any entry with more than 200 characters
of body fails the insert and surfaces as the generic "We couldn't save that
entry right now."; and when the body is short enough, the owner's title is
silently replaced by the body, the list row renders it as the title
(`features/knowledge/components/knowledge-manager.tsx:460`), and the embedding is
computed from `title\ncontent` = `content\ncontent`
(`features/knowledge/embedding-text.ts:9`).

**Fix:** sanitize the two fields independently and keep them separate.

### 4. The Agent's approval path ignores the public-inquiry kill switches

**`features/agent/actions.ts:377-397`**

The form is resolved with `businessId + slug + archivedAt IS NULL` only. The
query *selects* `publicInquiryEnabled` (`:384`) but never filters on it, and
`businesses.publicInquiryEnabled` is never consulted. The public form path
requires both
(`features/inquiries/queries.ts:349-356`: `formPublicInquiryEnabled &&
businessPublicInquiryEnabled`).

`get_services` only advertises published services
(`features/agent/tools/get-services.ts:47`), but the `serviceSlug` on the
proposal card is a free-text input
(`features/agent/components/proposed-inquiry-card.tsx:293`), so a visitor
can type any slug of that business — including an unpublished one — and the
approval accepts it.

**Fix:** filter on `services.publicInquiryEnabled`, select and
check `businesses.publicInquiryEnabled`, and reject unpublished services.

### 5. The Assistant resolves its business without `requireActiveBusiness`

**`features/assistant/actions.ts:25`, `app/api/ai/assistant/chat/route.ts:84`**

Both use `getBusinessActionContext({ businessSlug })`, which defaults
`requireActiveBusiness` to `false` (`lib/db/business-access.ts:527`). The
"locked business" check that produces *"This business is locked on your
current plan"* therefore never applies on the Assistant path. Every other
operational write path uses `getMemberBusinessActionContext()` /
`getOperationalBusinessActionContext()`, which set it to `true`
(`features/quotes/actions.ts:127`, `features/inquiries/actions.ts:270`,
`features/knowledge/actions.ts:80`, `features/quote-drafting/actions.ts:91`).

A business locked during a plan downgrade can still be driven by the
Assistant to create inquiries and — after confirmation — **send a customer-facing
quote email** (`markQuoteSentForBusiness` joins `businesses` but never
inspects `lockedAt`/`archivedAt`). The dashboard buttons are blocked; the API
is not.

**Fix:** use `getMemberBusinessActionContext()` on the Assistant path and
re-check the business record state inside the write tools.

### 6. The non-stream router double-counts tokens and drives TPM negative

**`lib/ai/router.ts:216`, `lib/ai/capacity-selector.ts:307-328`**

```ts
await recordModelTokenUsageDetailed(modelId, { inputTokens, outputTokens }); // TPM += actual
await correctTokenUsage(modelId, estimatedTokens, { inputTokens, outputTokens }); // TPM += (actual − estimate)
```

The estimate is never charged on this path, so `correctTokenUsage` adds a
delta on top of an already-correct actual: final TPM = `actual + (actual −
estimate)`. Because `estimateRequestTokens` adds `maxOutputTokens + 500`
(`lib/ai/router.ts:140`), the estimate is normally larger than the actual, so
the counter is systematically under-counted and can go negative outright
(estimate 9 500, actual 3 000 → TPM = −2 000).

`getLoadRatio` divides that counter by the provider limit
(`lib/ai/capacity-selector.ts:438-448`), so a saturated model looks idle and
the router keeps routing to it. The chat path does it correctly — it charges
the estimate first (`lib/ai/fallback-model.ts:177`) and then corrects it — so
the two paths meter the same dimension differently, and the daily (TPD)
counter is never corrected at all.

**Fix:** charge the estimate before applying the correction, as the chat path
does; or record the actual only and drop the correction.

### 7. A failed Agent submission after approval loses the lead permanently

**`features/agent/actions.ts:253`, `:292-298`, `:424-471`**

The proposal is flipped to `status: "approved"` inside the locking
transaction, *before* `createAgentInquirySubmission()` runs as a separate,
non-transactional call. If that call throws, the catch returns "Could not send
that inquiry. Please try again." but leaves the proposal `approved` with no
`inquiryId`. Every later approval hits `status === "approved"` → `kind:
"sending"` → "That inquiry is already being sent. Please wait a moment."
— forever. The client keeps the card in `pending` state
(`features/agent/components/chat-interface.tsx:573`) and the reload path
returns the `approved` proposal
(`app/api/ai/agent/session/route.ts:60-63`), so the card renders the receipt
branch — "Sent to the business" — for a lead that was never filed.

**Fix:** keep the proposal `pending` under the lock and flip it only after the
inquiry exists, or write a distinct `failed` status the approve action can
retry from.

### 8. The untrusted-content fence in the quote-draft prompt is incomplete and breakable

**`features/quote-drafting/quote-generator.ts:259-324`, `features/quote-drafting/prompts/quote-draft.ts:45`**

Three gaps:

1. Only `inquiry.details` is wrapped in `<untrusted_customer_content>`
   (`:293-300`). Every other customer-controlled field sits outside the fence:
   `customerName`, `budgetText`, `requestedDeadline` in the `Inquiry:` header
   (`:262-275`), and each `submittedFieldSnapshot` display value (`:281-291`).
2. The fence's closing tag is never escaped or stripped, and
   `sanitizeAiInput`'s delimiter-injection patterns do not include
   `untrusted_customer_content` (`lib/ai/input-sanitizer.ts:155-163`). A
   customer who writes `</untrusted_customer_content>` closes the fence and
   everything after it sits outside the "treat as data, never as instructions"
   region the prompt defines.
3. `revisionComment` — the customer's own revision-request message — is
   pattern-sanitised only (`:1311-1353`) and then injected verbatim under
   `REVISION REQUEST:`, a section the prompt labels "**HIGHEST PRIORITY**"
   (`features/quote-drafting/prompts/quote-draft.ts:45-50`). It is not fenced and carries
   no data-not-instructions rule.

**Fix:** fence every customer-controlled field, strip or nonce the fence tag,
and drop the "HIGHEST PRIORITY" framing on the revision section.

### 9. The model controls the line quantity that multiplies the DB unit price

**`features/quote-drafting/quote-generator.ts:452`, `:500`, `:135`**

The model response schema accepts any positive quantity
(`z.coerce.number().finite().positive()`, clamped only to 999 999). The
quantity is paired with the **library** unit price and persisted as
`lineTotalInCents = quantity * unitPriceInCents`
(`features/quotes/mutations.ts:119`). Nothing cross-checks it against the
candidate item's own quantity — the library quantity is used only on the
package-expansion path (`:604`).

Unit price is authoritative, but the amount is not: a model (or an injected
instruction) can set `quantity: 500` on a $200 line and produce a $100,000
line that renders with the "matched" badge, with readiness `ready` and no
confirmation required.

**Fix:** take the quantity from the priced candidate for exact matches, and
mark any quantity that differs from the library item's as needing review.

---

## Should fix (Medium)

### Shared AI infrastructure (`lib/ai/`)

| # | Finding | Location |
|---|---|---|
| 10 | `streamWithFallback` cannot fall back — AI SDK v6 `streamText` is synchronous, so provider errors never reach the `try/catch`; usage is recorded at stream start and no token usage is recorded at all | `lib/ai/router.ts:406-420` |
| 11 | The monthly quota gate is a cached, non-atomic read (`getCachedOrDbBusinessUsage`, 60 s TTL, no lock). The safe `reserveUsage` path exists but only the follow-up route uses it | `lib/ai/usage-limiter.ts:247` |
| 12 | The analytics digest job calls `generateWithFallback` with no quota check and no usage record — that spend is invisible to the pool and to `ai_token_logs` | `features/analytics/jobs/digest.ts:89` |
| 13 | `logAiInvocation` awaits a DB insert and lets the rejection escape; six callers discard the promise with `void`, so a transient DB error produces an unhandled rejection (fatal on Node ≥ 15) | `lib/ai/token-logger.ts:187` |
| 14 | The input path has no length cap (the output path caps at 50 000 chars), and the separator rule `/(?:[-=]{4,})\s*\n\s*(?:new\s+)?(?:system\|instructions?\|rules?\|prompt)\s*(?::\|\n)/gim` backtracks quadratically on a run of `-`/`=`, which both hangs and silently stops the rule firing | `lib/ai/input-sanitizer.ts:197`, `:298` |
| 15 | `checkDuplicate` is a non-atomic GET-then-SET and has no callers anywhere — the documented duplicate-AI-call protection does not exist | `lib/ai/request-dedup.ts:57` |
| 16 | Model selection performs N sequential cache round-trips before every turn (~90 cache calls, 9 of them serial) | `lib/ai/capacity-selector.ts:579` |
| 17 | Security audit events are written fire-and-forget and can be dropped on serverless exactly when the DB is unhealthy | `lib/ai/security-events.ts:50` |
| 18 | `recordUsage` increments a cached counter that is never re-primed from the DB after `invalidateUsageCache`, so the counter can restart from zero and under-report the month | `lib/ai/usage-limiter.ts:450` |
| 19 | The daily (TPD) token counters are never corrected; Groq's shared 200 K daily bucket is driven by estimates that never converge | `lib/ai/capacity-selector.ts:318` |
| 20 | The `AiProviderError` branches in the router are dead — provider errors are never wrapped, so the `retry-after` back-off never runs | `lib/ai/router.ts:277` |
| 21 | Token-log cleanup deletes at most 1 000 rows once a day with no loop, so the 90-day retention promise fails above 1 000 AI calls/day | `lib/ai/token-log-cleanup.ts:36` |
| 22 | The in-memory cache fallback is an unbounded `Map` with no eviction sweep | `lib/ai/cache-layer.ts:43` |
| 23 | `normalizeBusinessInstructions` claims to normalise for prompt injection but only caps length — owner instructions reach the public Agent's system prompt with no filtering | `lib/ai/business-instructions.ts:21` |

### Public Agent (`features/agent/`)

| # | Finding | Location |
|---|---|---|
| 24 | The business-facing transcript is truncated to the **oldest** 100 raw rows and filtered to user/assistant *after* the limit, so the newest turns — the ones describing the project — are dropped | `features/agent/queries.ts:178` |
| 25 | Every public Agent rate limit is keyed on a User-Agent-dependent fingerprint with no `ipLimit`/`scopeLimit`, so rotating the header defeats all throttles — the same limits the inquiry path guards with `ipLimit` | `app/api/ai/agent/chat/route.ts:70`, `:85`; `features/agent/actions.ts:94` |
| 26 | The per-business session allowance counts every session row, including abandoned ones; ten anonymous POSTs exhaust a Pro business's daily ceiling | `features/agent/actions.ts:109`; `lib/ai/conversation-limits.ts:38` |
| 27 | "Retry response" always fails with 400 — the session token is attached per-call, not on the transport, and `regenerate()` sends no body | `features/agent/components/chat-interface.tsx:795` |
| 28 | "Stop generating" does not cancel the server-side model call: no `abortSignal` is threaded, so the turn runs to completion, is billed, and is persisted as a reply the visitor never saw | `features/agent/orchestrator.ts:410` |
| 29 | Usage is metered only on success, so failed and retried provider calls are free; the quota check is a read, not a reservation | `features/agent/orchestrator.ts:522`, `:586-613` |
| 30 | The 2 000-character message cap covers the legacy `content` field only; the transport the client actually uses (`messages`) is unbounded and the full text is persisted verbatim | `features/agent/schemas.ts:115`; `features/agent/orchestrator.ts:303` |
| 31 | The session token — the sole credential for the transcript and the staged proposal — is sent in the URL query string on every reload | `features/agent/components/chat-interface.tsx:367` |
| 32 | A second inquiry in the same session overwrites `ai_agent_sessions.inquiryId`, orphaning the first inquiry's transcript | `features/inquiries/mutations.ts:404`; `features/agent/queries.ts:158` |
| 33 | Client-supplied session metadata is stored verbatim and unbounded; the `sessionMetadataSchema` that exists for it is never applied | `features/agent/actions.ts:121`; `features/agent/schemas.ts:66` |
| 34 | A malformed `messages` array returns 500 instead of 400 | `app/api/ai/agent/chat/route.ts:57` |
| 35 | The public chat page never checks `hasFeatureAccess(business.plan, "agent")`, so a downgraded business keeps a discoverable but dead chat | `app/(public)/b/[slug]/chat/page.tsx:48` |

### Assistant (`features/assistant/`)

| # | Finding | Location |
|---|---|---|
| 36 | `send_quote` emails the customer *before* the state transition, so a quote changed in the window produces a customer email for a quote the system still shows as a draft — and a re-run sends a second email | `features/assistant/tools/send-quote.ts:309` vs `:343` |
| 37 | `create_quote` always fails when the model supplies `validUntil`: the tool schema wants a full UTC datetime, the quote schema wants `YYYY-MM-DD` — the two are mutually unsatisfiable | `features/assistant/schemas.ts:139`; `features/quotes/schemas.ts:245` |
| 38 | The conversation-history cache is keyed by business slug only, so a second member signing in on the same tab is shown the previous member's conversation titles — which are the first user message | `features/assistant/components/assistant-history-cache.ts:32` |
| 39 | The Assistant's email quota and `emailTemplates` entitlement use the denormalized `businesses.plan` instead of the effective plan, which the codebase itself documents as fallible | `features/assistant/tools/send-quote.ts:176`, `:275` |
| 40 | `update_inquiry_status` stages an unfrozen payload (no `expectedStatus`), and staged confirmations never expire — the approved prompt can diverge from what is then written | `features/assistant/tools/update-inquiry-status.ts:96`; `features/assistant/session-service.ts:552` |
| 41 | The chat route accepts an unbounded message; `compactMessages` then trims the tail, so a long turn is silently dropped from the prompt while still being stored and billed | `app/api/ai/assistant/chat/route.ts:30`; `lib/ai/token-budget.ts:100` |
| 42 | Errored turns are never metered — `recordUsage` runs only from `onFinish`, which the AI SDK skips when no step completes | `features/assistant/orchestrator.ts:506` vs `:477` |
| 43 | `search_customers` loads every customer email in the business (both tables, no LIMIT) into a `Map` on every tool call, then paginates in memory | `features/assistant/queries.ts:425` |
| 44 | Attachment text is concatenated **after** sanitisation, so an uploaded document reaches a model with write tools unsanitised — the README states the opposite | `features/assistant/orchestrator.ts:190-223`; `features/assistant/README.md` |
| 45 | The README's "Testing" section names four test files; none of them exist | `features/assistant/README.md:156-167` |

### Quote AI, suggestions, importer (`features/quote-drafting/`, `features/quotes/`, `features/follow-ups/`)

| # | Finding | Location |
|---|---|---|
| 46 | The quote-draft path checks the AI allowance instead of reserving it, and the per-user cooldown starts only after generation completes — N concurrent requests all pass the same cached total | `features/quote-drafting/actions.ts:115`; `features/quote-drafting/quote-generator.ts:1204` |
| 47 | The editor strips all AI provenance before submit — `getVisibleEditorItems` omits `aiProductStatus`, `aiProductLibraryEntryId`, `aiProductLibraryItemId` and `aiEvidence`, so every saved quote persists `ai_product_status = NULL` and the audit trail is always empty | `features/quotes/components/quote-editor/utils.ts:71` |
| 48 | The auto-draft-on-qualify job generates an AI draft and throws it away — no quote row, no draft record, and the spend still counts against the credit pool | `lib/inngest/functions/events.ts:368` |
| 49 | The follow-up AI prompt embeds the customer's public quote bearer token, which the codebase documents as a credential that must not be exposed | `app/api/business/follow-ups/suggest-message/route.ts:107`; `features/follow-ups/queries.ts:685`; `features/quotes/token-storage.ts:13` |
| 50 | The importer imports a provider SDK inside `features/` and calls it directly, bypassing the router, the usage meter, `sanitizeAiInput` and `filterAiOutput` | `features/importer/ai-extractor.ts:3`, `:155` |
| 51 | Importer extraction output is not Zod-validated at the analyze step, and the cents conversion depends entirely on the model obeying "convert to cents" — a scale error seeds a wrong price into the library, where it can later be auto-verified onto a quote | `features/importer/ai-extractor.ts:223` |
| 52 | Raw model output (which can echo customer text) is written to server logs on parse failure | `features/quote-drafting/quote-generator.ts:1237` |

### Admin AI and knowledge (`app/admin/ai/`, `features/knowledge/`, `features/settings/`)

| # | Finding | Location |
|---|---|---|
| 53 | The Agent settings save targets the active-business cookie, not the business in the route slug — the same bug already fixed for the service editor (`CHANGELOG.md:52`), and inconsistent with the six slug-bound knowledge actions on the same page | `features/settings/actions.ts:297`; `app/(business)/[businessSlug]/settings/ai/page.tsx:89` |
| 54 | Untrusted knowledge content reaches model prompts unfenced, and any `staff` member can write it — unlike customer text, knowledge is not wrapped or marked "data, never instructions" | `features/knowledge/retrieval.ts:287`; `features/knowledge/actions.ts:79`; `features/quote-drafting/quote-generator.ts:833` |
| 55 | A failed knowledge upload deletes the storage object but leaves the `business_knowledge_files` row in `pending`, permanently consuming a plan slot | `features/knowledge/actions.ts:443` |
| 56 | The embedding backfill re-selects rows that fail to embed first forever (the job mutates the same `updatedAt` it orders by), so poison rows starve every row behind them | `features/knowledge/jobs/embedding-backfill.ts:77`, `:104` |
| 57 | The Knowledge tab's queries run on every load of the Assistant settings page, whether or not the tab is selected | `app/(business)/[businessSlug]/settings/ai/page.tsx:106` |
| 58 | Embedding vectors for every memory row are serialized into the client payload (~768 floats per row) and never used | `features/knowledge/queries.ts:29` |
| 59 | Raw provider error text — which can echo customer text from a rejected generation — is persisted for 90 days and rendered in the admin errors table | `features/admin/queries.ts:2857`; `features/admin/components/ai/admin-ai-errors-table.tsx:62` |
| 60 | Files stuck in `processing` (killed Inngest step) can never be retried — the UI only offers retry for `failed` | `features/knowledge/processing.ts:104`; `features/knowledge/components/knowledge-manager.tsx:495` |

### Low

- `features/assistant/actions.ts:203` — the confirmation action reports failures as success and the client discards the result.
- `features/assistant/tools/get-quote-stats.ts:66` — quote aggregates are hard-coded to `USD` while the rows use `quote.currency`.
- `features/agent/actions.ts:358` — approval proceeds when the plan or the agent toggle has lapsed (deliberate, but undocumented).
- `features/knowledge/processing.ts:140` — one injection phrase anywhere in a 500-page file rejects the whole file.
- `lib/ai/output-filter.ts:7` — the header still says "fail-open" on a fail-closed path.
- `features/importer/actions.ts:88` — the `ai-file-import` rate-limit label does not merge with the `public-inquiry-submit` bucket.

---

## Test gaps

The AI layer has almost no executable coverage. Nothing in `features/quote-drafting/`,
`features/agent/`, `features/assistant/` or `features/knowledge/` is
exercised by a test that asserts behaviour rather than mocking it, and the two
e2e specs mock the chat endpoints outright
(`tests/e2e/agent-conversation.spec.ts`, `tests/e2e/assistant-conversation.spec.ts`).
`tests/support/mock-model.ts` is entirely unused.

Highest-value additions, in order:

1. **Quote save round-trip** — assert `aiReadiness`, `aiMissingInfo` and
   `aiGenerationId` are persisted, that `quote_items.ai_product_status` /
   `ai_evidence` are written for an AI-drafted quote, and that a percentage
   discount is stored as the server computed it. Catches findings 1, 2 and 47.
2. **Route-level integration test for the Assistant chat endpoint** against the
   `MockLanguageModelV3` seam — assert the prompt the model saw, the
   persisted rows, role gating, cross-tenant refusal, exactly-once confirmation
   execution, and that a locked business is refused. Catches finding 5 and
   finding 36.
3. **Agent approval integration test** — `propose_inquiry` → card → approve →
   `createAgentInquirySubmission`; assert no inquiry exists without approval,
   that the inquiry's `businessId` and form belong to the session's business,
   that a failed submission leaves the proposal retryable, and that the
   `publicInquiryEnabled` boundary holds. Catches findings 4 and 7.
4. **Router token accounting regression** — assert the final TPM counter equals
   real usage after `generateWithFallback`, and that the streaming path
   advances to the next candidate on a provider error. Catches findings 6 and
   10.
5. **Usage reservation concurrency test** — N concurrent calls must not exceed
   the monthly credit pool. The follow-up path already has this test
   (`tests/integration/follow-up-suggest-message.test.ts:74-99`); the agent,
   assistant and quote-draft paths need the equivalent.
6. **Prompt fence test** — assert customer text cannot escape the
   `<untrusted_customer_content>` region, that the fence tag is stripped, and
   that the revision request is fenced too.
7. **Input sanitizer tests** — one per rejection pattern, the lockout
   threshold, NFKC/zero-width normalisation, and a length-cap/quadratic-pattern
   regression test.
8. **Memory action tests** — title vs content mapping, the 200-character
   constraint, the `staff` role gate, plan-limit enforcement, and upload
   failure cleanup.

---

## Suggested order of work

1. Findings 1, 2, 3 — money and data gates that are silently off.
2. Findings 4, 5, 53 — authorization and tenant-boundary gaps.
3. Findings 6, 10, 11 — cost metering, before the pool is over-consumed.
4. Findings 7, 8, 9, 54 — prompt-injection and unrecoverable-write paths.
5. Findings 12, 24, 25, 26, 30 — abuse controls on the public surface.
6. The remaining Medium findings, then the test gaps listed above.

Each group needs its own branch and PR — this review spans five independent
areas and does not belong in a single change.

---

## Resolution

Every finding in this review is fixed on `chore/ai-features-review`, in seven
commits grouped by area. The mapping:

| Finding | Resolution |
|---|---|
| 1 — readiness gate inert | `computeQuoteAiReadiness` recomputes readiness server-side from the persisted provenance; the client value is ignored. `aiGenerationId` is validated against the server-issued format. |
| 2 — percentage discount | The actions submit `discountValue`/`discountType`/`taxValue`/`taxType`; the schema derives both amounts from the server-side subtotal. |
| 3 — knowledge title | `sanitizeKnowledgeContent` returns the title and the content separately. |
| 4 — public-inquiry kill switch | The Agent's approval path requires `services.publicInquiryEnabled` and `businesses.publicInquiryEnabled`. |
| 5 — locked business writes | The Assistant resolves its business with `requireActiveBusiness: true`. |
| 6 — token double-count | The estimate is charged first and corrected afterwards; the correction now converges on every enforced dimension. |
| 7 — lost lead after approval | The proposal moves to `sending`, returns to `pending` when the submission fails, and a stale send is reclaimed after two minutes. |
| 8 — incomplete fence | Every customer-controlled value goes through one fence, the fence tag is stripped from untrusted text, and the revision request carries no special standing. |
| 9 — model-chosen quantity | An exact match takes the quantity from the priced candidate. |
| 10 — `streamWithFallback` | It now runs on the fallback wrapper, which resolves the candidate inside its own `doStream`, and corrects the usage when the stream ends. |
| 11 — quota is a cached read | The Agent, the Assistant, the quote draft, the auto-draft job and the importer reserve a credit before the call and settle it with the real weight. |
| 12 — unmetered digest | The digest's invocation is logged. It is deliberately not charged to the business's pool: it is a platform-provided feature for entitled businesses. |
| 13 — `logAiInvocation` rejection | The insert is caught, and the stored error text is scrubbed of customer content. |
| 14 — unbounded sanitizer | The inspection is capped and the separator rule no longer backtracks quadratically. |
| 15 — request dedup | `CacheLayer.setIfAbsent` claims the key atomically. |
| 16 — serial cache calls | The dead-model checks run concurrently. |
| 17 — lost security events | The insert is awaited. |
| 18 — usage counter restart | The cached counter is an absolute total again and is re-primed after an invalidation. |
| 19 — uncorrected daily counters | The correction now covers the per-day and provider-shared counters and the neuron pool. |
| 20 — dead provider-error branches | Provider errors are wrapped, so the retry-after back-off works. |
| 21 — token-log cleanup | The cleanup drains in bounded batches. |
| 22 — unbounded cache | The in-memory fallback is capped and swept. |
| 23 — business instructions | The docblock now states what the function does: it normalises and caps owner-authored guidance, which is trusted by design. |
| 24 — truncated transcript | The role filter runs in SQL and the newest 100 turns are kept. |
| 25 — rotatable rate limits | The Agent's buckets have `ipLimit` and `scopeLimit`. |
| 26 — session allowance | Only sessions that produced a message count. |
| 27 — broken retry button | The token travels with the retry, and the retry reuses the client message id so the turn is not persisted or billed twice. |
| 28 — stop generating | The request's abort signal reaches the provider and the run is closed on abort. |
| 29 — unmetered failures | A failed turn is charged for what it spent. |
| 30 — uncapped transport | The shared chat schema caps the transport the clients use. |
| 31 — token in the URL | The client sends it as a bearer token. |
| 32 — orphaned transcript | The session resolves by every inquiry it produced. |
| 33 — unvalidated metadata | The metadata is parsed and bounded; the schema is strict. |
| 34 — malformed messages | A bad payload is a 400, not a 500. |
| 35 — undiscoverable chat | The page checks the plan entitlement. |
| 36 — email before the transition | The post-send failure is reported honestly instead of as a failed send. |
| 37 — `validUntil` | The tool's timestamp is normalised to the calendar date the quote schema wants. |
| 38 — history cache | The cache is keyed per member, not per business. |
| 39 — denormalized plan | The effective plan scopes the allowance and the entitlements. |
| 40 — unfrozen confirmation | The staged payload freezes the approved state, and a confirmation expires after 30 minutes. |
| 41 — dropped turn | The compaction preserves the latest turn. |
| 42 — unmetered failures | The Assistant charges failed turns. |
| 43 — full customer scan | The scan is bounded and the filters run in SQL. |
| 44 — unsanitised attachments | The attachment text is sanitised before it reaches the model. |
| 45 — fictional test files | The README states what is actually covered, and what is not. |
| 46 — quota is a cached read | The draft path reserves and settles. |
| 47 — stripped provenance | The editor keeps the AI provenance on every row. |
| 48 — discarded draft | The auto-draft job persists the quote it generates. |
| 49 — bearer token in a prompt | The prompt describes the quote; Requo appends the link to the finished message. |
| 50 — importer bypass | The document is sanitised, the response is filtered and validated, and the invocation is metered and logged. |
| 51 — price scale | The model reports the amount as written; the server owns the conversion to cents. |
| 52 — raw output logged | Only the length and a short prefix are logged. |
| 53 — cookie-scoped settings | The save is bound to the route slug. |
| 54 — unfenced knowledge | The knowledge evidence is fenced and both prompts say what the fence means. |
| 55 — orphaned file row | The row is deleted with the storage object. |
| 56 — backfill starvation | The batch is ordered by creation, so the failed rows stop blocking the rest. |
| 57 — tab queries | The Knowledge tab loads its data when it is opened. |
| 58 — vectors in the payload | The vector is no longer selected. |
| 59 — provider error text | The stored error is scrubbed before it is persisted. |
| 60 — stuck files | The retry affordance covers a file stuck in "processing". |
| Low — failed action reported as success | The confirmation action returns `ok: false` and the client surfaces the reason. |
| Low — aggregates in USD | The business's own currency is used. |
| Low — stale output-filter comment | The header now matches the fail-closed behaviour. |

The test gaps listed above remain open: this branch fixes the defects, it does
not add the missing coverage for them.
