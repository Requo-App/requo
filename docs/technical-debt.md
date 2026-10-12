# Requo Technical Debt

Open inconsistencies plus resolved items kept as a record. Only the **Remaining** items are actionable; resolved items stay for context.

## 1. Duplicated `0021` migration prefix

- Evidence: `drizzle/0021_invoice_payment_tracking.sql` + `drizzle/0021_invoice_notifications.sql` (30 files total; no `0019`).
- Affected: migration ordering / history readability.
- Impact: low today (Drizzle applies journal order), but the next `db:generate` numbering needs care to avoid a third collision.
- Direction: leave history untouched (never edit committed migrations); verify the next generated prefix sequences correctly.

## 2. ~~Unused `quote_post_acceptance_status` enum~~ (resolved)

- Evidence: was defined in `lib/db/schema/quotes.ts`; zero references in `lib/`, `features/`, `app/`.
- Resolved: the declaration was removed and `drizzle/0030_omniscient_cassandra_nova.sql` drops the type. The column and its index were already dropped back in `0012_remove_jobs_invoices_automations.sql`, and no table, policy, or view referenced the type, so the drop is data-free. Post-acceptance state continues to live on invoices, not this enum.

## 3. BoardUI / shadcn duality (migrated — issue #73)

- Was: `components/base/*` + `components/application/` + `components/foundations/` alongside `components/ui/*`; the migration is complete and the old component families were removed.
- Resolved: all 40 BoardUI modules recreated 1:1 as shadcn-style components (`cva` + `cn`, identical classes/DOM/props) under `components/shared/*`; old dirs deleted; `@/utils/cx` folded into `cn` (`lib/utils.ts` carries the type-scale merge group) and removed. `app/globals.css` token layer stays (`components/ui/*` uses it).

## 4. Legacy styling debt (already tracked in `DESIGN.md`)

- Evidence: `DESIGN.md` Cleanup Targets: remaining `space-y-*`/`space-x-*` stacks, arbitrary radii/shadows; quote editor `<form>` carries the raw `dashboard-detail-layout` grid class because the shared wrapper cannot wrap forms yet.
- Affected: visual consistency, density audit (`audit:density`).
- Impact: low-medium (cleanup, not behavior).
- Direction: migrate opportunistically per `DESIGN.md` rules; promote repeating values into tokens/shared classes instead of one-off fixes.
- **Resolved — status colour.** `components/shared/status-badge.tsx` now owns the single tone → class map. The eight per-domain class maps and their 222 `!important` tokens are gone; quotes, inquiries, invoices, follow-ups, businesses, the admin console, the assistant tool-result cards, and the settings service pills all compose `StatusBadge`. `scripts/audit-status-tokens.ts` (wired into `check:seo`) enforces it.
- **Remaining — raw palette on non-pill surfaces.** Status *pills* are tokenized, but raw palette still colours semantic surfaces: `components/shared/archived-record-banner.tsx` (amber), `components/shared/paywall.tsx` (violet brand accent), `features/quotes/components/ai-pricing-review-panel.tsx` and `send-quote-dialog.tsx` (amber alerts), and `features/quotes/components/public-quote-interactive-column.tsx` + `public-quote-preview-interactive-column.tsx` (emerald/red/amber option cards). Move these to `--warning` / `--success` / `--destructive` opportunistically.
- **Remaining — the same cascade-order bug outside status.** `meta-label !text-primary` (`components/marketing/marketing-hero.tsx`, `marketing-feature-row.tsx`, `solutions/solutions-shared.tsx`, `solutions/solution-detail.tsx`) and `!bg-sidebar-accent` (`components/shared/dashboard-sidebar.tsx`) are the identical failure mode the status migration removed: a custom class in `@layer utilities` setting a colour that a utility then cannot override. Fix by giving the custom class a variant that does not set colour (as `Badge variant="status"` does), not by keeping the `!`.
