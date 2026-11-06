<p align="center">
  <img src="./public/logo.svg" alt="Requo logo" width="72" />
</p>

<h1 align="center">Requo</h1>

<p align="center"><strong>Inquiry-to-quote-to-invoice software for service businesses.</strong></p>

<p align="center">Capture requests, send clear quotes, follow up consistently, and invoice accepted work — with AI assistance that never overrules the owner.</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16.4-black" alt="Next.js 16.4" />
  <img src="https://img.shields.io/badge/React-19-61dafb" alt="React 19" />
  <img src="https://img.shields.io/badge/Node-%3E%3D24-339933" alt="Node 24 or newer" />
  <img src="https://img.shields.io/badge/License-AGPL--3.0-blue" alt="AGPL-3.0-only" />
</p>

## Two Ways to Use Requo

### Requo Cloud

The managed hosted service at <https://requo.app>. It includes the Free, Pro,
and Business plans, Polar and PayMongo subscription billing, and the hosted
marketing site. Nothing to install or operate.

### Requo Self-Hosted

Clone or fork this public repository and run an independent instance with
`REQUO_DEPLOYMENT_MODE=self-hosted`. Self-hosted is a complete deployment type,
not a limited Free plan: there is no Requo subscription, no pricing or billing
screen, no Cloud checkout or webhook, no license check, and no phone-home
dependency. It still includes inquiries, quotes, customers, invoices, manual
customer payment records, AI workflows, email, files, and notifications.

You provide your own PostgreSQL database, storage, auth secret, and optional
AI/email provider credentials. See **[docs/self-hosting.md](docs/self-hosting.md)**
for infrastructure, configuration, migrations, scheduling, deployment, and
backups. Requo Cloud sets `REQUO_DEPLOYMENT_MODE=cloud`; a missing value also
defaults to Cloud for backward compatibility.

## Screenshots

![Requo landing page and dashboard preview](public/screenshots/landing.png)

| Business dashboard | Inquiries inbox |
| --- | --- |
| ![Business dashboard with analytics and priority queue](public/screenshots/dashboard-home.png) | ![Inquiries inbox with status tracking](public/screenshots/inquiries.png) |

![Customer-facing public quote page with accept and sign](public/screenshots/public-quote.png)

## Who It's For

- **Business owners and operators** — qualify requests, prepare quotes, and see what needs action across their business.
- **Business members** — work inquiries, quotes, and invoices according to their assigned role.
- **Prospective customers** — submit inquiries and respond to shared quotes without needing a Requo account.

## How It Works

1. An owner creates a business during onboarding (guided starter templates), configures services and inquiry forms, and publishes public intake pages.
2. A customer submits an inquiry through a public service page or the Agent — or a member enters it manually. The owner reviews, qualifies, and prepares a quote from reusable quote-library entries.
3. The quote is shared by public link or email. The customer views, accepts, rejects, or requests a revision; the owner follows up manually or with supported automated follow-up emails.
4. An accepted quote continues into an invoice. Money received outside Requo is recorded as a manual payment entry, and a record/receipt can be issued.
5. Analytics, notifications, audit history, members, and settings keep the business running. Optional Agent and Assistant surfaces help customers qualify requests and help members work with business data.

## What Requo Does

- **Customer intake:** public business/service pages, configurable forms, manual inquiry creation, attachments, duplicate signals, qualification, and status tracking.
- **Quote work:** drafting and revisions, reusable product/quote library, version snapshots, public quote pages, customer responses (accept / reject / revision), and email templates.
- **Follow-up and visibility:** owner reminder tasks, supported automatic follow-up emails, conversion and workflow analytics, CSV, PDF, and PNG exports, in-app notifications, web push, activity/audit records, and business membership.
- **Commercial continuation:** invoices from accepted quotes, manually recorded payments, quote acceptance records, approval flows, typed scope blocks, payment schedules, and change orders.
- **Business management:** business onboarding templates, multiple businesses per account, role-aware membership, and plan entitlements. Requo Cloud adds Polar/PayMongo subscriptions (Free, Pro, Business); self-hosted installations run without them.

> **Agent vs Assistant:** the **Agent** is public customer-facing chat — its proposed inquiry needs customer confirmation before creation. The **Assistant** is the authenticated, business-scoped owner chat — it needs confirmation for customer-visible or pipeline-mutating work. AI drafts quote text grounded in business knowledge files, but **models never emit prices**: quote candidates return `unitPriceInCents: 0` and the server hydrates real prices from the database.

> **Manual payments only:** a payment record attests that the business received money *outside* Requo. Requo never processes money, charges cards, or provides a customer payment gateway. Records are voided, never edited or deleted.

## What Requo Is Not

No dispatch/job management, general calendar or crew scheduling, mobile app, marketplace, payroll, shared customer/CRM entity, payment processing, or general-purpose chatbot. Commercial schedules and approval workflows are quote/work-order concepts, not a calendar product.

## Stack

