# Changelog

All notable changes to this project are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Changed

- Simplified local development to two setups: cloud Supabase (`.env.local` + `npm run dev`) and full local (Supabase CLI + `docker compose up --build`). Added `npm run db:local:setup` (migrations + demo seed + local realtime publication/policies), moved ngrok to `npm run dev:tunnel`, removed the local-Postgres-only hybrid path (compose `db` service, native flow docs), made `db:seed` refuse non-local databases, and standardized script/test env loading on `.env.local` then `.env`.

### Cleaned

- Repo-wide refactor-only cleanup: kebab-case file conventions, hook colocations, dead-link fixes, stricter assistant quote limits, env-validated app URLs, avatar fetch-priority tuning, and open-source readiness files. No product behavior changes.
