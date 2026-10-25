# Instant Navigation

How authenticated dashboard navigation works in Requo without waiting for server roundtrips.

## The Problem

Before this system, every authenticated page awaited `params`, `getAppShellContext()` (session + business context), and often additional queries **above the return statement**. On a client-side navigation between sibling dashboard routes (e.g. inquiries → quotes), the router had to wait for a full server roundtrip before painting anything beyond `loading.tsx`. Users saw a skeleton then waited — navigation felt slow.

Three root causes:

1. **Validation globally disabled.** Every page exported the legacy `unstable_instant` config with `unstable_disableValidation: true`, turning off the build-time check that verifies routes produce an instant static shell. (The installed Next.js 16.4 supports the `instant` export; the repo has been migrated.)
2. **Pages block on dynamic data above the return.** The awaits for session, params, and queries sat above `return`, so `<Suspense>` boundaries inside the JSX never reached the prefetchable static shell.
3. **Unbounded router stale times.** `experimental.staleTimes` was set to 24 hours for both dynamic and static segments.

## How It Works Now

### The Static Shell Model

With Cache Components enabled, Next.js produces a **static shell** for each route — the UI it can paint immediately on a client navigation before any dynamic data streams in. Anything that suspends (awaiting params, reading cookies/headers, awaiting uncached data) must sit inside a `<Suspense>` boundary, or it blocks navigation.

The key insight: validation checks **every shared-layout entry point**, not just the initial page load. On a sibling navigation (e.g. `inquiries` → `home`), only the page segment re-renders. A `<Suspense>` above the shared layout is invisible to that navigation.

### Page Structure

Every authenticated dashboard page follows this pattern:

```tsx
// Route segment config — opts into instant validation (dev overlay).
// With `experimental.instantInsights.validationLevel: "manual-warning"`,
// only segments that export `instant` are validated.
export const instant = true;

// Page function is SYNCHRONOUS — returns immediately
export default function SomeDashboardPage({ params, searchParams }) {
  return (
    <DashboardPage>
      <PageHeader title="..." description="..." />

      <Suspense fallback={<ControlsSkeleton />}>
        <ControlsRegion params={params} searchParams={searchParams} />
      </Suspense>

      <Suspense fallback={<ListSkeleton />}>
        <ListRegion params={params} searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

// Dynamic reads live in async child server components, BELOW Suspense
async function ListRegion({ params, searchParams }) {
  const { businessSlug } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const items = await getCachedListForBusiness(businessContext.business.id);
  return <List items={items} />;
}
```

What the user experiences:

1. **Click a link** → the structural shell (headers, skeletons, layout chrome) paints in <100ms from the client cache.
2. **Cached data streams in** → list/detail content appears almost instantly from the two-layer cache.
3. **Live data streams behind its own boundary** → genuinely fresh data resolves separately.

### Detail Page Staging (Frame First, Feeds Streamed)

List pages were the easy case: their headers are static, so one boundary per
region was enough. Detail pages were not. Each one resolved a single aggregate
query (`getInquiryDetailForBusiness`, `getQuoteDetailForBusiness`,
`getInvoiceForBusiness`) that returned the row plus every feed, and rendered it
behind one whole-page skeleton. The route painted *nothing* — not the quote
number or the customer name it had already fetched — until items, notes,
attachments, payments, and customer history had all resolved.

The pattern now is **one cheap identity read in the frame, one boundary per
feed**. Use distinct error messages for failed feeds and keep loading skeletons
in `Suspense` fallbacks, as illustrated for customer history and follow-ups below:

```tsx
export default function QuoteDetailPage({ params }: QuoteDetailPageProps) {
  return (
    <Suspense fallback={<DashboardDetailPageSkeleton variant="quote" />}>
      <QuoteDetailRegion params={params} />
    </Suspense>
  );
}

async function QuoteDetailRegion({ params }: QuoteDetailPageProps) {
  const { businessSlug, id } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const quote = await getQuoteDetailCoreForBusiness({ businessId, quoteId: id });
  if (!quote) notFound();

  return (
    <>
      {/* Header, meta badges, and manage/export actions — core row only */}
      <DashboardDetailHeader
        eyebrow="Quote"
        title={quote.title}
        meta={<QuoteStatusBadge status={quote.status} />}
        actions={<QuoteManageActions quote={quote} />}
      />

      {/* Editor payload: items, pricing library, revision feedback */}
      <Suspense fallback={<DashboardQuoteEditorSkeleton />}>
        <QuoteEditorRegion businessId={businessId} quote={quote} />
      </Suspense>

      <RegionErrorBoundary
        fallback={<DetailSectionErrorFallback title="Customer history" />}
      >
        <Suspense fallback={<QuoteCustomerHistoryFallback />}>
          <QuoteCustomerHistoryRegion businessId={businessId} quoteId={quote.id} />
        </Suspense>
      </RegionErrorBoundary>

      <RegionErrorBoundary
        fallback={<DetailSectionErrorFallback title="Follow-ups" />}
      >
        <Suspense fallback={<FollowUpPanelFallback />}>
          <QuoteFollowUpsRegion businessId={businessId} quoteId={quote.id} />
        </Suspense>
      </RegionErrorBoundary>
    </>
  );
}
```

