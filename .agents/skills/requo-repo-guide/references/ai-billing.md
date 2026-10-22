# AI and Billing

## Contents

- Agent vs Assistant
- Agent tools (4, not 5)
- Models never emit money
- Router boundary
- Confirmation rules
- Plan locks, role hides
- Billing invariants

## Agent vs Assistant

Never swap the words (ADR 003):

- **Agent** = anonymous customer-facing chat (`features/ai-agent/`). Sessions are not business-browsable; visibility only through an inquiry the session produced; abandoned transcripts have bounded retention; proposals require visitor approval before `createInquirySubmission()`.
- **Assistant** = authenticated owner chat (`features/owner-assistant/`), business-scoped reads/writes with role-gated tools.

## Agent tools (4, not 5)

`features/ai-agent/tools/index.ts` wires exactly `search_knowledge`, `get_business_info`, `get_services`, `propose_inquiry`. The handoff helper (`human_handoff` status/triggers in `session-service.ts`, `schemas.ts`) exists but is not a model tool. Do not add a fifth tool without a product decision.

Inquiry sources are `service_form | ai_assistant | manual | api | unknown` (`features/inquiries/types.ts`); legacy `ai_agent`/`ai_agent_handoff`/`ai` normalize via `normalizeInquirySource`. Never write legacy values.

## Models never emit money

Quote-draft/improvement prompts (`features/ai/prompts/quote-draft.ts`, `quote-improvement.ts`) return `unitPriceInCents: 0` + candidate IDs; the server hydrates DB prices (`features/ai/quote-generator.ts`). Never trust model prices; `send-quote` blocks `unitPriceInCents <= 0` items pending confirmation.

## Router boundary

Route all provider calls through `lib/ai/router.ts` (`generateWithFallback`/`streamWithFallback`) + `selectModels` (`lib/ai/capacity-selector.ts`). Providers wired today are free-tier-first: Groq, Gemini, Cloudflare Workers AI, NVIDIA NIM, OpenRouter. NVIDIA hosted NIM is a deliberate production exception: NVIDIA documents it for development/testing and requires AI Enterprise for production. `lib/ai/catalog.ts` is the model/capability/quota source of truth and the allowlist for pinned overrides. Never import a provider SDK in `features/`. Preserve sanitization, output filtering, limits, and invocation logging in `lib/ai/`.

## Confirmation rules

- Customer-visible or pipeline-mutating Assistant writes require confirmation: `send_quote`, `update_inquiry_status` stage via `requestToolConfirmation` and execute exactly once on `confirmAssistantToolAction` (`features/owner-assistant/`). Draft-only writes (e.g. `create-quote`) do not.
- Agent `propose_inquiry` stages for visitor review; only visitor approval creates the inquiry.

## Plan locks, role hides

Roles govern workspace permissions; plan entitlements govern paid access (`lib/plans/entitlements.ts` single source; `hasFeatureAccess` server check). UI uses `FeatureGate` (`features/paywall/`, variants `action`/`block`/`page`; `block` keeps premium data out of the DOM). Never filter navigation by plan. Assistant ships every plan with a daily bucket (no key); Agent needs Pro+ (`aiAgent`). Check paid access server-side before expensive/state-changing work.

## Billing invariants

- Subscriptions are business-scoped. `business_subscriptions` authoritative; `businesses.plan` denormalized read cache.
- `lib/billing/subscription-service.ts` is the single write path; `lib/billing/webhook-processor.ts` records events in `billing_events` for idempotency (keep signature verification + resolution).
- Webhook route: `app/api/billing/polar/webhook/route.ts`. Refunds are portal-initiated in Polar via subscription webhooks — no refunds module in `lib/billing/`.
- Billing changes require DB-backed integration tests (webhook idempotency, plan resolution).
