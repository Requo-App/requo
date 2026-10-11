# Requo Frontend

Technical frontend architecture. Visual rules live in `DESIGN.md` — this file covers routing, rendering, and patterns. Instant-navigation deep dive: `docs/architecture/instant-navigation.md`.

## App Router map

```text
app/
  (marketing)/   # Landing, pricing, legal (static-friendly, "use cache" where possible)
  (auth)/        # login, signup, forgot/reset, check-email (sensitive no-store headers)
  (public)/      # b/[slug] (+chat/, inquire/), inquire/[slug]/[[formSlug]], quote/[token]/
  (business)/    # new/ + [businessSlug]/(main|settings|preview|print)
    [businessSlug]/(main)/  # home, inquiries, quotes, products, services,
                            # follow-ups, invoices, analytics, notifications, assistant
    [businessSlug]/settings/ # ~15 pages incl. members, email templates, support
  (checkout)/ admin/ onboarding/ invite/[token]/ verify-email/ home/
   api/           # account, admin, auth, billing/polar, business, cron,
                  # inngest, ai (agent + owner-assistant), inquiries, approvals, public, push
  .well-known/   # agent-skills, api-catalog, mcp, oauth, openid, security-txt
```

Redirects (`next.config.ts`): `/dashboard` → `/home`, `/:slug/dashboard` → `/:slug/home`, all `forms*`/`inquiry-form*`/`inquiry-page*` paths → `/services*` (Services rename, ADR 009). Headers: public inquiry/quote pages cacheable (`s-maxage=60`); authenticated + `/b/*` + auth pages no-store/noindex.

Public marketing paths are the single source of truth in `lib/seo/route-registry.ts` (`PUBLIC_ROUTE_PREFIXES`): `/`, `/pricing` (+ `/pricing.md`), `/solutions`, `/features`, `/compare`, `/guides`, `/about`, `/security`, `/legal`, `/subprocessors`, `/privacy`, `/terms`, `/refund-policy`, `/inquire`, `/llms.txt`. Keep `lib/routing/reserved-segments.ts`, `app/sitemap.ts` static entries, and `proxy.ts` noindex logic in sync — `proxy.ts` stamps `X-Robots-Tag: noindex` on anything neither public nor private, and `/` serves HTML by default (markdown only when `text/markdown` outranks `text/html`; agents use `/llms.txt` explicitly).

## Rendering pattern (instant navigation)

Every authenticated dashboard page uses `export const instant = true` and paints synchronously:

```tsx
export const instant = true;
export default function SomePage({ params }) {   // sync — no awaits
  return (
    <DashboardPage>
      <PageHeader title="..." />
      <Suspense fallback={<Skeleton />}>
        <DataRegion params={params} />           {/* awaits live here */}
      </Suspense>
    </DashboardPage>
  );
}
```

Rules: `params`/`searchParams`/session/queries only inside `<Suspense>`-wrapped async children; one boundary per independently-loading region; add `<RegionErrorBoundary>` (`components/shared/region-error-boundary.tsx`) where a region can fail alone. Never silence failures with `instant = false` — use the escape-hatch registry (`lib/instant-navigation/escape-hatch-registry.ts`). Stale times: dynamic 30s, static 180s (`next.config.ts`). `loading.tsx` (80+ files) must mirror its page's Static Shell (same header copy, tabs, grid, section order). Skeletons: `components/shell/*-skeleton.tsx`, `components/shared/*-skeleton.tsx`, `components/ui/{skeleton,spinner}.tsx`. Staged detail routes reuse `components/shared/detail-section-fallback.tsx` (`DetailSectionFallback` per feed, plus header-shaped fallbacks) — see `docs/architecture/instant-navigation.md`.

## Marketing background

`app/(marketing)/layout.tsx` mounts the `<MarketingPixelBackground />` component
(`components/marketing/marketing-pixel-background.tsx`) behind the marketing routes.
The isolated layout keeps its negative z-index above the body canvas but below content
and overlays. It uses a low-resolution canvas (`pixelSize = 5`) with 3D Perlin noise and
a 4x4 Bayer dithering matrix to produce an authentic retro pixel-animated background.
A vertical CSS gradient mask smoothly fades the pixel density downwards. It supports
interactive mouse excitation ripples that diffuse through neighboring cells, adapts to
light (`#1e7d62` shade of primary emerald with bright highlights) and dark (`dark:opacity-45 sm:dark:opacity-50` with subtle `#1b8266` emerald and white sparkles)
themes, throttles to ~15fps for minimal CPU overhead, freezes on reduced motion, pauses
when the tab is hidden, hides below `sm` (`hidden sm:block` — no dots on mobile),
and hides for print. Keep this layer outside scrolling/clipping
content wrappers, and do not add transforms to the marketing layout (they would change
the fixed containing block).

