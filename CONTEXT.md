# Requo

SaaS for service businesses: inquiry → quote → invoice → manual payment record. Requo records money received outside Requo; it never processes money.

## Language

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
