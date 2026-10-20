# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Rebuilt business analytics as four tabs — Overview, Performance, Operations, and Team — with fresh KPI, funnel, trend, money, attention, usage, timing, cohort, benchmark, and member-workload sections. Free plans see a fixed last-30-days Overview with real numbers; Pro plans unlock 7/30/90-day and 12-month/custom ranges plus Performance and Operations; Business plans add all-time history and team analytics. Locked tabs show static previews and their premium queries never run.
- Rebuilt analytics CSV export with summary and daily-series scopes, and re-resolve the date range and plan entitlement on the server so export cannot bypass the picker's range cap.
- Added goals, tracking annotations, and scheduled reports to the analytics reports surface, including a recipient cap of one for Pro and five for Business.

### Changed

- Tidied the analytics card layout: every card in a row shares one height, a plot fills its card, and the table view scrolls inside the card so switching between Chart and Table never blows the card up. The desktop toolbar is a bare control row instead of a boxed panel, switches use a plain thumb without the inset chip, the "Live" section headers are gone, the attention list is iconed by the kind of work it points at (inquiry, quote, follow-up, with the sidebar's inbox for inquiries), stat dividers connect through every row, the empty bar track is a visible grey instead of near-black, the service name lost its arrow, and the AI impact card now sets its four stats above the win-rate and readiness bars.
- The analytics aging list colours a bucket by its age rather than by its position among the buckets that have something in them, so a 90-day bucket stays danger-red even when every younger bucket is empty. The funnel's first stage now carries a caption, so every row in the funnel is the same height.
- Redesigned the whole analytics page around one calm, symmetrical layout: a centred 1280px container, a 12-column grid with 16px gaps, 32px between sections, and rows that only ever split 12, 6/6, 4/4/4, or 3/3/3/3 (the KPI strip is six 2-column tiles). Every card now shares one anatomy — title with an optional definition tooltip on the left, a Chart | Table toggle or "View all" on the right, one-line description, body, optional summary footer — and stats inside a card are separated by 1px dividers instead of nested bordered tiles.
- Rebuilt the analytics vocabulary as reusable primitives: `Stat`, `DeltaBadge`, `BarList` (the single horizontal-bar primitive behind funnels, aging, sources, win rate, and usage), `Funnel` (one hue, fading by stage), `AgingList` (accent → warning → danger), `Donut`, `DataTable`, `AttentionList`, `UsageMeter`, `EmptyState`, and one formatter module for currency, percent, duration, and compact numbers.
- Redrew every chart: unsmoothed lines for sparse counts, a soft area fill on the primary series only, the previous period as a 1px dashed neutral line, dots on hover, a shared compact tooltip, 3–4 horizontal gridlines and no axis lines, and a domain taken from the data instead of a fixed 0–4 scale. Revenue is rounded-top bars with the average accepted deal as a thin line.
- Regrouped the analytics tabs into sections: Overview (KPI strip, activity and revenue trends, funnel, quote outcomes) and Live (attention, receivables, plan usage) on the Overview tab; Performance, Audience, and Live on the Performance tab. Acquisition trend is now the Traffic tab of Activity, Campaigns is the Campaigns tab of Traffic sources, and Open quote aging plus Expiring within 7 days are one Open quote backlog card.
- Added the analytics data-visualization tokens (`--chart-series-*`, `--chart-grid`, `--chart-track`, `--chart-tooltip-*`, `--analytics-sparkline-height`) and documented them, with the chart and card rules, in `DESIGN.md`.
- README screenshots are now captured in native Windows Chrome at 2x by `npm run screenshots` (scripts/marketing/capture-readme-screenshots.mjs), so the images render with the same font rasterisation as the landing walkthrough recording; the Playwright capture stays available as `npm run screenshots:fallback`.

- Renamed the analytics entitlements from `analyticsConversion` and `analyticsWorkflow` to `analyticsPerformance` and `analyticsOperations`, and added `analyticsTeam` for Business-only team analytics.

- Simplified local development to two setups: cloud Supabase (`.env.local` + `npm run dev`) and full local (Supabase CLI + `docker compose up --build`). Added `npm run db:local:setup` (migrations + demo seed + local realtime publication/policies), moved ngrok to `npm run dev:tunnel`, removed the local-Postgres-only hybrid path (compose `db` service, native flow docs), made `db:seed` refuse non-local databases, and standardized script/test env loading on `.env.local` then `.env`.
- Rebuilt the marketing hero dashboard preview as a static, pixel-accurate recreation of the real `/home` dashboard at a canonical 1440px desktop reference — real sidebar, topbar, assistant composer, stat cards, and priority queue — replacing the outdated mock, including the hero frame's new 1440:725 crop.
- The marketing hero preview now plays a recorded product walkthrough over that static recreation — autoplaying once in view, pausing off-screen and on hidden tabs, with a hover play/pause control and the static stage as the reduced-motion, unsupported-codec, and no-JavaScript fallback.
- Landing cards — feature previews, workflow steps, why-Requo graphics, and the hero frame — now render flat, with their elevation shadows removed.
- The landing page's "How it works" section is now an auto-advancing stepper: the stage shows the active step's preview while that step's bar fills in primary over five seconds and hands the cycle on to the next column, primary eyebrow labels and single-line titles keep the four columns even, inactive columns keep full-contrast copy (only the label and title tone soften) instead of dimming, clicking a column restarts its bar, and reduced motion keeps the manual stepper with no cycle.

### Removed

- Removed the analytics AI narrative summary card; the rebuilt tabs present the same period data directly.

### Fixed

- The live fallback for un-rolled analytics days no longer drops most of a day's numbers. The per-day metrics used to be joined with a chain of `full outer join`s that all anchored on the form-view date, so a day without a form view was split across several rows and only one of them survived — quotes sent, quotes accepted, and revenue won read as zero. Every metric now joins onto one date spine, so a day always lands on a single row with all of its numbers.
- The live fallback now reads only the days the rollup has not processed, instead of re-reading the whole window on every uncached load and discarding what the rollup already had.
- The daily rollup and the live read path count the same things now: visitors who opened a service form, form views that belong to a form, and live (not deleted) inquiries and quotes. A window that mixes rolled-up and live days no longer plots two definitions of "visitors" on one line. `npm run db:backfill-rollups -- --from=YYYY-MM-DD --to=YYYY-MM-DD` recomputes the days already rolled up.
- "Avg won deal" divides the won value by the quotes won in the period — one population, not a value counted by acceptance date divided by a count counted by send date. The KPI now matches the "Average accepted deal" in the CSV export.
- "First response" no longer averages over answered inquiries only, which made the number look better as the service got worse. The tile now reports how many of the period's inquiries got a reply, and only a real reply (a note, a status change, a quote) counts as one.
- Analytics stat grids follow the card they live in rather than the viewport, so a half-width card no longer squeezes two stats into a narrow column. The container layout is now the default, which keeps a new card from half-applying the fix.
- Analytics trend charts no longer read as flat zero lines when the daily rollup job has not processed the window yet (a seeded workspace, a range that predates the job, a fresh install). The series builder now falls back to the live source tables for the days the rollup is missing, so the trend shows the activity that actually happened.
- The Top customers card now shows won value as currency ("$1,750") instead of the raw cent amount ("175,000").
- Both win-rate definitions now carry their formula in a tooltip: accepted ÷ decided quotes on the KPI tile and the breakdown card, accepted ÷ quotes sent on the service performance table.
- The demo seed now records each inquiry's form view on the same day as the inquiry and adds visitors who browsed the form without inquiring, so the visitor → inquiry funnel reads as a real rate instead of exceeding 100%.
- The analytics funnel states the counts ("9 from 7 visitors") when a stage sits above the one before it, instead of a conversion above 100% that reads as a broken number.
- The dashboard greeting no longer causes a hydration mismatch: the time of day is resolved on the client, so the server's copy and the viewer's copy no longer disagree.
- The mobile top bar's page title is no longer a second `<h1>` on the page — the page keeps the single document heading.
- The model-catalog drift check now loads `.env.local`, so provider keys configured there are compared instead of reported as missing; `CATALOG_DRIFT_ALLOW_MISSING` is documented in `.env.example` for local runs without keys.
- The demo seed no longer fails when it runs over an existing database: a quote that already carries a commercial schedule reuses that schedule instead of orphaning its items.
- The public inquiry browser tests no longer fill the service-category field, which is owned by the service form and is no longer a customer-facing field.
- Dashboard notifications now subscribe with a fresh realtime channel topic on every mount, so an in-flight channel removal can no longer trigger the "cannot add `postgres_changes` callbacks after `subscribe()`" runtime error.
- The inquiry surface resolves the business plan from the subscription instead of the denormalized `businesses.plan` cache, and every subscription status change now rewrites that cache in the same transaction as the subscription row. A business whose subscription lapsed no longer keeps paid inquiry features, and the public form no longer silently discards the answers a visitor gave to fields the plan no longer allows.
- The inquiry acknowledgment email escapes visitor-supplied text. It was the only email template that did not, so a visitor could inject arbitrary HTML into a message sent from the platform's sending domain to an address they chose.
- CSV exports neutralize leading formula characters, so a customer-submitted `=HYPERLINK(...)` in any exported field is treated as text instead of evaluating when the owner opens the file.
- "Select all" on the inquiry list now selects the inquiries that match the current filters, up to the 50-item cap, instead of the handful that happened to be cached. The quotes and invoices bulk bars say "Select all on loaded pages", which is what they actually do.
- The server-action body limit now covers the largest plan attachment size, so the 25 MB and 50 MB upload limits the plans advertise are actually reachable instead of failing with a framework error.
- A deleted inquiry's attachments are no longer downloadable, and the attachment download route is rate limited per business.
- Duplicate detection matches a customer's email address case-insensitively, so the same person submitting `Jane@Example.com` and `jane@example.com` is flagged rather than silently missed.
- The admin inquiry console shows the same status the business sees — `waiting` after 48 hours, `overdue` once the deadline passes — and separates archived inquiries instead of listing them with a stale pipeline status.
- The inquiry status confirmation now reports the status on the badge, so choosing "New" on an inquiry that reads as "Overdue" no longer answers "already New".
- The manual quick-add editor can attach a file, and its multi-select fields now submit the selected options.
- The inquiry CSV export rejects an invalid date range with a clear error instead of a server error, and refuses an export larger than 10,000 rows rather than silently truncating the file.
- The public inquiry honeypot is no longer reachable by a screen reader or filled by browser autofill, so a real customer's inquiry is no longer discarded without a word.
- An inquiry's social contact handle is no longer prefixed with its platform twice, so the profile link in the quote editor points at the right place.

### Cleaned

- Removed the shared `DashboardToolbar` wrapper, which no page used after the analytics toolbar became a bare control row.
- Repo-wide refactor-only cleanup: kebab-case file conventions, hook colocations, dead-link fixes, stricter assistant quote limits, env-validated app URLs, avatar fetch-priority tuning, and open-source readiness files. No product behavior changes.
