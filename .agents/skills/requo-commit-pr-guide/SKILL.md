---
name: requo-commit-pr-guide
description: Requo branch, commit, push, and pull request conventions — branch prefixes, Conventional Commits with scopes and why-bodies, staging hygiene, the verification tiers, and the PR body template. Use whenever creating or naming a branch or worktree, staging or committing changes, writing or amending a commit message, pushing, or opening or updating a pull request in this repository, even when the user only says "commit this" or "open a PR".
license: MIT
metadata:
  author: requo
  version: "1.0.0"
---

# Requo Commit & PR Guide

## Overview

How work lands in `main`: one logical change per branch, Conventional Commit
subjects, honest verification notes, and PR bodies filled from
`.github/PULL_REQUEST_TEMPLATE.md`. Recent `git log` is the style source of
truth; this guide summarizes it.

## When to Use

Load before creating or naming a branch/worktree, staging or committing
changes, amending a commit, pushing, or opening/updating a pull request. Pair
with `requo-repo-guide` when the change touches code — code rules and the full
verification matrix live there.

## Golden Path

```
1. git fetch origin && git switch -c <type>/<summary> origin/main
2. Implement; run the checks for the change tier (see Verification)
3. git add <paths>; git diff --staged — review exactly what will land
4. git commit -m "<type>(<scope>): <imperative summary>" (why-body when non-obvious)
5. git push -u origin <branch>
6. gh pr create --title "<same as commit subject>" --body-file <filled template>
7. Report the PR URL plus exact results: what passed, what was not run, and why
```

## Branches

- Name: `<type>/<kebab-case-summary>`. Examples from history: `fix/ci-workflow`,
  `chore/local-dev-setup`, `style/marketing-nav-hover`,
  `security/dependency-fixes`.
- `type` is a commit type: `feat`, `fix`, `chore`, `docs`, `refactor`, `style`,
  `test`.
- Branch from up-to-date `origin/main`. One logical change per branch and PR.
- Never commit directly to `main`. If changes were made on `main`, move them to
  a branch before committing.
- After the PR merges, delete the branch (`git branch -d …`,
  `git push origin --delete …`) unless asked otherwise.

## Commits

Format: `<type>(<scope>): <imperative summary>` (Conventional Commits).

- Subject: imperative mood, lowercase, no trailing period, ≤ ~72 characters.
- Scope is optional but preferred when it names the area. Scopes in use:
  `marketing`, `dev`, `ci`, `skills`, `ui`, `auth`, `billing`, `email`,
  `supabase`, `seo`, `api`, `admin`, `domain`, `shell`, `ai-chat`, `actions`,
  `validation`, `repo`, `e2e`, `checkout`, `cleanup`.
- Body: blank line after the subject, explain **why** and non-obvious choices,
  wrap ~72 chars, bullets for multi-part changes. Skip it only when the change
  is self-evident.
- Do **not** add `(#NN)` yourself — squash merge appends the PR number.
- Do **not** add tool/AI attribution unless the user asks.
- One logical change per commit. While the branch is unpushed, `git commit
  --amend` keeps it clean; once it is pushed to a shared branch, add commits
  instead of force-pushing.

Example from history:

```
fix(marketing): refine the header nav dropdown card motion

Match the app's menu surfaces when the card opens — fade + 4% settle +
0.5rem drop — shortened to 100ms so it stays snappy. Drop the card's
1px ring, and morph between triggers: the content swaps in place while
the viewport transitions its width/height …
```

## Staging Hygiene

- Stage the paths you changed; never `git add -A` / `git add .` on a tree with
  unrelated or user work in progress.
- Never stage secrets: `.env*` is gitignored except `.env.example` — keep it
  that way. Generated output (`.next/`, `reports/`, `screenshots/`) stays out.
- DB changes: `npm run db:generate` then commit `lib/db/schema/` + `drizzle/`
  together. Never rewrite committed migrations — generate a new one.
- Include the tests/docs the change needs; don't defer them to a follow-up
  unless the user asks. Notable user-visible changes get an entry under
  `## [Unreleased]` in `CHANGELOG.md` (Keep a Changelog format).

## Verification

Run the narrowest tier that proves the change; the full matrix is in
`requo-repo-guide` → `references/workflows.md`.

| Change | Run |
|---|---|
| Docs-only | Read the edited files + targeted greps |
| Most code | `npm run check` (lint + typecheck + audits + model catalog) |
| Logic, validation, components | + `npm run test` |
| Server actions, routes, authz, billing, DB | + `npm run test:integration` |
| Routes, layouts, system wiring | + `npm run build` |
| Covered browser journeys | relevant `npm run test:e2e:smoke` |

- Never claim a command passed unless it ran in this session. State partial
  results, environmental blockers, and pre-existing failures explicitly.
- Re-run affected checks after resolving rebase conflicts.

## Pull Requests

- Base `main`. The PR title uses Conventional Commit style (same as the commit
  subject) — it becomes the squash commit on `main`.
- Body: fill `.github/PULL_REQUEST_TEMPLATE.md`, keeping `## Summary`,
  `## Verification`, and `## Docs`. Tick a box only when the step was actually
  done; for skipped steps leave it unticked and say why (recent PRs do this).
- `## Summary`: what changed and why, key files/areas to review, behavior
  changes or risks.
- `## Verification`: exact commands and results — including failures,
  environmental blockers, and whether a failure is pre-existing on `main`.
- `## Docs`: files updated, or the reason no docs change is needed.
- Publish with `gh pr create --title "…" --body-file <file>`; edit later with
  `gh pr edit`. Verify what landed with `gh pr view --json title,body`.
- Link issues with `Closes #N` / `Refs #N` only when the user gave real numbers.
- Don't open a PR from a behind or dirty branch: push first, rebase on
  `origin/main` if needed, and re-run affected checks.
- New review fixes go in new commits on a shared branch.

PR body template:

```markdown
## Summary

<What changed and why; key files/areas; behavior changes and risks.>

## Verification

- [x] `npm run check` — <result>
- [x] `npm run test` — <result>
- [ ] `npm run test:integration` (not applicable — <reason>)
- [ ] `npm run build` (not run — <reason>)

## Docs

- [x] Updated `docs/…` — <what>
- [ ] No docs changes needed (<reason>)
```

## Red Flags — STOP

| Excuse | Reality |
|---|---|
| "Docs-only, so no checks" | Read the diff and grep every path/command you wrote |
| "Tests probably pass" | Run them, or say "not run" with the reason — never claim a pass |
| "I'll add `(#NN)` to the subject" | Don't; squash merge appends it |
| "`git add -A` is faster" | Stage only your paths; protect unrelated working-tree changes |
| "I'll fix the migration in place" | Never rewrite committed migrations; generate a new one |
| "Commit to `main`, branch later" | Branch first; one logical change per branch/PR |
| "Force-push the PR branch to clean up" | Only if the user asks and the branch is yours/unshared; otherwise add commits |
| "The user just said 'commit'" | Load this guide anyway; the conventions apply by default |
