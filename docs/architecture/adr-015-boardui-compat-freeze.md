# ADR 015: BoardUI Compat Freeze

**Status**: Superseded
**Date**: 2026-09-22
**Deciders**: Owner + implementation team
**Context**: Issue #73 — BoardUI / shadcn duality; `DESIGN.md` Known inconsistencies; `docs/technical-debt.md` §3

> **Superseded.** The freeze ended when all 40 BoardUI modules were recreated
> 1:1 under `components/shared/*` and the legacy `components/base/` +
> `components/application/` + `components/foundations/` trees were deleted.
> Current guidance lives in `DESIGN.md` and `docs/technical-debt.md` §3.

---

## Context

Two component systems coexist: `components/base/*` (15 dirs) + `components/application/` + `components/foundations/` alongside canonical `components/ui/*` (40 files). Guidance conflicted: `DESIGN.md` says canonical = Requo UI (`ui/*` + `shared/*`), while `.agents/skills/boardui/SKILL.md` + `.cursor/rules/boardui.mdc` said "prefer `base/`/`application/`".

Reachability (grep-verified) shows the BoardUI layer is live, not dead: app-wide `toast`/`Toaster` via `base/notification` (30+ call sites, re-exported by `ui/sonner`), `base/breadcrumb` (shell + settings + admin, no `ui/` equivalent), `base/tabs` (settings tabs), `application/dashboard/*` (sidebar shell, team/user menus, stat-cards), `application/agent-thinking` (chat status line), `application/theme/theme-toggle`, `application/settings/*` (via `SettingsModal` from sidebar), `foundations/icons` (shared chevrons). All other `base/*` dirs are transitive deps of these.

Full purge breaks shell/toast with no migration plan; doc-only leaves the parallel system inviting new uses.

## Decision

Freeze BoardUI as compat shims; keep Requo UI canonical:

- Keep the live list above as frozen shims — no new product imports, no new `boardui add` installs.
- New UI builds only on `components/ui/*` + `components/shared/*` per `DESIGN.md`.
- Freeze `app/globals.css` BoardUI compat (tone aliases, composite type ramp, agent-thinking + chart-card blocks) — do not expand to the full BoardUI ramp.
- Rewrite guidance: `boardui.mdc` + `boardui/SKILL.md` point at `DESIGN.md`/Requo UI; `base/`+`application/` marked frozen.
- Per-component table lives in `DESIGN.md` Known inconsistencies (this ADR is the why).

## Rationale

1. **Smallest safe diff.** Deleting live shell/toast is a migration project, not a cleanup; freezing stops drift today.
2. **Guidance is the fix.** Code deletions alone don't stop new parallel patterns — the prefer-BoardUI rule did the inviting.
3. **No false precision.** Counts corrected (15 dirs / 40 files, not 16 / 39); issue evidence noting "only 3 tokens" is stale.

## Consequences

- Positive: new contributions have one system; frozen shims are greppable and documented.
- Positive: future migrations (e.g. `base/tabs` → `ui/tabs`, toast off BoardUI) become dedicated, testable refactors.
- Negative: authors must learn the freeze boundary; audits whitelist `base/`+`application/` so regressions fail loudly only via review + `DESIGN.md`.
- Negative: dual-system maintenance cost remains until migrations land.

## Alternatives considered

- **Full purge of `base/`+`application/`+`foundations/`.** Rejected: breaks live importers listed above; needs per-surface migrations first.
- **Doc-only, no guidance change.** Rejected: leaves the prefer-BoardUI rule active, guaranteeing new parallel patterns.
