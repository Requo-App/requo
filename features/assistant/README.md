# Assistant Feature

The owner-facing conversational surface (**Assistant**) for authenticated
business members. UI calls it "Assistant".

## Purpose

An AI-powered conversational interface that helps members:
- Search and analyze business data (inquiries, quotes, customers)
- Get operational metrics and analytics
- Execute write operations (create inquiries and quotes; send quotes and change
  inquiry status only after explicit confirmation)

Distinct from the customer-facing Agent (anonymous public chat that qualifies
inquiries), the Assistant operates on existing business data with full
authentication and authorization.

## Architecture

### Session Management
- **Persisted sessions**: `owner_assistant_sessions` + `owner_assistant_messages`.
  The server owns identifiers (`oas_*`); the client never mints one.
- The section root creates nothing until a message is sent: the first chat
  request mints the session and returns it in `X-Session-Id`, and the client
  rewrites the URL in place to `/[businessSlug]/assistant?session=<id>` — a
  search param on the same route, so the page segment is never swapped and the
  streaming reply is never interrupted. `/assistant/chat/[sessionId]` still
  works and redirects here.
- Each session has a title derived from the opening message (renamable,
  deletable) and appears in a member-scoped, paginated history panel opened from
  the chat header (popover on desktop, bottom sheet on mobile).
- Sessions are scoped to the member who created them and retained indefinitely.

