# Domain Language

Use `CONTEXT.md` + `docs/product/PRD.md` words in code, copy, and tests. Commercial schedules are quote/work-order concepts, never a general calendar; manual payment records are attestations, never processing.

- **Business**: tenant/workspace boundary. **Service**: offering with public page + intake form (DB keeps historic `business_inquiry_forms` name). **Inquiry**: prospective customer request; customer details are snapshots, no Customer entity.
- **Quote**: commercial proposal (`Q-NNNN`). Acceptance is a recorded customer response (`Accept & Sign` + immutable acceptance record of who/when/wording/snapshot+hash), not payment or invoicing.
- **Invoice** (`INV-*`): requests payment; sent invoices snapshot customer-facing values. **Payment**: owner-entered record of funds received outside Requo (`PAY-YYYY-NNNN`, `source: manual` only). **Amount paid** = sum of non-voided payments (`paidInCents`); **amount due** = total − paid (`balanceInCents`). **Receipt**: view/PDF of one payment record. **Void**: exclude from balances with reason, keep row for audit — never delete/edit/reverse, never "refund".
- **Entity ID**: opaque internal UUIDv7 (`newEntityId` in `lib/ids.ts`; older values preserved, never parsed/displayed). Never show it where a `Q-/INV-/PAY-` number belongs.
- **Follow-up**: owner reminder task on an inquiry/quote (`Done` finish, `Dismiss` clear without acting, `Snooze` hide until later, `Reschedule` change due). **Follow-up Email**: automatic sequence for a sent quote. **Suggested Message**: copy-paste draft, never auto-sends.
- **Agent** (public customer chat) vs **Assistant** (authenticated owner chat) — never swap.

Avoid: process/charge/collect online, transaction/payment intent/charge, tax/official receipt, delete/remove/refund/reverse (say void), remaining/outstanding for per-invoice balance, marketplace/dispatch/mobile/payroll/gateway/general-chatbot scope creep.
