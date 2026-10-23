# Entitlements UI

Shared presentation for plan-gated features and upgrade prompts.

Entitlement rules live in `lib/plans/entitlements.ts`. This module owns only
the UI: locked actions, locked sections, locked pages, and upgrade notices.

## Quick start

```tsx
import { FeatureGate } from "@/features/entitlements";

// Buttons and links
<FeatureGate feature="members" plan={plan} variant="action" upgradeAction={props}>
  <Button>Invite member</Button>
</FeatureGate>

// Content sections
<FeatureGate feature="analyticsPerformance" plan={plan} variant="block" upgradeAction={props}>
  <AnalyticsChart />
</FeatureGate>

// Full pages
<FeatureGate feature="members" plan={plan} variant="page" upgradeAction={props}>
  <MembersManager />
</FeatureGate>
```

## Variants

### `variant="action"`

Use for buttons, links, toggles, and command-menu items.

- Renders the element visibly disabled at 50% opacity.
- Shows a tooltip: “Requires [Plan] plan”.
- Opens an upgrade popover when clicked or activated by keyboard.

### `variant="block"`

Use for analytics panels, charts, and embedded features.

- Shows an upgrade card with a lock icon and the required plan.
- Does **not** render children in the DOM while locked.
- Prefer this variant when hidden data must not reach the page source.

### `variant="page"`

Use for settings pages, feature pages, and standalone areas.

- With `previewContent`: shows demo data with a “Demo data” badge and an
  upgrade banner.
- Without `previewContent`: shows an empty-state upgrade card.

## Props

```tsx
type FeatureGateProps = {
  /** Feature key from lib/plans/entitlements.ts */
  feature: PlanFeature;

  /** Current business plan */
  plan: PlanTier;

  /** UI variant */
  variant: "action" | "block" | "page";

  /** Optional copy override; falls back to planFeatureDescriptions */
  description?: string;

  /** Checkout context for the upgrade CTA */
  upgradeAction?: {
    userId: string;
    businessId: string;
    businessSlug: string;
    currentPlan: PlanTier;
    ctaLabel?: string;
  };

  /** Content to gate */
  children: ReactNode;

  /** Additional className */
  className?: string;

  /** Show the tooltip on hover (action variant only, default: true) */
  showTooltip?: boolean;

  /** Demo content to show while locked (page variant only) */
  previewContent?: ReactNode;
};
```

## Entitled features

See `lib/plans/entitlements.ts` for the single source of truth.

**Free:** `multipleServices`, `followUps`, `aiQuoteDrafting`, `quoteLibrary`,
`knowledgeBase`, `exports`. Free supports two live services; the
`multipleServices` key is about capability, not the numeric cap.

**Pro:** `analyticsPerformance`, `analyticsOperations`,
`servicePageCustomization`, `emailTemplates`, `removeWatermark`,
`autoFollowUps`, `agent`, `customWorkflowRecipes`.

**Business:** `analyticsTeam`, `members`, `auditLogs`.

The owner-facing Assistant is available on every plan with a per-plan daily
message bucket; it has no entitlement key. The customer-facing Agent requires
Pro+ (`agent`) and is trial-only on Free. Limits reached inside a conversation
render `UpgradePrompt` in the stream; navigation is never hidden by plan.

## Upgrade context

```tsx
// In a server component
import { getBusinessBillingOverview } from "@/features/billing/queries";

const billingOverview = await getBusinessBillingOverview(businessId).catch(() => null);

const upgradeAction = billingOverview
  ? {
      userId: user.id,
      businessId: businessContext.business.id,
      businessSlug: businessContext.business.slug,
      currentPlan: billingOverview.currentPlan,
    }
  : undefined;
```

## Upgrade notices without plan context

`UpgradeNoticeButton` is the lightweight fallback for client components that do
not receive the business plan or checkout context. Prefer `FeatureGate` when
plan data is available.

## Best practices

1. Provide `upgradeAction` whenever the checkout context is available.
2. Use `variant="block"` for data that must not be rendered while locked.
3. Use `variant="page"` for whole-page gates with a custom description.
4. Use `variant="action"` for interactive elements.
5. Set `showTooltip={false}` for action gates inside command menus.

## Accessibility

- ARIA labels describe the required plan.
- Keyboard activation opens the same upgrade surface as pointer input.
- Touch targets are at least 44px.
- Locked content is `aria-hidden` and `inert` where the variant requires it.
