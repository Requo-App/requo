# Requo Product Requirements

**Status:** Current product description, verified against the working tree on
2026-10-12. This is not a roadmap or feature specification.

## Purpose and scope

This document describes the product Requo currently provides. For how it is
implemented, see the [TRD](../architecture/TRD.md). Executable behavior and
business rules remain authoritative in code, database constraints, and tests.

## Product overview

Requo is business software for service businesses. It helps a
business receive a customer request, qualify and manage it, prepare and share a
quote, follow up, record the customer's response, and continue accepted work
into an invoice and payment records. Public service pages and configurable
service intake forms provide customer entry points; the business dashboard organizes
the resulting work.

The product's value is keeping this request-to-quote process and its follow-up
in one business-scoped workflow, with templates, automation, and AI assistance
supporting the owner rather than replacing their commercial judgment.

## Users and problems

- **Business owners and operators** need to capture and respond to customer
  requests consistently, prepare clear quotes, and see which opportunities
  need action.
- **Business members** help operate the business according to their assigned
  role.
- **Prospective customers** submit inquiries through public forms or chat and
  review or respond to a shared quote without needing a Requo account.

These are product roles inferred from the shipped flows and permissions, not
personas based on customer research. The repository contains no adoption or
market research metrics.

## Core journeys

1. An owner creates a business during onboarding, configures services and
   intake forms, and publishes public intake pages.
2. A customer submits an inquiry. The owner reviews it, adds notes or
   attachments, qualifies it, and prepares a quote using reusable
   quote-library data.
3. The owner reviews and shares the quote by public link or email. The customer
   views, accepts, rejects, or requests a revision; the owner can follow up
   manually or configure supported automated follow-ups.
4. An accepted quote can continue into an invoice. The business records money
   received outside Requo as payment entries and can issue a record/receipt.
5. Owners use analytics, notifications, audit history, members, and business
   settings to manage the business. Optional AI surfaces can help customers
   qualify requests and help authenticated members work with business data.

## Capabilities in the current product

- **Customer intake:** public business/service pages, configurable forms,
  manual inquiry creation, attachments, duplicate signals, qualification, and
  inquiry status tracking.
- **Quote work:** quote drafting and revisions, a reusable quote
  library, version snapshots, public quote pages, customer responses, and
  email templates.
- **Follow-up and visibility:** owner reminder tasks, supported automatic
  follow-up emails, in-app notifications, web push, activity/audit records, and
  business membership.
- **Business analytics:** a business-scoped analytics surface with Overview,
  Performance, Operations, and Business-only Team views, date-range comparison,
  drill-downs, CSV export, goals, tracking annotations, and scheduled reports.
  Free plans see a fixed 30-day Overview; Pro and Business plans unlock longer
  and custom ranges plus the additional tabs.
- **Commercial continuation:** invoices, manually recorded payments, quote
  acceptance records, approval flows, typed scope blocks, payment schedules,
  and change orders exist in the current application. Their detailed rules are
  defined in implementation and tests.
- **AI assistance:** a public customer-facing Agent and an authenticated,
  business-scoped Assistant; AI quote drafting and business-knowledge
  retrieval are also present.
- **Business management:** business onboarding and templates, multiple
  businesses per account, role-aware membership, plan entitlements, and
  business subscriptions.
- **Commercial plans:** Free covers the complete inquiry → quote → invoice →
  manual payment loop, including customer acceptance, receipts, manual
  payments, and CSV, PDF, and PNG exports. New business owners get a one-time
  14-day Pro trial with no card required; existing Free businesses can start it from
  Billing. A trial grants Pro features, then the business returns to Free with
  its data retained and services beyond the Free live-service allowance
  unpublished. Pro adds automatic follow-ups, more services, more AI
  drafting, custom emails, and advanced insights; Business adds team roles,
  audit logs, and higher limits. Canonical packaging lives in
  [`lib/plans/catalog.ts`](../../lib/plans/catalog.ts).

## Domain language

- A **Business** is the tenant/business boundary.
- A **Service** is an offering with a public page and associated intake form;
  the database retains historical `business_inquiry_forms` naming.
- An **Inquiry** is a prospective customer's request. Customer details are
  snapshots on inquiries and quotes; there is no shared Customer entity.
- A **Quote** is a commercial proposal. Acceptance is a recorded customer
  response, not payment.
- An **Invoice** requests payment. A **Payment** is an owner-entered record of
  funds received outside Requo, never a payment processed by Requo.
- An owner **Follow-up** is a reminder task; a **Follow-up Email** is an
  automated customer email sequence. A **Suggested Message** is draft text.
- **Agent** means public customer-facing chat; **Assistant** means the
  authenticated Assistant chat. See the [domain language guide](../../CONTEXT.md).

## Product principles and constraints

- Keep the product centered on service-business inquiry, quote, follow-up, and
  invoice workflows.
- Keep owners in control of commercial records, prices, outbound messages, and
  meaningful state changes. AI-generated data is assistance, not authority.
- Give each business an isolated business and make user roles govern access.
- Keep public customer journeys low-friction; customers do not need accounts
  to submit inquiries or respond to shared quotes.
- A payment record attests to an external receipt. Requo does not process
  payments or provide an online customer payment gateway.
- Plan entitlements restrict paid capabilities server-side; role controls
  business permissions.

## Boundaries and known limitations

The current product does not provide dispatch/job management, a general
calendar or crew scheduling product, a mobile application, a marketplace,
payroll, a customer identity/CRM entity, payment processing, or a general
purpose chatbot. Payment schedules and approval workflows in the app are
quote/work-order concepts, not a general calendar.

The public Agent's proposed inquiry requires customer confirmation before
creation. Its transcript is not a business-browsable conversation archive;
business visibility is through an inquiry it produced. The Assistant
has authenticated access to business data and requires confirmation for
customer-visible or pipeline-mutating operations. See the current
[security boundaries](../security/SECURITY.md) and [AI architecture in the TRD](../architecture/TRD.md#ai-and-model-integrations).

The codebase does not establish validated personas, customer research,
business outcome metrics, or a committed roadmap. Treat future capabilities as
unknown unless a current product decision says otherwise.

## Related sources

- [Technical implementation](../architecture/TRD.md)
- [Security requirements](../security/SECURITY.md)
- [Domain language](../../CONTEXT.md)
- [Source-defined business concepts](../../lib/db/schema/index.ts)
- [Workflow and lifecycle tests](../../tests/)