Rules that keep the split honest:

- **The frame query returns only what the header and its links need.** That is
  the `*DetailCore` type (`InvoiceDetailCore`, `DashboardInquiryDetailCore`,
  `DashboardQuoteDetailCore`) or a purpose-built identity slice
  (`getServiceHeaderForBusiness` on the service editor). It is a
  single indexed row fetch — never a join fan-out.
- **A feed the header itself depends on resolves with the frame.** The inquiry
  detail frame loads its related quotes alongside the core row, because the
  header's primary action switches on whether the inquiry already has quotes.
  The heavier feeds stay behind their own boundaries.
- **`notFound()` belongs in the frame.** That is the 404 decision. A feed query
  returning null afterwards is a race guard, not a routing decision.
- **Regions stay independent.** A section that needs the core row re-reads it
  rather than receiving it through props (the invoice status tiles do this); the
  `"use cache"` / `React.cache()` layer makes the repeat read free, and no region
  depends on another having resolved first.
- **Every feed gets its own `<Suspense>`**, and a `<RegionErrorBoundary>` only
  where the feed has a fallback that communicates the failure. Use the shared
  `DetailSectionErrorFallback` / `RegionErrorState` (or the admin equivalents)
  so the failure names the section and offers retry. A whole-page surface
  (new/edit forms, service editor) leaves failures to the segment `error.tsx`
  retry card instead: a skeleton fallback made a thrown region look like a page
  that never finished loading.
- **Keep the aggregate queries.** `getInquiryDetailForBusiness`,
  `getQuoteDetailForBusiness`, and `getInvoiceForBusiness` are still consumed by
  print routes, the public preview, export API routes, and quote/invoice
  actions. The split *adds* core and feed queries alongside them; it does not
  replace them.
- **Feed queries repeat the frame's cache contract** — `"use cache"`,
  `cacheLife(hotBusinessCacheLife)`, and the same tag helper
  (`getBusinessQuoteDetailCacheTags`, `getBusinessInvoiceDetailCacheTags`,
  which include the record-scoped `business:<id>:quote:<id>` tag) — so
  `updateTag`/`revalidateTag` invalidation keeps working untouched.
- **`loading.tsx` still mirrors the static shell**: the same header copy and
  region order the staged page paints.

Staged detail routes today:

| Route | Frame read | Feeds (each its own boundary) |
|---|---|---|
| `inquiries/[id]` | `getInquiryDetailCoreForBusiness` (+ related quotes, header action) | attachments, notes, activity, customer history, follow-ups, duplicate banner |
| `quotes/[id]` | `getQuoteDetailCoreForBusiness` | editor payload (items, pricing library, revision feedback), preview items, activity, customer history, revisions, follow-ups |
| `invoices/[invoiceId]` | `getInvoiceDetailCoreForBusiness` | status tiles (core re-read), line items, payments |
| `services/[serviceSlug]` | `getServiceHeaderForBusiness` | editor tabs payload (normalized form/page configs, form + inquiry counts) |

Deliberately not staged: `assistant/chat/[sessionId]` is a pure `redirect()`, and
`quotes/[id]/preview`, `invoices/[invoiceId]/edit`, `preview/*`, and `print/*`
are single-payload surfaces where a split would be cosmetic. Staging and
validation scope are separate: authenticated previews such as
`quotes/[id]/preview` still export `instant` and belong to
`IN_SCOPE_ROUTES`.

The admin console uses the same shape with its own fallbacks
(`features/admin/components/admin-detail-section-fallback.tsx`) and its
per-view `getAdmin*DetailCore` queries.

### Admin Console Parity

The `/admin` console follows the same model. Its layout (`app/admin/layout.tsx`)
is synchronous and renders `AdminShell` instantly from static navigation data
(`features/admin/navigation.ts` derives the rail and breadcrumbs from
`usePathname()` alone); the admin session resolves in Suspense-wrapped user-menu
slots (`UserMenuSkeleton` / `MobileUserMenuSkeleton` fallbacks), mirroring how
`(main)/layout.tsx` streams its user menu. Every console page is a synchronous
shell (`DashboardPage` + `PageHeader`) with per-region Suspense boundaries, and
the `view.*` audit row is written once from the primary content region via
`withAdminViewLog` — the same rows as before, recorded just after the shell
paints instead of before. The per-request `cache()` on the admin role check
(`features/admin/access.ts`) keeps the gate's database lookup to one per
request no matter how many slots and regions re-check it.

