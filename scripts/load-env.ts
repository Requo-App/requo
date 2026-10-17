/**
 * scripts/load-env.ts
 *
 * Loads `.env.local` first, then `.env` as a fallback, for TypeScript scripts
 * that run outside Next.js (which only auto-loads `.env.local` for the app).
 * Command-line environment variables always win — dotenv never overrides an
 * existing `process.env` value.
 *
 * Import for side effects before any module that reads `process.env`:
 *   import "./load-env";
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();
