# Paywall System

Unified feature gating and upgrade prompts for Requo.

## Quick Start

```tsx
import { FeatureGate } from "@/features/paywall";

// For buttons/actions
<FeatureGate feature="members" plan={plan} variant="action" upgradeAction={props}>
  <Button>Invite Member</Button>
</FeatureGate>

// For content blocks
<FeatureGate feature="analyticsPerformance" plan={plan} variant="block" upgradeAction={props}>
  <AnalyticsChart />
</FeatureGate>

// For full pages
<FeatureGate feature="members" plan={plan} variant="page" upgradeAction={props}>
  <MembersManager />
</FeatureGate>
```

## Variants

### `variant="action"` - Buttons, Links, Interactive Elements

**Use for**: Buttons, links, toggles, command menu items

**Behavior**:
- Disables element (50% opacity)
- Shows tooltip: "Requires [Plan] plan"
- Click opens upgrade popover

**Example**:
```tsx
<FeatureGate 
  feature="exports" 
  plan={plan} 
  variant="action"
  upgradeAction={upgradeProps}
>
  <Button>Export CSV</Button>
</FeatureGate>
```

### `variant="block"` - Content Sections, Cards

**Use for**: Analytics panels, charts, embedded features

**Behavior**:
- Shows upgrade card with lock icon
- Does NOT render children in DOM (secure)
- Displays feature description + CTA

**Example**:
```tsx
<FeatureGate 
  feature="analyticsPerformance"
  plan={plan} 
  variant="block"
  upgradeAction={upgradeProps}
>
  <ConversionChart data={premiumData} />
</FeatureGate>
```

### `variant="page"` - Full Pages, Major Features

**Use for**: Settings pages, feature pages, standalone areas

**Behavior**:
- With `previewContent`: Shows demo + "Demo data" badge + banner
- Without `previewContent`: Shows empty-state upgrade card

**Example with preview**:
```tsx
<FeatureGate 
  feature="analyticsPerformance"
  plan={plan} 
  variant="page"
  upgradeAction={upgradeProps}
  previewContent={<DemoAnalytics />}
>
  <RealAnalytics />
</FeatureGate>
```

**Example without preview**:
```tsx
<FeatureGate 
  feature="members" 
  plan={plan} 
  variant="page"
  upgradeAction={upgradeProps}
>
  <MembersManager />
</FeatureGate>
```

## Props

```tsx
type FeatureGateProps = {
  /** Feature key from lib/plans/entitlements.ts */
  feature: PlanFeature;
  
  /** Current business plan */
  plan: BusinessPlan;
  
  /** UI variant */
  variant: "action" | "block" | "page";
  
  /** Custom description (optional, falls back to planFeatureDescriptions) */
  description?: string;
  
  /** Upgrade action props for checkout integration (optional) */
  upgradeAction?: {
    userId: string;
    businessId: string;
    businessSlug: string;
    currentPlan: BusinessPlan;
  };
  
  /** Content to gate */
  children: ReactNode;
  
  /** Additional className (optional) */
  className?: string;
  
  /** Show tooltip on hover (action variant only, default: true) */
  showTooltip?: boolean;
  
  /** Demo content to show when locked (page variant only) */
  previewContent?: ReactNode;
};
```

## Available Features

See `lib/plans/entitlements.ts` for the complete list (single source of truth):

**Free Plan** (always available):
- `followUps`
- `aiQuoteDrafting`
- `quoteLibrary`
- `knowledgeBase`
- `exports`

**Pro Plan** (requires Pro or Business):
- `analyticsPerformance`
- `analyticsOperations`
- `multipleForms`
- `inquiryPageCustomization`
- `emailTemplates`
- `removeWatermark`
- `autoFollowUps`
- `aiAgent`
- `customWorkflowRecipes`

**Business Plan** (requires Business):
- `analyticsTeam`
- `members`
- `auditLogs`

Notes:
- The Assistant is available on every plan with a per-plan daily message
  bucket; it has no entitlement key. The Agent requires Pro+ (`aiAgent`).
- Limits reached inside a conversation render `UpgradePrompt` in the stream;
  navigation is never hidden by plan.

## Getting Upgrade Action Props

