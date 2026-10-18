# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- Simplified local development to two setups: cloud Supabase (`.env.local` + `npm run dev`) and full local (Supabase CLI + `docker compose up --build`). Added `npm run db:local:setup` (migrations + demo seed + local realtime publication/policies), moved ngrok to `npm run dev:tunnel`, removed the local-Postgres-only hybrid path (compose `db` service, native flow docs), made `db:seed` refuse non-local databases, and standardized script/test env loading on `.env.local` then `.env`.
- Rebuilt the marketing hero dashboard preview as a static, pixel-accurate recreation of the real `/home` dashboard at a canonical 1440px desktop reference — real sidebar, topbar, assistant composer, stat cards, and priority queue — replacing the outdated mock, including the hero frame's new 1440:725 crop.
- The marketing hero preview now plays a recorded product walkthrough over that static recreation — autoplaying once in view, pausing off-screen and on hidden tabs, with a hover play/pause control and the static stage as the reduced-motion, unsupported-codec, and no-JavaScript fallback.
- Landing cards — feature previews, workflow steps, why-Requo graphics, and the hero frame — now render flat, with their elevation shadows removed.

### Cleaned

- Repo-wide refactor-only cleanup: kebab-case file conventions, hook colocations, dead-link fixes, stricter assistant quote limits, env-validated app URLs, avatar fetch-priority tuning, and open-source readiness files. No product behavior changes.