### Router Cache (Stale Times)

```ts
// next.config.ts
cacheComponents: true,
partialPrefetching: true, // each <Link> prefetches its route's App Shell
experimental: {
  staleTimes: {
    dynamic: 60,   // seconds — dynamic RSC payloads reuse for back/forward
    static: 180,   // seconds — static shell segments reuse
  },
}
```

- Within the stale window, back/forward navigation renders from the client cache with no network request.
- Past the window, the segment refetches from the server.
- A `revalidateTag` call from a mutation causes the next navigation to serve fresh data regardless of the stale window.

### Cache Invalidation

Mutations continue to invalidate via cache tags after a successful persist:
per-feature `updateCacheTags` helpers (wrapping `updateTag` from `next/cache`)
alongside `revalidateTag`, using the tag helpers in `lib/cache/`. The framework's prefetch-invalidation silently refreshes associated prefetches, so the next navigation serves the mutated data.

No new invalidation primitives were introduced.

## Validation

### Build-time (`npm run build`)

With Cache Components enabled, the build verifies each page produces a
non-empty static shell. Validation of instant navigation itself runs in
development (see below): it simulates client navigations from every
shared-layout entry point for each route. If a component blocks (awaits
without being inside Suspense), the dev overlay names the page and
component.

### Dev-time

With `experimental.instantInsights.validationLevel: "manual-warning"`
(`next.config.ts`), only segments that export `instant` are validated, and the
dev overlay surfaces which routes pass or fail during development.

### CI

`npm run check` (lint + typecheck + SEO audits) and `npm run build` both pass with zero errors. `check:seo` runs both instant-navigation scripts:

- `audit:instant-navigation` (`scripts/audit-instant-navigation.ts`) verifies every in-scope route either has validation enabled or a valid escape-hatch entry, rejects scope drift (a page exporting `instant` outside `IN_SCOPE_ROUTES`), and audits the whole escape-hatch registry.
- `audit:instant-navigation-coverage` (`scripts/instant-navigation/check-coverage.ts`) reports per-route coverage and repeats the registry-wide validation.

Both parse route exports with the TypeScript compiler, so a commented-out export cannot satisfy the check and object-form opt-outs (`unstable_disableValidation`, `unstable_disableDevValidation`, `unstable_disableBuildValidation`) count as disabled.

Production builds keep the instant-navigation testing API off unless a dedicated test build sets `EXPOSE_TESTING_API=1` (see `.env.example`). Dev exposes it automatically.

## Error Handling

### Region-level failures

Each data-dependent region streams behind its own `<Suspense>`. A feed is additionally wrapped in `<RegionErrorBoundary>` when its failure can be shown in place:

```tsx
<RegionErrorBoundary fallback={<ErrorIndication />}>
  <Suspense fallback={<Skeleton />}>
    <DataRegion params={params} />
  </Suspense>
</RegionErrorBoundary>
```

If the child throws, only that region shows the error fallback. The structural shell and sibling regions stay rendered.

`RegionErrorBoundary` is built on Next's `catchError`, not a hand-written class boundary. That matters for two framework contracts:

- `notFound()` and `redirect()` are thrown control flow. `catchError` rethrows them to Next's router, so an unknown invoice, a non-draft edit URL, or a role redirect is not swallowed into a region fallback.
- The error state clears on client navigation, so moving from one record to another does not keep the previous record's fallback on screen.

Section fallbacks render `RegionErrorState`, which exposes `role="alert"` plus a retry button; header fallbacks put the same retry button in their action slot. Retry calls Next's `retry()`, which refreshes the router and re-renders the region.

Do not wrap a whole detail page in `RegionErrorBoundary` with a loading skeleton as the fallback: a thrown frame then renders as a skeleton forever. Whole-page failures reach `app/(business)/[businessSlug]/(main)/error.tsx`, which renders the retryable "This view did not load" card.

### Authorization

`getAppShellContext` still calls `redirect()` for non-members and unauthenticated users. The redirect fires from inside the Suspense child — no business-scoped content is emitted before the redirect.

### Cold cache

When no cached content exists yet, regions render skeleton placeholders until content resolves. No error state.

## Escape Hatches

Some routes genuinely cannot pass validation (e.g. layouts with
cookie-based redirects that always fire during build). These get a tracked
exemption:

- **Registry:** `lib/instant-navigation/escape-hatch-registry.ts`
- **Validator:** `lib/instant-navigation/escape-hatches.ts`

