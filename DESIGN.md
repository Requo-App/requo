# Requo UI System

This document defines the canonical UI system for Requo. Use `shadcn/ui` primitives, Requo design tokens, and shared layout wrappers before introducing page-level styling.

## Design Principles

- Build on the existing system. Prefer `components/ui/*`, `components/shared/*`, and semantic tokens from `app/globals.css` over custom markup.
- Use semantic styling. Reach for `bg-primary`, `text-muted-foreground`, `surface-card`, `control-surface`, and existing variants before raw palette utilities.
- Keep primitives stable. Use `className` for layout, width, placement, and composition. Do not restyle button, input, card, or overlay visuals per feature.
- Favor reusable patterns. Forms, list pages, dashboards, and empty states should share the same composition and spacing rules.
- Accessibility is default behavior. Maintain contrast, visible focus states, semantic headings, `aria-invalid`, disabled states, and accessible labels for icon-only actions.

## Design Tokens

### Color System

Use semantic tokens, not raw color classes, for all product UI.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `background` | App background | `#f7f9f7` | `#121212` |
| `foreground` | Primary text | `#172b24` | `#ededed` |
| `primary` | Primary actions and emphasis | `#008060` | `#008060` |
| `primary-foreground` | Text on primary surfaces | `#f4fffb` | `#f4fffb` |
| `secondary` | Subtle surface/action | `#f0f3f1` | `#1f1f1f` |
| `muted` | Muted surface | `#eef2ef` | `#171717` |
| `muted-foreground` | Supporting text | `#5f756c` | `#8b9092` |
| `accent` | Hover/selected accent surface | `#f0f3f1` | `#242424` |
| `destructive` | Error and destructive actions | `#c9372c` | `#c9372c` |
| `border` | Borders and dividers | `#d6ddd8` | `rgb(255 255 255 / 0.07)` |
| `input` | Control border base | `#d6ddd8` | `rgb(255 255 255 / 0.08)` |
| `ring` | Focus ring | `#1b9b79` | `#1b9b79` |

Extended token groups:

- `surface-*`: elevated cards, soft panels, section shells, footers, and muted surfaces.
- `control-*`: interactive controls, hover states, primary/destructive control shadows.
- `overlay-*`: dialog, sheet, select, and popover surfaces.
- `table-*`: table header, footer, hover, and selected row states.
- `sidebar-*`: sidebar background, text, border, accent, and ring tokens.
- `radius-*`: all resolve to the single shared `--radius` (8px); use `rounded-lg` / `rounded-xl`, never hard-coded radii.
- `motion-*`: shared durations, easing, and lift distance for subtle motion.

State rules:

- Focus uses `ring`.
- Error uses `destructive`.
- Disabled uses lower emphasis, muted surfaces, and reduced opacity.
- Success, warning, and info are global product tokens (`--success`, `--warning`, `--info`), alongside `destructive`. Use them for semantic state; do not introduce raw `emerald`, `amber`, `blue`, or similar palette utilities in feature code.
- Status colour has exactly one home: `components/shared/status-badge.tsx`. Feature code picks a `StatusTone` and renders `StatusBadge` — it never writes status colour itself. A per-domain `Record<Enum, StatusTone>` map is the only extension point, and keeping it exhaustive means a new enum member fails the typecheck.
- Never reach for `!important` (`!bg-*`, `!text-*`, …) to win a colour conflict. Custom classes and Tailwind utilities both land in `@layer utilities`, so source order — not class order — decides the winner, and `tailwind-merge` cannot arbitrate a class it does not recognise. Use a variant or tone that carries no conflicting colour instead. Enforced by `scripts/audit-status-tokens.ts`.

### Data Visualization Tokens

Charts read colour from tokens, never from literals. The shared chart
primitives (`components/ui/chart.tsx`) keep their `ChartConfig` contract; the
tokens below are the palette they configure.