### Live Conversations
Conversations live in a module-level client store (`live-chat-store.ts`), not in
component state: each entry owns an AI SDK `Chat` plus the composer draft, so
leaving for another dashboard page and returning through the sidebar reopens the
same conversation with an in-flight stream still running. Entries are keyed by
`userId + businessSlug` (a second sign-in in the same tab can never adopt the
previous member's transcript), capped at five per tab, and evicted
oldest-first, never while streaming. A hard refresh clears the store, and the
transcript is rebuilt from the database by `loadAssistantTranscript()`.

Consequences worth keeping: the rendered chat carries no React `key` and the URL
is only ever rewritten in place, because a remount mid-mint would restart the
conversation the server just created. Deleting a session calls
`forgetLiveConversation()` so it cannot come back as the last-active chat.

### Chat Surface
One mounted component (`assistant-chat.tsx`) serves both the section root
and a saved conversation:
- **Empty state**: the assistant mark, one line of greeting, and the composer
  sit centred; example prompts sit beneath. The first send collapses a trailing
  grid row so the composer glides to the bottom (CSS transition on the
  `chat-stage` grid, not a layout animation library).
- **Replies** render as plain markdown prose — no bubble — with a copy action
  once the turn lands. Only the member's own messages are bubbled.
- **Status**: a shimmering single line ("Thinking", or the running tool's
  present-participle label such as "Searching inquiries").
- **Tool process**: a one-line disclosure above the reply that expands to the
  steps, their arguments, and any failures. Owner surface only.
- **Header**: `New chat` on the left (disabled until there is something to start
  over from), history on the right.

### Transport
UI message stream (`toUIMessageStreamResponse` + `useChat`), so tool calls and
results stream as structured parts rendered by `ToolResultRenderer`.
The orchestrator persists the user turn **before** building the prompt, so the
model always receives the user's text.

### Tool Categories
1. **Read tools** (9): search/stats/analytics/customers/knowledge/follow-ups.
   Archived/deleted records are excluded, name matching is case-insensitive,
   money is dollars (never raw cents), failures return typed errors.
2. **Write tools** (4): `create_inquiry`, `create_quote` (drafting, not gated),
   `update_inquiry_status`, `send_quote` (gated — see below).

See the [technical reference](../../docs/architecture/TRD.md#ai-and-model-integrations)
for the application-wide AI boundaries and this directory for the current
Assistant implementation.

### Authorization
- Requires authenticated user (Better Auth, the only auth system).
- Business membership validation via `getBusinessActionContext()`.
- Business-scoped queries (all tools filter by `businessId`).
- Server-side role checks (`requireToolRole`): drafting is open to all
  members; `send_quote` requires manager or above.

### Write Operation Safety
- **Drafting** (`create_inquiry`, `create_quote`): auto-execute through the
  shared product services, with an audit record per write.
- **Outbound / state-changing** (`send_quote`, `update_inquiry_status`):
  stage a pending confirmation in session state, return
  `confirmation_required`, and execute exactly once via
  `confirmAssistantToolAction` after owner approval.

### Tool Result Presentation
Tools return structured data types that render as rich UI components:
- `inquiry_list` → `<InquiryListCard>`
- `quote_list` → `<QuoteListCard>`
- `stats_summary` → `<StatsSummaryCard>`
- `chart_data` → `<ChartDataCard>`
- `knowledge_results` → `<KnowledgeResultsCard>`
- `customer_list` → `<CustomerListCard>`
- `*_created` / `*_sent` / `*_updated` → `<ActionSuccessCard>`
- `error` → `<ErrorCard>`
- `confirmation_required` → `<ConfirmationRequiredCard>`

## File Structure

```
features/assistant/
├── actions.ts              # Server actions (create/rename/delete/list/confirm)
├── types.ts                # TypeScript types
├── schemas.ts              # Zod input/output schemas
├── queries.ts              # Database query functions (business-scoped)
├── permissions.ts          # Role gating + money helpers
├── orchestrator.ts         # Chat loop (persist-first prompt, UI stream)
├── session-service.ts      # Session/message persistence, titles, confirmations
├── tools/
│   ├── index.ts            # Tool registry
│   └── [tool-name].ts      # Individual tool implementations
├── components/             # Chat surface, history panel, result cards
└── prompts/
    └── system-prompt.ts    # Plan-aware system prompt
```

## Usage

### Chat (this is also how a session is created)
`POST /api/ai/assistant/chat` with `{ businessSlug, sessionId?, messages: UIMessage[] }`
returns the UI message stream; the canonical session id arrives in
`X-Session-Id`. Omit `sessionId` and the route mints one — the surface has no
separate create step.

`createAssistantSessionAction({ businessSlug })` still returns
`{ sessionId: "oas_..." }` for programmatic creation, but no UI calls it.

### Confirm a staged operation
```typescript
import { confirmAssistantToolAction } from "@/features/assistant/actions";

await confirmAssistantToolAction({ businessSlug, sessionId, confirmationId, decision: "approved" });
```

## Safety and metering

- Input sanitisation (`sanitizeAiInput`) before untrusted text reaches a model
  with tools; output filtering (`filterAiOutput`) before persistence.
- Per-plan daily message bucket (`assistantMessagesPerDay`), separate from the
  Agent's session bucket; the shared monthly credit pool is the hard ceiling.
  Limits render `UpgradePrompt` inside the conversation.
- Token usage and cost recorded per surface via `logAiInvocation`.
- Deny-all RLS on assistant tables (service role bypasses; defence in depth).

## Testing

- Provider seam: `MockLanguageModelV3` at `registry.languageModel`, available
  at `tests/support/mock-model.ts`.
- E2E: `tests/e2e/assistant-conversation.spec.ts` (dashboard hand-off → minted
  session URL → streamed reply; section root chrome).

There is no route-level, component, or unit coverage of the Assistant yet.
The behaviours that most need it — the confirmation flow, the role gate on
`send_quote`, cross-tenant refusal, and the business-state check — are not
exercised by any test today. Treat the absence as a gap, not as coverage.

## Related Documentation

- [CONTEXT.md](../../CONTEXT.md) - Domain language
- [TRD](../../docs/architecture/TRD.md) - Application and AI architecture
- [Security guide](../../docs/security/SECURITY.md) - Security invariants
- [AGENTS.md](../../AGENTS.md) - Repository instructions