Each entry carries `route`, `reason`, `targetReviewDate`, and `active`. The coverage check rejects any page that lacks both validation and a valid registry entry. A registry-wide audit validates dormant entries too, rejects duplicate route keys, and fails when an active entry passes its `targetReviewDate`.

Current state: the registry is empty — all 20 admin console pages ship `instant` config blocks after the Better Auth migration (see the registry file comment), so no route requires an exemption. The admin layout keeps `instant = false` for its blocking session read; sibling navigations are still validated by the page exports.

## File Map

| File/Directory | Purpose |
|---|---|
| `next.config.ts` | `staleTimes` configuration and authenticated `Cache-Control` |
| `lib/instant-navigation/escape-hatches.ts` | In-scope route set, escape-hatch validator + overdue detection |
| `lib/instant-navigation/escape-hatch-registry.ts` | Tracked exemption entries |
| `scripts/audit-instant-navigation.ts` | Route, scope-drift, and registry audit (`npm run check`) |
| `scripts/instant-navigation/check-coverage.ts` | Per-route coverage report (`npm run check`) |
| `scripts/instant-navigation/instant-export.ts` | AST inspection of the `instant` export |
| `scripts/instant-navigation/escape-hatch-audit.ts` | Registry-wide duplicate/invalid/overdue checks |
| `scripts/instant-navigation/instant-scope.ts` | Scope-drift check against `IN_SCOPE_ROUTES` |
| `components/shared/region-error-boundary.tsx` | `catchError`-based boundary for independently-failing regions |
| `components/shared/region-error-fallback.tsx` | Shared `role="alert"` failure UI and retry |
| `components/shared/detail-section-fallback.tsx` | `DetailSectionFallback` / `DetailHeaderFallback` / `DetailPageHeaderFallback` for staged detail routes |
| `features/admin/components/admin-detail-section-fallback.tsx` | Admin console equivalents of the detail fallbacks |
| `features/auth/components/auth-form-skeleton.tsx` | Skeleton for auth form Suspense fallbacks |

## Common Tasks

### Adding a new dashboard page

1. Make the default export function synchronous (no `async`, no awaits above return).
2. Return the structural shell with `<Suspense>` boundaries and skeleton fallbacks.
3. Put all dynamic reads (`params`, `getAppShellContext`, queries) in async child server components inside those boundaries.
4. Export `instant = true` (the supported Next.js 16.4 route segment config).
5. Add the route to `IN_SCOPE_ROUTES` and run `npm run check` so scope drift, validation, and static-shell checks all pass.

### Staging an existing detail page

1. Keep the aggregate query (print, preview, export, and actions still read it)
   and add a `*DetailCore` frame query plus one query per feed.
2. Give every new query the same `"use cache"`, `cacheLife`, and record-scoped
   cache tags as the query it was split from.
3. Call `notFound()` on the frame's core row, then wrap each feed in
   `<Suspense>` — and in `<RegionErrorBoundary>` when it can fail alone — using
   the fallbacks in `components/shared/detail-section-fallback.tsx`.
4. Keep `loading.tsx` mirroring the shell: same header copy, same region order.
5. Update tests that named the aggregate query, then run `npm run check`,
   `npm test`, and `npm run build`.

### Fixing a validation failure

The dev overlay names the page and the blocking component. Either:
- Move the blocking read into a `<Suspense>`-wrapped child, or
- Cache the data with `"use cache"` so it doesn't suspend.

Never opt out with `instant = false` to silence a fixable failure — use the
escape-hatch registry (`lib/instant-navigation/escape-hatch-registry.ts`).

### Adding an escape hatch

1. Add an entry to `lib/instant-navigation/escape-hatch-registry.ts` with `route`, `reason`, `targetReviewDate`, `active: true`.
2. Verify it passes `validateEscapeHatch`.
3. Set `export const instant = false` on the exempted segment (page-level `instant = false` is not used; the sole `instant = false` in the tree is the admin console layout).

### Checking migration coverage

```bash
npm run audit:instant-navigation
npm run audit:instant-navigation-coverage
```

Both run from `npm run check` via `check:seo`. They report scope drift, which in-scope routes have validation enabled, which have valid escape hatches, which are failing, and any registry-wide escape-hatch problem.

## Reference

- Bundled Next.js docs (source of truth): `node_modules/next/dist/docs/`
  - `01-app/02-guides/instant-navigation.md`
  - `01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`
  - `01-app/02-guides/prefetching.md`
  - `01-app/03-api-reference/05-config/01-next-config-js/staleTimes.md`
- Current architecture reference: [TRD](TRD.md#request-and-rendering-model)