## Server / client split

Server components by default. `"use client"` only for interactivity (`app/global-error.tsx`, `components/ui/{checkbox,chart,calendar,avatar}.tsx`, chat interfaces, command menu, tours). `"use server"` marks server actions (`features/*/actions.ts`); `"server-only"` marks mutations and provider code (`features/*/mutations.ts`, `lib/email/*`). Never `next/dynamic` a server component (client interactive components only).

Data fetching: parallelize with `Promise.all`; stream non-blocking regions via `<Suspense>`; no blocking awaits in layouts for page-specific data. Hot reads use `React.cache()` + `"use cache"` two-layer caching with `lib/cache/*` tags; mutations `revalidateTag`. Dev latency via `timed()`/`devTiming()` (`lib/dev/server-timing.ts`, no-ops in prod).

## Shared UI composition

- Layout: `DashboardPage` (+ `DashboardToolbar`, `DashboardStatsGrid`, `DashboardDetailLayout`, `DashboardSidebarStack`, `DashboardSection`, `DashboardTableContainer`, `DashboardActionsRow`) from `components/shared/dashboard-layout.tsx`; `PageHeader` (eyebrow/title/description/actions); `FormSection` + `FormActions`.
- Lists: `PageHeader` (title + actions, no filler description) + `dashboard-table-shell` (toolbar strip + table + pagination as one object); `DashboardToolbar` (bare shell) vs `DataListToolbar` (composed search/filters/clear); desktop filters in toolbar (labels visually hidden, placeholders carry hints), mobile filters in `Sheet`; tables in `DashboardTableContainer`, rows edge-to-edge; mobile rows keep the same hierarchy via `mobile-record-row`. A route's `loading.tsx` composes the same fallbacks the page's `Suspense` boundaries use (`*ListControlsFallback` + `*ListContentFallback`, and the same `PageHeader` props), so shell and resolved page agree.
- Status: `components/shared/status-badge.tsx` is the only place status colour is written. Pick a `StatusTone` and render `StatusBadge`; per-domain mappings are exhaustive `Record<Enum, StatusTone>` maps. Never a `Badge` variant plus a hand-written colour class — `audit:status-tokens` enforces this.
- Primitives: `components/ui/*` (40 files: button, card, dialog, sheet, table, empty, alert, badge, tabs, …). Shell chrome: `components/shell/*` (sidebar 240px / 32px items, 48px top bar, command menu, mobile nav/dock). Chat primitives shared by both AI surfaces: `components/shared/chat/` (`ChatComposer`, `ChatMarkdown`, `ChatStatusLine`, `CopyButton`).
- Optimistic CRUD: `hooks/use-animated-list.ts` (lists) / `useOptimistic` or `hooks/use-optimistic-mutation.ts` (toggles/moves) / `components/shared/server-action-button.tsx` (forms) + `lib/optimistic/id.ts` temp IDs; mutate optimistically in `startTransition`, reconcile with deferred refresh, revert + `toast.error` on failure. Server-side tag invalidation stays authoritative.
- State: URL for shareable state (filters, pagination, `?session=`); `sessionStorage` for Agent token; server state via cache tags (no global client store except `live-chat-store.ts` for the Assistant stream).

## Forms, errors, responsive

Forms: `FormSection` + `FieldGroup` + `Field` + `FormActions`; `FieldLabel/Content/Description/Error`; `data-invalid` + `aria-invalid`; labels above controls; Zod schemas in `features/*/schemas.ts` shared by client and server. Errors: route `error.tsx` + region boundaries + `not-found.tsx`; empty states use `Empty` with the next useful action; loading uses `Skeleton` (structure) vs `Spinner` (async work). Responsive: `dashboard-main px-3 py-4 sm:px-5 sm:py-5 xl:px-6`; tables → stacked mobile rows; filters → bottom sheet; Assistant history popover → sheet; density rules (32px desktop / 36px mobile controls, 44px primary targets) apply to dashboard/settings/admin only — marketing/auth/public/print keep generous scale.