| Token | Role | Light | Dark |
| --- | --- | --- | --- |
| `--chart-1…5` | Legacy categorical series | see `app/globals.css` | see `app/globals.css` |
| `--chart-series-1` | First series — the brand accent | `var(--primary)` | `var(--primary)` |
| `--chart-series-2` | Second series — neutral | `var(--muted-foreground)` | `var(--muted-foreground)` |
| `--chart-series-3` | Third series — lighter neutral | 60% muted-foreground | 60% muted-foreground |
| `--chart-neutral-1…5` | Neutral ramp for stacked series | muted-foreground steps | muted-foreground steps |
| `--chart-grid` | Horizontal gridline hairline | `rgb(23 43 36 / 0.08)` | `rgb(255 255 255 / 0.06)` |
| `--chart-track` | Unfilled bar and meter track | `color-mix(in srgb, var(--foreground) 14%, transparent)` | `rgb(255 255 255 / 0.16)` |
| `--chart-tooltip-surface` | Chart tooltip background | `var(--popover)` | `var(--popover)` |
| `--chart-tooltip-border` | Chart tooltip border | `var(--border)` | `var(--border)` |
| `--analytics-sparkline-height` | Inline KPI sparkline height | `2.5rem` | `2.5rem` |

Chart rules:

- One accent plus neutrals. A second hue is never used to categorise data;
  `success`, `warning`, and `destructive` appear only where the value carries
  that meaning (accepted, aging, overdue).
- At most three series per chart. Anything wider is a table, not a plot.
- No plot border, vertical gridlines, axis lines, or tick marks. Three or four
  horizontal gridlines only, drawn in `--chart-grid`.
- The axis domain comes from the data. A chart whose values are all zero draws
  nothing and shows the empty state instead of a flat line on a fixed scale.
- Count series are sparse: unsmoothed lines, never curves that imply values
  between buckets. Revenue uses rounded-top bars with the average deal as a
  thin line over them.
- The only gradients are soft chart area fills; a filled area fades from ~12%
  to 0.
- `.analytics-card` is the analytics card surface: a 1px low-contrast border
  with no elevation, so a page of cards reads as one plane.
- Cards in one row share a height. The plot fills its card, and the table
  view scrolls inside the card, so switching between them never resizes it.
- A stat grid follows the card it lives in, not the viewport: a half-width
  card splits its stats into two columns at the card's width, so a narrow card
  never squeezes two numbers into one column.

### Typography Scale

Fonts:

- `font-sans`: Inter (marketing routes keep Geist Sans via `.font-scope-geist`)
- `font-heading`: Inter (marketing routes keep Geist Sans via `.font-scope-geist`)
- `font-mono`: Geist Mono

Use role-based typography instead of ad hoc text sizes. Full spec lives in
`styles/typeset.css` (loaded via `app/globals.css`).

| Role | Standard treatment | Use |
| --- | --- | --- |
| Display hero | `font-heading text-5xl leading-[0.96] font-semibold tracking-tight` | Marketing and auth hero only |
| Page title | `font-heading text-xl sm:text-2xl leading-tight font-semibold tracking-tight` | `PageHeader`, detail headers (two steps: 20px, 24px) |
| Section title | `font-heading text-base leading-tight font-semibold tracking-tight` | `CardTitle`, `DashboardSection` |
| Form section title | `.form-section-title` (`text-[0.9375rem] font-semibold tracking-tight`, 15px) | `FormSection` titles |
| Body | `text-sm leading-6` | Default UI copy (14px at Default scale) |
| Supporting body | `text-sm leading-5 text-muted-foreground` | Descriptions and help text |
| Long-form supporting | `text-sm leading-5 text-muted-foreground` | Page descriptions and detail copy |
| Small supporting | `text-xs` (12px) | Timestamps, counts, badges, menus — meta only |
| Field label | `text-sm leading-[1.35] font-medium` | `FieldLabel` |
| Meta label | `meta-label` (`text-[0.6875rem] font-medium uppercase tracking-[0.14em] text-muted-foreground`, 11px) | Filters, meta chips, product mock labels |
| Caption/code | `font-mono text-[0.72rem]` | IDs, tokens, technical metadata |

Control text is a single size: `text-sm` on every control primitive at every
size. Do not add per-size font-size overrides to primitive variants.

Interface scale (Appearance settings → Scale) rides the root `font-size`:
Small = 13px body (root 92.8571%), Default = 14px body (100%),
Large = 15px body (107.1429%). Because Tailwind spacing/sizing is rem-based,
scale adjusts the whole app, not just fonts; 1px hairlines stay fixed.
Arbitrary `text-[Npx]` values do not scale — use rem values from the ramp
above. Print/PDF output always renders at 100%.

