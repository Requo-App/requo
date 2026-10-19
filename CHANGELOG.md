# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Rebuilt business analytics as four tabs — Overview, Performance, Operations, and Team — with fresh KPI, funnel, trend, money, attention, usage, timing, cohort, benchmark, and member-workload sections. Free plans see a fixed last-30-days Overview with real numbers; Pro plans unlock 7/30/90-day and 12-month/custom ranges plus Performance and Operations; Business plans add all-time history and team analytics. Locked tabs show static previews and their premium queries never run.
- Rebuilt analytics CSV export with summary and daily-series scopes, and re-resolve the date range and plan entitlement on the server so export cannot bypass the picker's range cap.
- Added goals, tracking annotations, and scheduled reports to the analytics reports surface, including a recipient cap of one for Pro and five for Business.

### Changed

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

### Cleaned

- Repo-wide refactor-only cleanup: kebab-case file conventions, hook colocations, dead-link fixes, stricter assistant quote limits, env-validated app URLs, avatar fetch-priority tuning, and open-source readiness files. No product behavior changes.
