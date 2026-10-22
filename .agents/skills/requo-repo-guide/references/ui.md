# UI System

## Contents

- Tokens and utilities
- Shared wrappers and composition
- Lists, tables, forms
- Status color (single home)
- Spacing, radius, motion
- Dashboard rendering (`instant` + Suspense)
- Loading skeletons
- Optimistic CRUD
- Tours
- Audits

## Tokens and utilities

`DESIGN.md` is canonical; `app/globals.css` implements tokens. Prefer semantic tokens over raw palette:

- `surface-*` cards/panels/shells, `control-*` interactive states, `overlay-*` dialog/sheet/select/popover, `table-*` row states, `sidebar-*` nav, `meta-label` 11px eyebrow/filter labels, `hero-panel`/`section-panel`/`soft-panel` shared surfaces.
- State: `destructive` errors, `ring` focus, `--success`/`--warning`/`--info` globals. Never `text-emerald-*`/`bg-amber-*` in feature code.
- Never `!important` color overrides to win the cascade; give the custom class a colorless variant instead.

## Shared wrappers and composition

Reuse before custom markup: `components/ui/*` primitives, `components/shared/*` compositions (`page-header.tsx`, `form-layout.tsx`, `dashboard-layout.tsx`, `status-badge.tsx`, `data-list-toolbar.tsx`, `server-action-button.tsx`), `components/shell/*` navigation/shell.

Standard compositions:

```tsx
<DashboardPage>
  <PageHeader eyebrow="Inquiries" title="Customer requests" actions={<ListHeaderActions />} />
  <div className="dashboard-table-shell" data-list-card>
    <Suspense fallback={<ListControlsFallback />}><ListControlsRegion /></Suspense>
    <Suspense fallback={<ListContentFallback />}><ListContentRegion /></Suspense>
  </div>
</DashboardPage>
```

```tsx
<FormSection title="Business details" description="...">
  <FieldGroup>
    <Field data-invalid={Boolean(err)}>
      <FieldLabel htmlFor="business-name">Business name</FieldLabel>
      <FieldContent><Input id="business-name" aria-invalid={Boolean(err)} /></FieldContent>
      <FieldError>{err}</FieldError>
    </Field>
  </FieldGroup>
  <FormActions><Button type="submit">Save</Button></FormActions>
</FormSection>
```

List pages drop the `PageHeader` description; settings/detail pages keep it. Buttons: loading is `disabled` + `Spinner`, label stays; icon-only needs `sr-only` text.

## Lists, tables, forms

- `DataListToolbar` is the composed list toolbar (search, filters, clear, count as muted text); `DashboardToolbar` is only the bare `toolbar-panel` shell. Filter strip merges into the results card header (`data-list-toolbar-strip`); table wrapper has no padding so rows sit edge to edge.
- Desktop filter labels visually hidden (placeholders hint, accessible names kept); mobile filters move into a `Sheet`.
- Tables in `DashboardTableContainer`; rows 52px pitch, two lines (name + email disambiguator). Mobile uses `mobile-record-row` with the same hierarchy/tokens.
- Detail pages: `DashboardDetailLayout` + `DashboardSidebarStack`; actions in `DashboardActionsRow`.

## Status color (single home)

`components/shared/status-badge.tsx` owns color: pick a `StatusTone`, render `StatusBadge`. Never write status color in feature code; extend only via an exhaustive per-domain `Record<Enum, StatusTone>` (new enum member fails typecheck). `Badge variant="status"` is the colorless shell — do not use it directly. Enforced by `audit:status-tokens`.

## Spacing, radius, motion

- `gap-*` only; never `space-y-*`/`space-x-*` in new work. Page sections `gap-6`; shell `dashboard-main px-3 py-4 sm:px-5 sm:py-5 xl:px-6 xl:py-6`.
- Panel padding is baked in: `section-panel` (`px-4 py-4 sm:px-5 sm:py-5`), `soft-panel` (`px-4 py-4`). Do not re-declare padding on the same attribute — silently ignored, fails `audit:density`. Opt out with `data-padding="none"`.
- One radius `--radius` 8px: `rounded-lg` controls, `rounded-xl` cards/sections/overlays; `rounded-full` pills/avatars only. Never `rounded-2xl+`/arbitrary. Enforced by `audit:radius`.
- Motion tokens `--motion-duration-*`/`--motion-ease-*`; subtle lift/opacity only; keep `prefers-reduced-motion` fallbacks.

## Dashboard rendering (`instant` + Suspense)

Every dashboard page: `export const instant = true`, synchronous shell, dynamic reads only in `<Suspense>` children. Never `instant = false` to silence a failure — use `lib/instant-navigation/escape-hatch-registry.ts` (currently empty). Detail pages stage frame-first: cheap `*DetailCore` row in the frame (`notFound()` here), one boundary per feed, `RegionErrorBoundary` where a feed can fail alone. Same tags/`cacheLife` as the aggregate query so invalidation is untouched. See `docs/architecture/instant-navigation.md`.

## Loading skeletons

`loading.tsx` mirrors its page's static shell: same `PageHeader` copy, tab bars, column counts, section order; changes ship in the same commit. Reuse colocated `*Fallback` exports and `components/shell/` + `components/shared/` skeletons; new shared skeleton only when 2+ routes need it.

## Optimistic CRUD

Shared stack for dashboard create/update/delete:

- Lists: `hooks/use-animated-list.ts` + `.motion-list-item`/`data-motion-state`.
- Toggles/kanban: `useOptimistic` or `hooks/use-optimistic-mutation.ts`.
- Forms/buttons: `components/shared/server-action-button.tsx`; prefer `useDeferredRefresh()` over immediate `router.refresh()`.
- Temp IDs: `lib/optimistic/id.ts` (`createOptimisticId`, `isOptimisticId`).

Flow: optimistic update in `startTransition` → await existing Server Action → on success replace temp `entity.id` + deferred refresh → on failure revert + `toast.error`, no refresh. Server cache-tag invalidation unchanged.

## Tours

Two tours, keep in sync with the surface:

- Dashboard (`features/onboarding/components/dashboard-tour.tsx`): sidebar order Home, Inquiries, Quotes, Follow-ups, Assistant, Services, Quote library, Members, Analytics; deep-dives sit beside their nav item; previews in `tour-modal.tsx`.
- Form editor (`form-editor-tour.tsx`): mirrors Service editor tabs Form | Service page | Settings.

## Audits

`npm run check:seo` runs `audit:loading-coverage`, `audit:image-*`, `audit:metadata-uniqueness`, `audit:use-cache-purity`, `audit:use-client-placement`, `audit:next-dynamic-comments`, `audit:instant-navigation`, `audit:density`, `audit:radius`, `audit:status-tokens`.