### Spacing and Radius

Use a compact spacing scale consistently: `1.5`, `2`, `2.5`, `3`, `4`, `5`, `6`, `8`, `10`, `12`, `16`.

Implemented density scale (authenticated surfaces):

- Interactive controls stand 32px tall on desktop (`h-8` from the `sm`
  breakpoint up) and 36px on phones (`h-9` mobile-first). Primary mobile tap
  targets stay at 44px or more (`h-11`); nothing interactive goes below the
  24px WCAG 2.5.8 floor. Table headers match the controls above them (`h-8`
  on desktop). Table rows sit at a 52px pitch with two lines per row
  (customer name above email address — the email is the only available
  disambiguator, so rows never collapse to one line).
- Page titles render on the two-step 20-to-24px scale above.
- The sidebar rail is 240px wide with 32px navigation items (14px `text-sm`
  labels, 20px icons); the desktop top
  bar is 48px. Page sections are separated by 24px (`gap-6` on
  `DashboardPage`).
- Marketing, authentication, public inquiry pages, the public Agent chat,
  and print/PDF rendering keep their generous scale. Density applies to the
  business dashboard, business settings, and the admin console only.

Spacing rules:

- Prefer `gap-*` over `space-y-*` and `space-x-*`.
- Use `gap-2` to `gap-3` for tight control groups and inline actions.
- Use `gap-4` to `gap-6` for card bodies, form sections, and stacked content.
- Use `gap-6` for page sections and dashboard page flow.
- Use `px-3 py-4 sm:px-5 sm:py-5 xl:px-6 xl:py-6` for the dashboard page shell
  (`dashboard-main`).
- Panel padding is baked into the shared utilities (see below), not declared
  per surface.

Panel padding:

- `section-panel` carries `px-4 py-4 sm:px-5 sm:py-5`; `soft-panel` carries
  `px-4 py-4` — like the already-padded `info-tile`. Do not re-declare
  padding on the same class attribute; the cascade silently ignores it and
  `audit-density` fails.
- Surfaces that legitimately supply their own padding (full-bleed card
  headers, floating bars, tighter option rows, document previews, and every
  out-of-scope surface) opt out with `data-padding="none"`.

Radius rules (single shared radius):

- One value everywhere: `--radius` (`0.5rem` / 8px). The `sm/md/lg/xl/2xl/3xl/4xl` tokens all resolve to it — use `rounded-lg` for controls and `rounded-xl` for cards, tables, sections, overlays, and empty states.
- Exceptions: `rounded-full` for pills, badges, and avatars; `rounded-sm` for micro-internals (checkbox, tooltip arrow); `rounded-none` for flush edges; `chat-bubble` (`app/globals.css`, 20px) for AI chat user turns only.
- Never use `rounded-2xl` / `rounded-3xl` / `rounded-4xl` or arbitrary `rounded-[...]` in new code (`rounded-2xl` still renders the shared 8px via the collapsed token — rename to `rounded-xl` on touch). Enforced by `audit:radius`.

### Motion

- Use the shared motion tokens: `--motion-duration-fast`, `--motion-duration-base`, `--motion-duration-slow`, `--motion-ease-standard`, `--motion-ease-emphasized`.
- Motion should clarify interaction, not decorate the UI.
- Use subtle lift, shadow, opacity, and panel transitions. Avoid flashy animation or large movement on core product pages.

## Component Standards

### Naming Convention

Variant names should stay consistent across primitives:

- `default`: standard or primary presentation
- `secondary`: subdued emphasis
- `outline`: bordered neutral action
- `ghost`: low-emphasis action
- `destructive`: irreversible or error-related action
- `link`: text-only action

Size names should stay consistent where supported:

- `xs`, `sm`, `default`, `lg`
- `icon`, `icon-xs`, `icon-sm`, `icon-lg` for square icon actions

Do not invent new variant or size names in feature code. Add a new name only if it will be shared across the system.

### Buttons

