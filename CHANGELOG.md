# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

- Rebuilt business analytics as four tabs — Overview, Performance, Operations, and Team — with fresh KPI, funnel, trend, money, attention, usage, timing, cohort, benchmark, and member-workload sections. Free plans see a fixed last-30-days Overview with real numbers; Pro plans unlock 7/30/90-day and 12-month/custom ranges plus Performance and Operations; Business plans add all-time history and team analytics. Locked tabs show static previews and their premium queries never run.
- Rebuilt analytics CSV export with summary and daily-series scopes, and re-resolve the date range and plan entitlement on the server so export cannot bypass the picker's range cap.
- Added goals, tracking annotations, and scheduled reports to the analytics reports surface, including a recipient cap of one for Pro and five for Business.

### Changed

- Renamed the analytics entitlements from `analyticsConversion` and `analyticsWorkflow` to `analyticsPerformance` and `analyticsOperations`, and added `analyticsTeam` for Business-only team analytics.

- Simplified local development to two setups: cloud Supabase (`.env.local` + `npm run dev`) and full local (Supabase CLI + `docker compose up --build`). Added `npm run db:local:setup` (migrations + demo seed + local realtime publication/policies), moved ngrok to `npm run dev:tunnel`, removed the local-Postgres-only hybrid path (compose `db` service, native flow docs), made `db:seed` refuse non-local databases, and standardized script/test env loading on `.env.local` then `.env`.
- Rebuilt the marketing hero dashboard preview as a static, pixel-accurate recreation of the real `/home` dashboard at a canonical 1440px desktop reference — real sidebar, topbar, assistant composer, stat cards, and priority queue — replacing the outdated mock, including the hero frame's new 1440:725 crop.
- The marketing hero preview now plays a recorded product walkthrough over that static recreation — autoplaying once in view, pausing off-screen and on hidden tabs, with a hover play/pause control and the static stage as the reduced-motion, unsupported-codec, and no-JavaScript fallback.
- Landing cards — feature previews, workflow steps, why-Requo graphics, and the hero frame — now render flat, with their elevation shadows removed.
- The landing page's "How it works" section is now an auto-advancing stepper: the stage shows the active step's preview while that step's bar fills in primary over five seconds and hands the cycle on to the next column, primary eyebrow labels and single-line titles keep the four columns even, inactive columns keep full-contrast copy (only the label and title tone soften) instead of dimming, clicking a column restarts its bar, and reduced motion keeps the manual stepper with no cycle.

### Removed

- Removed the analytics AI narrative summary card; the rebuilt tabs present the same period data directly.

### Cleaned

- Repo-wide refactor-only cleanup: kebab-case file conventions, hook colocations, dead-link fixes, stricter assistant quote limits, env-validated app URLs, avatar fetch-priority tuning, and open-source readiness files. No product behavior changes.
