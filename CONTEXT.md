# Requo

SaaS for service businesses: inquiry → quote → invoice → manual payment record. Requo records money received outside Requo; it never processes money.

## Language

### Tenancy and access

**Business**:
The tenant boundary: one service business, its members, settings, services, quotes, invoices, and plan.
_Avoid_: Workspace

**Account**:
The authenticated user identity from Better Auth. One account can belong to multiple businesses.
_Avoid_: Workspace, organization

**Plan**:
The subscription tier attached to a business (`free`, `pro`, or `business`).
_Avoid_: Package, subscription level

**Entitlement**:
A capability granted by a plan, checked with `hasFeatureAccess`.
_Avoid_: Paywall, permission (reserve permission for roles)

**Feature gate**:
The UI component that hides or locks an entitlement (`FeatureGate`).
_Avoid_: Paywall

**Upgrade prompt**:
The conversion UI shown when a gate or usage limit is reached (`UpgradePrompt`).
_Avoid_: Paywall

**Billing**:
Subscription mechanics: checkout, subscription state, and the customer portal.
_Avoid_: Payments (reserve payments for invoice payment records)

### Services and quotes

**Service**:
An offering with a public page and associated intake form. The database retains the historical `business_inquiry_forms` table name.
_Avoid_: Form, inquiry form (for the offering itself)

**Customer**:
The person or organization on the other side of an inquiry, quote, or invoice. Requo stores customer details as snapshots on each commercial record; there is no customer master or cross-business identity.
_Avoid_: Contact, CRM record, client account

**Quote library**:
Reusable pricing entries and line items used to build quotes. The database table is `quote_library_entries`.
_Avoid_: Products, product library

**Payment schedule**:
The quote-side deposit/milestone/balance/retainer plan. The database retains the historical `commercial_schedules` table name.
_Avoid_: Commercial schedule (in user-facing copy)

### AI surfaces

**Agent**:
The public, customer-facing chat that can answer questions and propose an inquiry. Database tables retain the historical `ai_agent_*` names.
_Avoid_: AI agent

**Assistant**:
The authenticated, business-scoped operations chat for members. Database tables retain the historical `owner_assistant_*` names.
_Avoid_: Owner Assistant, AI assistant

**Knowledge entry**:
Manually maintained business context used by AI features. The database table is `business_memories`; uploaded files are knowledge files.
_Avoid_: Memory, business memory

### Manual payments

**Record payment**:
An authorized user attests the business received money outside Requo against one invoice.
_Avoid_: Process payment, charge, collect online

**Payment record**:
One attestation of money received against one invoice, with amount, method, date, optional reference and notes.
_Avoid_: Transaction, payment intent, charge

**Receipt**:
The view and PDF rendering of a single payment record for business records.
_Avoid_: Tax receipt, official receipt, proof of processing

**Void**:
Marking a payment record as excluded from invoice balances while keeping the row for audit.
_Avoid_: Delete, remove, refund, reverse

**Amount paid**:
Sum of non-voided payment records against an invoice, in integer minor units.
Code synonym: `paidInCents` (effective, clamped to total).
_Avoid_: Total payments

**Amount due**:
Invoice total minus amount paid.
Code synonyms: `balanceInCents`, `balance` in invoice list/detail/PDF displays.
_Avoid_: Remaining (in copy), outstanding (in code for per-invoice balance)

**Payment number**:
The human-readable per-business yearly identifier of a payment record (`PAY-YYYY-NNNN`).
_Avoid_: Database id, payment id

**Quote number**:
The human-readable per-business sequential identifier of a quote (`Q-NNNN`).
_Avoid_: Database id, quote id

**Invoice number**:
The human-readable per-business sequential identifier of an invoice (`INV-NNNNNN`).
_Avoid_: Database id, invoice id

**Entity ID**:
The opaque internal database identity of a Requo-owned row (UUIDv7 for new rows; older `prefix_hex`/UUIDv4 values preserved). Never displayed; never parsed.
_Avoid_: Quote/invoice/payment number

**Payment source**:
Where a payment record originated. Only `manual` exists: money received outside Requo and recorded by an authorized user.
_Avoid_: Processor, gateway, provider payment

### Follow-ups

**Follow-up**:
An owner reminder to act on a specific inquiry or quote.
_Avoid_: Follow-up Email, generic task

**Follow-up Email**:
An unattended email sequence Requo sends automatically for a sent quote.
_Avoid_: Follow-up

**Suggested Message**:
Copy-paste draft text for contacting a customer; it never sends by itself.
_Avoid_: Automatic send

**Done**:
Marking a follow-up as finished.
_Avoid_: Contacted

**Dismiss**:
Intentionally clearing a follow-up without acting on it.
_Avoid_: Delete

**Snooze**:
Temporarily hiding a follow-up until a later time without finishing it.
_Avoid_: Reschedule

**Reschedule**:
Changing when a follow-up is due.
_Avoid_: Snooze

### Quote acceptance

**Accept & Sign**:
The customer action on the public quote link: entering their name and confirming they agree to the scope, pricing, and terms shown.
_Avoid_: Legally binding contract, certified signature

**Acceptance record**:
One immutable row per accepted quote version capturing who accepted, when, the exact wording shown, and a snapshot plus hash of the customer-facing quote state.
_Avoid_: Contract, certificate, legal guarantee

**Accepted quote**:
A quote in `accepted` status with an acceptance record pointing at the exact quote version accepted. Acceptance is not invoicing and not payment.
_Avoid_: Paid, invoiced, revenue recognized

### Quote discussions

**Quote discussion**:
One asynchronous conversation attached to exactly one quote, created lazily on its first message. Customers use it on the public quote page without an account; members use the dedicated Discussions inbox or the quote detail page. Both business surfaces open the same thread.
_Avoid_: Chat, inbox (for the thread), ticket, customer portal

**Discussion state**:
The conversation's own state: `needs_reply` when the customer sent the latest message, `waiting_for_customer` when the business did, and `archived` when the quote is terminal. It is separate from the quote status.
_Avoid_: Quote status, unread (that is per member)

**Guest display name**:
The unverified name a customer enters to participate in a public quote discussion. It is a label, not proof of identity.
_Avoid_: Verified customer, customer account

**Discussion inbox**:
The business-side collection of quote discussions across authorized quotes. It is a navigation and reply surface over existing quote discussions, not a general-purpose messaging inbox.
_Avoid_: CRM inbox, support inbox