- Always use `Button`.
- Use `variant="default"` for the primary action in a section or dialog.
- Use `outline` or `secondary` for secondary actions, `ghost` for low-emphasis actions, `destructive` for irreversible actions, and `link` for inline navigation.
- Place icons with `data-icon="inline-start"` or `data-icon="inline-end"`.
- Loading state is `disabled` + `Spinner`; keep the text label visible.
- Icon-only buttons must include an accessible label with visible text or `sr-only` content.

### Inputs, Selects, and Textareas

- Use `Input`, `Textarea`, `Select`, `SelectTrigger`, and `SelectContent` from `components/ui/*`.
- These controls share the same `control-surface` visual language. Do not override their color, border, or focus styling in page code.
- Use `FieldGroup`, `Field`, `FieldLabel`, `FieldContent`, `FieldDescription`, and `FieldError` for form structure.
- Validation rules:
  - `data-invalid` on `Field`
  - `aria-invalid` on the control
  - `disabled` on the control and `data-disabled` on the field wrapper when needed
- Keep labels above controls by default. Use responsive horizontal field layouts only through the shared field orientation APIs.

### Cards, Empty States, Alerts, and Badges

- Use full card composition: `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.
- Use `DashboardSection` for standard dashboard content blocks instead of rebuilding card structure.
- Use `Empty` for empty states, `Alert` for inline notice or error messaging, `Badge` for compact status/metadata, `Skeleton` for loading placeholders, and `Spinner` for active async work.
- Keep badges semantic. `default`, `secondary`, `outline`, `ghost`, and `destructive` are the general-purpose variants — use them for non-status metadata such as plan names, counts, and tags.
- For a *status*, use `StatusBadge` from `components/shared/status-badge.tsx` with a `StatusTone`. Never pair a variant with a hand-written colour class; the `status` variant exists only as `StatusBadge`'s colourless shell and should not be used directly.

### Dialogs, Sheets, and Tabs

- Use `Dialog` for blocking flows and focused modal tasks.
- Use `Sheet` for contextual side panels, mobile filters, and temporary secondary workflows.
- `DialogTitle` or `SheetTitle` is required, even if visually hidden.
- Keep overlay content within the shared header/body/footer structure. Preserve close controls and focus-visible states.
- Use `Tabs`, `TabsList`, and `TabsTrigger` with `variant="default"` or `variant="line"` only.

### Tables and Lists

- Standard list pattern: `PageHeader` (title + actions, no filler
  description) + results card (`dashboard-table-shell` holding the toolbar
  strip, the table, and pagination as one object).
- The bare `toolbar-panel` container and the composed list toolbar are
  different things: `DashboardToolbar` renders the bare `toolbar-panel`
  shell, while `DataListToolbar` is the composed list toolbar built on top
  of it — a single control-height row of search, filters, and clear with
  the result count as plain muted text underneath. The filter row merges
  into the top of the results card as a header strip
  (`data-list-toolbar-strip`); the table wrapper carries no padding so rows
  sit edge to edge.
- Desktop filter labels are visually hidden (hints live in placeholders)
  with accessible names preserved; the mobile filter sheet keeps visible
  labels.
- Use table helper classes and shared text treatments for row titles, supporting text, and metadata.
- Empty state uses `Empty` or the shared list empty wrapper.
- Loading state uses `Skeleton`; async filtering/search uses `Spinner`.
- Selected, hovered, and expanded row states should come from the existing `table-*` tokens and classes.

## Layout Guidelines

### Forms

- Standard form composition: `FormSection` + `FieldGroup` + `Field` + `FormActions`.
- Group related controls into sections with a clear title and short description.
- Default to one-column forms. Use responsive splits only when it improves scanning and does not hurt completion.
- Keep form actions at the end of the section or page, aligned with the shared `FormActions` patterns.

### Dashboards and Detail Pages

- Standard page composition: `DashboardPage` + `PageHeader` + shared section wrappers.
- Use `DashboardSection` for bounded content areas.
- Use `DashboardDetailLayout` for two-column detail pages and `DashboardSidebarStack` for supporting side content.
- Use `DashboardActionsRow` for clusters of page or section actions.
- Keep dashboard spacing consistent with the shared page rhythm: section gaps at `gap-6` to `gap-8`, action gaps at `gap-2.5`.

### Lists

- Use `DataListToolbar` for search, filters, result counts, and clear actions. `DashboardToolbar` is only the bare `toolbar-panel` shell underneath it — see *Tables and Lists*.
- Keep filters in the toolbar on desktop and in a `Sheet` on mobile.
- Wrap desktop tables in `DashboardTableContainer`.
- For mobile list views, keep the same content hierarchy and token usage as the desktop table shell.
- A route's `loading.tsx` must compose the same fallbacks the page's `Suspense` boundaries use — the `*ListControlsFallback` / `*ListContentFallback` pair, and the same `PageHeader` props including any responsive `className`. Hand-rolling a skeleton here drifts from the resolved page and shows up as a layout shift on every navigation.

### Auth and Public Surfaces

- Auth, marketing, and public pages still use the same semantic color and surface system.
- Reuse existing shared classes such as `hero-panel`, `section-panel`, `soft-panel`, `eyebrow` (product/editorial), and `meta-label` (product mock labels). Marketing sections use `MarketingEyebrow` instead.
- The marketing home renders standard cards flat: `MarketingHero` sets `data-marketing-flat-cards`, and `app/globals.css` suppresses `surface-card` / `soft-panel` elevation under that root. Landing-specific surfaces (hero window, workflow stage, business mocks, Why Requo cards) use a single hairline border; only the hero window and the shared illustration card carry a neutral shadow, and only in light mode.
- The landing atmosphere is tokenized under the `--marketing-*` namespace in `app/globals.css`: surfaces, hairlines, the 16px panel radius, the 12px illustration-card radius, a light-only mock shadow, and the reveal/parallax pace. There is no dot-grid token or texture; the hero keeps one soft radial behind the product window. Reveal pace is `--marketing-reveal-duration` / `--marketing-reveal-distance` (600ms / 12px); parallax is capped by `--marketing-parallax-distance` (12px). Effects must remain removable without changing layout.
- `MarketingEyebrow` is a sentence-case sans label: 14/20, weight 500, no tracking, node, rule, or icon, in the accent ink. It sits 12px above its headline. Use it for section labels, feature kickers, and FAQ groups; footer headings use the quieter 13px `marketing-footer-heading`.
- The landing hero product window (`.marketing-hero-frame`) is the intentional radius exception: an 18px shell, a flat hairline border, and a neutral shadow read as an app window while every control inside stays on `--radius` (8px). The header and hero share `.marketing-shell-container` so their left and right edges align at every breakpoint. The window's bottom edge uses a layered background-colour fade (`.marketing-hero-bottom-fade`) so the dashboard crop dissolves into the page instead of ending on a card edge; the mockup itself stays crisp beneath the overlay.
- The landing header is translucent with a backdrop blur and gains a hairline after 8px of scroll, never an inset highlight. Desktop nav items use a sage hover pill (`marketing-nav-link`); the underline is reserved for body and footer links.
- Hero atmosphere is one soft accent radial behind the product window, contained so it reaches transparent before the visual's edges. There is no dot field or top wash. The product window may drift by at most 12px through `MarketingHeroParallax`; reduced motion removes the drift and all one-time entrances.
- Why Requo problem cards are single `.marketing-mock-card` fragments, not window panes: no chrome strip, dot texture, or floating pill. Each leaves the card layout intact and pins a warning footer strip to the bottom; card 02 uses a right-aligned dashed timeline and card 03 a broken-link connector.
- The Requo business section reuses `MarketingSectionHeader` and alternates a 5fr text / 7fr mock grid (`56px` column gap, `64px` row gap). Its mocks share `.marketing-mock-card` with content-driven height, a hairline border, and no glow or pointer spotlight; rows use the one-time `MarketingFeatureReveal` entrance. Do not add per-row parallax or hover movement.
- The decorative product fragments compose `components/marketing/marketing-mock-primitives.tsx` (`MockCard`, `MockCardHeader`, `MockList`, `MockRow`, `MockAvatar`, `MockBadge`, `MockButton`, `MockFooterStrip`, `MockSectionLabel`) so every landing illustration keeps one shell, row rhythm, and status vocabulary.
- The FAQ keeps Radix's height animation. Only the open row shows the accent rail; hover uses a neutral tint. The closing CTA is a flat ink panel at section width (`max-w-6xl`): a two-tone section-size headline, solid white primary, quiet 80%-white secondary, and no gradient, glow, dot grid, ornament, or shadow. The footer ends on a hairline shelf, not a ghost wordmark.
- The marketing type ramp is tokenized in `app/globals.css`: `text-marketing-label` (12px, no tracking), `text-marketing-intro` (17px), `text-marketing-body` (15px), `text-marketing-card-title` (20px), `text-marketing-row-title` (28px), and `text-marketing-section-title` (`clamp(34px, 4.4vw, 54px)`). Use these tokens for public marketing sections instead of arbitrary sizes.
- Landing conversion CTAs use the shared primary `Button` treatment for “Start free” and `marketing-button-secondary` for the outline demo action. The secondary stays flat: 10px radius, hairline surface, one-step hover, and no coloured shadow. Hero and closing-panel actions run 44–48px tall. The closing panel swaps in a solid white primary and a quiet underlined secondary.
- Marketing pages use the app's original dark palette (`#121212` background, neutral cards and hairlines) instead of a landing-specific green-tinted surface family; green stays reserved for accents.
- Marketing navigation, headings, eyebrows, and actions use sentence-case sans. Mono is reserved for IDs and ordinals, not navigation, kickers, headings, or actions.
- Avoid one-off gradients, shadows, radii, or raw palette utilities unless they are promoted into shared tokens or classes first.