| Area | Implementation |
| --- | --- |
| Runtime | Node.js 24+, Next.js 16.4.2 App Router, React 19, TypeScript (strict) |
| UI | React Server Components by default, Tailwind CSS v4, shadcn/ui, Radix UI |
| Data | PostgreSQL, Drizzle ORM, `postgres-js`; committed SQL migrations under `drizzle/` |
| Identity | Better Auth (Drizzle adapter) — the only identity provider; every business query is `businessId`-scoped |
| Storage / realtime | Supabase private storage (via authenticated server routes) and realtime notification plumbing |
| Email | Resend, with Mailtrap then Brevo fallbacks |
| AI | Vercel AI SDK with capacity-aware free-tier-first routing (Groq, Gemini, Cloudflare Workers AI, NVIDIA NIM, OpenRouter; NVIDIA hosted NIM is a documented production exception). |
| Background work | Inngest (local Dev Server) plus Vercel Cron route handlers |
| Billing | Requo Cloud only: Polar subscriptions/checkout and PayMongo QR Ph; role authorization stays separate from plan entitlement, enforced server-side |

## Quick Start

Prerequisites: Node.js 24+ and npm, plus either a cloud Supabase project or
Docker for local services. Copy `.env.example` to `.env.local` first. The
template defaults to self-hosted; set `REQUO_DEPLOYMENT_MODE=cloud` for the
managed Requo Cloud service.

### Cloud Supabase

```bash
cp .env.example .env.local   # Cloud Supabase + database values; set REQUO_DEPLOYMENT_MODE=cloud
npm install
npm run db:migrate           # first run, or after pulling new migrations
npm run dev                  # app + Inngest
```

Need inbound webhooks? Set `NGROK_AUTHTOKEN` in `.env.local` (and optionally
`NGROK_DOMAIN` so the public URL stays stable), then run `npm run dev:tunnel`.

### Local services (Docker)

The app and Inngest run on the host; Supabase, Redis, and the
Upstash-compatible Redis proxy run in Docker.

```bash
cp .env.example .env.local   # local Supabase values; set REQUO_DEPLOYMENT_MODE=cloud
npm install
npm run services:up          # start Supabase + Redis, then exit
npm run db:local:setup       # migrate + demo seed + local realtime setup
npm run dev:local            # start services (if needed) + app + Inngest
```

`npm run dev:local` starts the Supabase CLI stack and the Compose Redis
services, then runs the normal `npm run dev`. The app uses the Redis proxy on
`8079`, so the existing `@upstash/redis` client and cache code run unchanged.
For webhook testing, set `NGROK_AUTHTOKEN` in `.env.local` and run
`npm run dev:local:tunnel`. Set `NGROK_DOMAIN` if you have a reserved domain
and want a stable webhook URL. Stop the services with `npm run services:down`.

`npm run db:local:setup` resets application data and creates deterministic
local accounts and businesses — development only, and it refuses non-local
databases. It prints the account emails and password when it finishes; never
use those credentials outside a local environment. See
[Local setup](docs/setup/local.md) for every knob.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js server and Inngest Dev Server |
| `npm run dev:tunnel` | `npm run dev` plus the ngrok tunnel |
| `npm run dev:local` | Start local Docker services, then `npm run dev` |
| `npm run dev:local:tunnel` | Start local Docker services, then `npm run dev:tunnel` |
| `npm run services:up` | Start Supabase + Redis services only |
| `npm run services:down` | Stop Supabase + Redis services |
| `npm run dev:app` | Start only the Next.js development server |
| `npm run check` | Lint, typecheck, and repository audits |
| `npm run test` | Unit and component tests |
| `npm run test:integration` | Postgres-backed integration tests (migrates first) |
| `npm run test:e2e:smoke` | Playwright smoke journeys |
| `npm run build` | Production build |
| `npm run screenshots` | Recapture the README screenshots in native Windows Chrome |
| `npm run db:migrate` | Apply Drizzle migrations |
| `npm run db:local:setup` | Local services: migrations + demo seed + realtime setup |
| `npm run db:seed` | Reset and seed local demo data (refuses non-local databases) |
| `npm run db:studio` | Open Drizzle Studio |

## Project Layout

```text
app/           Route groups (marketing, auth, business, public, checkout,
               onboarding), admin console, and API/webhook/cron handlers
features/      Product rules per domain (inquiries, quotes, invoices, …):
               actions, queries, mutations, schemas, components
lib/           Shared infrastructure: auth, database, AI router, billing,
               email, caching, providers
components/    ui/ primitives, shared/ compositions, shell/ navigation
emails/        Transactional email templates
scripts/       Migrations, seeders, audits, and operational tools
tests/         Unit, component, integration, and end-to-end tests
docs/          Setup, product, architecture, and domain documentation
```

`app/` stays thin (routing/rendering); product logic lives in `features/`; shared infrastructure lives in `lib/`. See [Development](docs/engineering/DEVELOPMENT.md) for the canonical patterns.

## Documentation

- [Documentation index](docs/README.md) — map to every guide; start here
- [Product requirements](docs/product/PRD.md) — what Requo currently provides
- [Technical reference](docs/architecture/TRD.md) — how it is implemented
- [Local setup](docs/setup/local.md) — environment variables and database options
- [Deployment](docs/operations/DEPLOYMENT.md) and [deployment setup](docs/setup/deployment.md)
- [Billing](docs/setup/billing.md) — Polar setup
- [Design system](DESIGN.md) — visual language and component standards
- [Domain language](CONTEXT.md) — payments, follow-ups, and acceptance terms
- [Testing](tests/README.md) — test tiers and fixtures
- [Contributing](CONTRIBUTING.md) — ground rules and verification
- [Security](SECURITY.md) — how to report vulnerabilities
- [Changelog](CHANGELOG.md) — notable changes

## License

AGPL-3.0-only, see [LICENSE](LICENSE). If you run a modified version as a network service, you must offer its source to users (AGPL section 13).
