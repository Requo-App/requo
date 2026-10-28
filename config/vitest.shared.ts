/**
 * Shared Vitest configuration constants.
 *
 * Keep this module framework-agnostic (no imports, no side effects) so both
 * `config/vitest.config.ts` and `config/vitest.integration.config.ts` can
 * consume it without dragging jsdom-only or node-only dependencies across
 * tiers.
 *
 * Coverage excludes cover:
 * - `tests/**`       — the test tree itself (fixtures, helpers, specs)
 * - `config/**`      — tool configs and shared config constants
 * - `**\/*.config.*` — runner, lint, build, and tooling configs
 * - `**\/layout.tsx` — Next.js layout files (structural, not product logic)
 * - `**\/page.tsx`   — Next.js page files (thin route shells)
 */
export const COVERAGE_EXCLUDES: readonly string[] = [
  'tests/**',
  'config/**',
  '**/*.config.*',
  '**/layout.tsx',
  '**/page.tsx',
];