## Do's and Don'ts

### Do

- Use semantic tokens and shared utility classes.
- Reuse `components/ui/*` and `components/shared/*` before creating custom markup.
- Prefer `gap-*` for spacing and shared wrappers for layout.
- Keep variants and sizes aligned with the documented names.
- Preserve focus states, contrast, and accessible labels.
- Use inline `style` only for structural CSS variable plumbing, not visual styling.

### Don't

- Do not use inline visual styles for colors, shadows, radii, spacing, or typography.
- Do not apply raw palette utilities like `text-emerald-*` or `bg-amber-*` in feature code.
- Do not bypass `Field*`, `Card*`, `Dialog*`, `Sheet*`, or table composition when a shared pattern exists.
- Do not use `space-y-*` or `space-x-*` for new layout work.
- Do not introduce new visual variants casually or restyle primitives page by page.

## Example Snippets

### Primary Button With Loading State

```tsx
<Button disabled={isSaving} type="submit">
  {isSaving ? <Spinner aria-hidden="true" /> : null}
  Save changes
</Button>
```

### Standard Form Section

```tsx
const nameError = "";

<FormSection
  title="Business details"
  description="Use the same naming and contact details customers will see."
>
  <FieldGroup>
    <Field data-invalid={Boolean(nameError)}>
      <FieldLabel htmlFor="business-name">Business name</FieldLabel>
      <FieldContent>
        <Input id="business-name" aria-invalid={Boolean(nameError)} />
      </FieldContent>
      <FieldError>{nameError}</FieldError>
    </Field>
  </FieldGroup>

  <FormActions>
    <Button variant="outline" type="button">
      Cancel
    </Button>
    <Button type="submit">Save</Button>
  </FormActions>
</FormSection>
```