```tsx
// In a server component
import { getBusinessBillingOverview } from "@/features/billing/queries";

const billingOverview = await getBusinessBillingOverview(businessId).catch(() => null);

const upgradeAction = billingOverview ? {
  userId: user.id,
  businessId: businessContext.business.id,
  businessSlug: businessContext.business.slug,
  currentPlan: billingOverview.currentPlan,
} : undefined;
```

## Examples

### Command Menu Item
```tsx
<FeatureGate feature="exports" plan={plan} variant="action" showTooltip={false}>
  <CommandItem onSelect={() => downloadCSV()}>
    <Download className="mr-2 h-4 w-4" />
    Download quotes (CSV)
  </CommandItem>
</FeatureGate>
```

### Settings Page
```tsx
export default async function EmailSettingsPage() {
  const { user, businessContext } = await getPageContext();
  const billingOverview = await getBusinessBillingOverview(businessContext.business.id);

  return (
    <FeatureGate
      feature="emailTemplates"
      plan={businessContext.business.plan}
      variant="page"
      upgradeAction={{
        userId: user.id,
        businessId: businessContext.business.id,
        businessSlug: businessContext.business.slug,
        currentPlan: billingOverview.currentPlan,
      }}
    >
      <EmailTemplateForm />
    </FeatureGate>
  );
}
```

### Analytics Panel
```tsx
<FeatureGate 
  feature="analyticsPerformance"
  plan={plan} 
  variant="block"
  upgradeAction={upgradeProps}
>
  <Card>
    <CardHeader>
      <CardTitle>Conversion Funnel</CardTitle>
    </CardHeader>
    <CardContent>
      <ConversionChart data={data} />
    </CardContent>
  </Card>
</FeatureGate>
```

## Migration from Old Components

### From `LockedAction`
```tsx
// Before
<LockedAction feature="members" plan={plan} upgradeAction={props}>
  <Button>Invite</Button>
</LockedAction>

// After
<FeatureGate feature="members" plan={plan} variant="action" upgradeAction={props}>
  <Button>Invite</Button>
</FeatureGate>
```

### From `PremiumContentBlur`
```tsx
// Before
<PremiumContentBlur feature="analyticsPerformance" plan={plan} upgradeAction={props}>
  <Chart />
</PremiumContentBlur>

// After
<FeatureGate feature="analyticsPerformance" plan={plan} variant="block" upgradeAction={props}>
  <Chart />
</FeatureGate>
```

### From `FeaturePreviewPaywall`
```tsx
// Before
<FeaturePreviewPaywall 
  feature="exports" 
  plan={plan} 
  previewContent={<Demo />}
  upgradeAction={props}
>
  <Real />
</FeaturePreviewPaywall>

// After
<FeatureGate 
  feature="exports" 
  plan={plan} 
  variant="page"
  previewContent={<Demo />}
  upgradeAction={props}
>
  <Real />
</FeatureGate>
```

## Best Practices

1. **Always provide `upgradeAction`** when possible for better UX
2. **Use `variant="block"`** for premium data that shouldn't be in DOM
3. **Use `variant="page"`** for full pages to provide context
4. **Use `variant="action"`** for interactive elements
5. **Provide custom `description`** when default isn't clear enough
6. **Use `previewContent`** for page variant when you have demo data
7. **Set `showTooltip={false}`** for action variant in command menus

## Security Note

When using `variant="block"`, children are NOT rendered in the DOM when the feature is locked. This prevents premium data from being accessible in the page source.

For `variant="action"` and `variant="page"`, children are rendered but disabled/hidden. Use `variant="block"` when security is a concern.

## Accessibility

All variants include:
- Proper ARIA labels
- Keyboard navigation support
- Screen reader announcements
- Touch-friendly targets (44px minimum)
- Focus management

## Styling

The component uses consistent design tokens:
- Border: `border-border/70`
- Background: `bg-card/50` or `bg-muted/40`
- Radius: `rounded-xl`
- Lock icon: `text-muted-foreground`
- Plan badges: `variant="secondary"`
- Disabled opacity: `opacity-50`

## Support

For questions or issues:
1. Check `lib/plans/entitlements.ts` for feature definitions
2. See `.kiro/paywall-audit.md` for complete feature list
3. See `.kiro/paywall-migration-complete.md` for migration guide