### Standard Dashboard List Section

```tsx
<DashboardPage>
  <PageHeader
    eyebrow="Inquiries"
    title="Customer requests"
    actions={<ListHeaderActions />}
  />

  <div className="dashboard-table-shell" data-list-card>
    <Suspense fallback={<ListControlsFallback />}>
      <ListControlsRegion />
    </Suspense>
    <Suspense fallback={<ListContentFallback />}>
      <ListContentRegion />
    </Suspense>
  </div>
</DashboardPage>
```

List pages drop the `PageHeader` description (it restates the title);
settings and detail pages keep theirs. Each list route's loading shell
mirrors this composition so the shell and the resolved page agree.

## Responsive Design

Dashboard, settings, and admin surfaces share one responsive contract:

- Page shell: `dashboard-main px-3 py-4 sm:px-5 sm:py-5 xl:px-6 xl:py-6`.
- Sidebar rail 240px with 32px nav items on desktop; mobile uses the top bar, fullscreen nav, and floating dock (`components/shell/mobile-*`).
- Filters live in the toolbar on desktop and move into a `Sheet` on mobile; desktop filter labels are visually hidden (placeholders carry hints) while the mobile sheet keeps visible labels.
- Tables (`DashboardTableContainer`, rows edge-to-edge) collapse to stacked mobile rows via `mobile-record-row` with the same content hierarchy and tokens.
- Assistant history renders as a header popover on desktop and a bottom sheet on mobile.
- Marketing, auth, public inquiry pages, the public Agent chat, and print/PDF output keep their generous scale — density rules do not apply there.

Implementation: `components/shell/*`, `components/shared/dashboard-layout.tsx`, `components/shared/mobile-record-row.tsx`.

## Accessibility

Accessibility is default behavior, not an enhancement pass:

- Focus: `focus-visible:ring-2 focus-visible:ring-border-focus-ring` / `ring` token; never remove visible focus states.
- Forms: `Field` carries `data-invalid`, controls carry `aria-invalid`; every input has a `FieldLabel` (or `sr-only` label for icon-only actions).
- Overlays: `DialogTitle` / `SheetTitle` required even when visually hidden; preserve close controls and focus trapping.
- Buttons: loading state is `disabled` + `Spinner` with the text label kept; icon-only buttons include `sr-only` text.
- Contrast: body copy uses `foreground` / `muted-foreground` only; status uses semantic badge/alert patterns, never raw palette utilities.
- Motion: chat surfaces and shared utilities ship `prefers-reduced-motion` fallbacks; keep them when touching motion code.

## Known inconsistencies

Established patterns above win for new work. These contradictions exist in the codebase — do not copy them into new code, and do not silently "fix" them outside a dedicated cleanup:

- **BoardUI migration (done).** The former `components/base/*` + `components/application/` + `components/foundations/` system was recreated 1:1 as shadcn-style components (`cva` + `cn`, same classes/DOM/props) under `components/shared/*` and deleted. One component system remains: `components/ui/*` (primitives) + `components/shared/*` (composed). See [`docs/technical-debt.md`](docs/technical-debt.md). `app/globals.css` still carries the shared token layer (tone aliases, composite type ramp) — `components/ui/*` uses it, so it stays.
- **Legacy styling debt.** Remaining `space-y-*`/`space-x-*` stacks (use `flex`/`grid` + `gap-*`). Flagged by `audit:density`.
- **Raw palette on non-pill surfaces.** Status *pills* are tokenized — `components/shared/status-badge.tsx` owns them and `audit:status-tokens` enforces it — but raw palette still colours some semantic surfaces: the archived-record banner, the upgrade accent, the quote-editor amber alerts, and the public quote option cards. Move them to `--warning`/`--success`/`--destructive` opportunistically. See `docs/technical-debt.md` §4.
- **`!important` outside status.** `!bg-sidebar-accent` (`dashboard-sidebar.tsx`) is the same cascade-order problem the status migration removed: a custom class in `@layer utilities` setting a colour a utility then cannot override. Fix by giving the custom class a variant that sets no colour, not by keeping the `!`.
- **Quote editor grid class.** The quote editor `<form>` carries the raw `dashboard-detail-layout` grid class because the shared layout wrapper cannot wrap forms yet — migrate when the wrapper supports form elements.

## Cleanup Targets

- Replace remaining `space-y-*` and `space-x-*` stacks with `flex`/`grid` plus `gap-*`.
- Replace raw palette colours on non-pill semantic surfaces with `--warning`/`--success`/`--destructive`. Status pills are already done and enforced by `audit:status-tokens`.
- Remove the remaining `!important` colour override by giving the flat variant in `dashboard-sidebar` a colourless equivalent.
- Reduce repeated arbitrary shadows and hard-coded visual values by promoting reusable classes or tokens when a pattern repeats (radii are done: single shared `--radius`, enforced by `audit:radius`).
- The quote editor `<form>` carries the raw `dashboard-detail-layout` grid
  class directly because the shared layout wrapper cannot currently be used
  there. Migrate it to the shared wrapper when the wrapper supports form
  elements instead of fixing it opportunistically.
