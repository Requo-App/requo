import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Body-only fallbacks for settings pages that render their real
 * <PageHeader /> synchronously and stream the form body via <Suspense>.
 *
 * These intentionally omit the page-header skeleton (which is what the
 * broader skeletons in `dashboard-settings-skeleton.tsx` include).
 */

function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-4 w-24 rounded-md" />
      <Skeleton className={className ?? "h-9 rounded-md sm:h-8"} />
    </div>
  );
}

function CardSkeleton({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("section-panel", className)}>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

function TitleBlock({ titleWidth = "w-40", descriptionWidth = "w-56" }) {
  return (
    <div className="space-y-2">
      <Skeleton className={cn("h-6 rounded-md", titleWidth)} />
      <Skeleton className={cn("h-4 rounded-md", descriptionWidth)} />
    </div>
  );
}

/**
 * Static shell fallback for the Business profile (general) settings page.
 *
 * Mirrors BusinessSettingsForm's real layout (max-w-xl, bare sections, no
 * cards) with real static copy — section titles, descriptions, and field
 * labels paint instantly like (main) PageHeader titles. Only the controls
 * that need DB values (logo, inputs, selects) render as skeletons.
 */
export function BusinessGeneralSettingsStaticFallback() {
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-10"
      aria-hidden="true"
    >
      <StaticSection title="Picture">
        <div className="flex items-start gap-4">
          <Skeleton className="size-20 shrink-0 rounded-xl" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-9 w-24 rounded-md sm:h-8" />
            <Skeleton className="h-9 w-24 rounded-md sm:h-8" />
          </div>
        </div>
      </StaticSection>

      <StaticSection title="Name" description="Name of your business.">
        <StaticField label="Name" />
      </StaticSection>

      <StaticSection
        title="Business website"
        description="Link customers to your site from quotes and your public page."
      >
        <StaticField label="Website" />
      </StaticSection>

      <StaticSection
        title="Contact"
        description="Use the same reply address customers recognize."
      >
        <StaticField label="Contact email" />
      </StaticSection>

      <StaticSection
        title="Public address"
        description="Customers use this address to reach your inquiry pages."
      >
        <StaticField label="Public slug">
          <Skeleton className="h-4 w-48 rounded-md" />
        </StaticField>
      </StaticSection>

      <StaticSection
        title="Business summary"
        description="Keep this short so public inquiry pages stay easy to scan."
      >
        <StaticField label="Short description" controlClassName="h-24 rounded-md" />
      </StaticSection>

      <StaticSection
        title="Regional defaults"
        description="Applied to new quotes and pricing entries. Existing quotes keep their original currency."
      >
        <div className="flex flex-col gap-5">
          <StaticField label="Country" />
          <StaticField label="Default currency" />
        </div>
      </StaticSection>

      <StaticSection
        title="Danger zone"
        description="Archive or permanently delete this business."
      >
        <Skeleton className="h-9 w-36 rounded-md sm:h-8" />
      </StaticSection>
    </div>
  );
}

function StaticSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function StaticField({
  label,
  children,
  controlClassName,
}: {
  label: string;
  children?: ReactNode;
  controlClassName?: string;
}) {
  return (
    <div className="grid gap-3">
      <span className="text-sm font-medium leading-[1.35] text-foreground">
        {label}
      </span>
      <Skeleton className={controlClassName ?? "h-9 rounded-md sm:h-8"} />
      {children}
    </div>
  );
}

function StaticSwitch() {
  return (
    <Skeleton
      className="h-6 w-11 shrink-0 rounded-full"
      aria-hidden="true"
    />
  );
}

/**
 * Static shell fallback for the notifications settings page.
 *
 * Mirrors BusinessNotificationSettingsForm's real layout (max-w-xl, bare
 * sections) with real static copy — section titles, descriptions, and every
 * toggle label/description paint instantly. Only the Switch controls (which
 * need DB values) render as skeletons. Toggle copy is duplicated from
 * business-notification-settings-form.tsx — keep in sync.
 */
export function BusinessNotificationSettingsStaticFallback() {
  const inAppToggles = [
    { label: "New inquiry received", description: "A customer submits an inquiry form." },
    { label: "Follow-up reminder", description: "An inquiry hasn't had a response in a while." },
    { label: "Quote sent", description: "A quote is sent to a customer." },
    { label: "Quote response", description: "A customer accepts or declines a quote." },
    { label: "Quote expiring", description: "A sent quote is about to expire." },
    { label: "Member invite response", description: "A team member accepts or declines an invite." },
  ];
  const pushToggles = [
    { label: "New inquiry received", description: "A customer submits an inquiry form." },
    { label: "Quote sent", description: "A quote is sent to a customer." },
    { label: "Quote response", description: "A customer accepts or declines a quote." },
    { label: "Member invite response", description: "A team member accepts or declines an invite." },
  ];

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-10"
      aria-hidden="true"
    >
      <StaticSection
        title="In-app notifications"
        description="Shown in the notification bell on your dashboard."
      >
        <div className="flex flex-col gap-5">
          {inAppToggles.map((toggle) => (
            <div
              className="flex items-center justify-between gap-4"
              key={`inapp-${toggle.label}`}
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-[1.35] text-foreground">
                  {toggle.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {toggle.description}
                </span>
              </div>
              <StaticSwitch />
            </div>
          ))}
        </div>
      </StaticSection>

      <StaticSection
        title="Push notifications"
        description="Sent to browsers where you've enabled push notifications."
      >
        <div className="flex flex-col gap-5">
          {pushToggles.map((toggle) => (
            <div
              className="flex items-center justify-between gap-4"
              key={`push-${toggle.label}`}
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-[1.35] text-foreground">
                  {toggle.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {toggle.description}
                </span>
              </div>
              <StaticSwitch />
            </div>
          ))}
        </div>
      </StaticSection>
    </div>
  );
}

/**
 * Static shell fallback for the quote defaults tab.
 *
 * Mirrors BusinessQuoteSettingsForm's real layout (max-w-xl, bare sections)
 * with real static copy. Only number inputs, textareas, and Switch controls
 * (which need DB values) render as skeletons. Copy duplicated from
 * business-quote-settings-form.tsx — keep in sync.
 */
export function BusinessQuoteDefaultsStaticFallback() {
  const switchRows = [
    {
      label: "Inquiry acknowledgment email",
      description: "Send customers a confirmation email when they submit an inquiry.",
    },
    {
      label: "AI draft quote on qualified inquiries",
      description:
        "Generate a draft quote automatically when an inquiry is qualified. Subject to the plan's AI usage limits.",
    },
    {
      label: "Auto-archive stale inquiries",
      description: "Archive open inquiries with no activity after the idle window below.",
    },
  ];

  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-10"
      aria-hidden="true"
    >
      <StaticSection
        title="Quote defaults"
        description="These defaults apply to new quotes only. Existing quotes keep their stored values."
      >
        <div className="flex flex-col gap-5">
          <div className="grid gap-3">
            <span className="text-sm font-medium leading-[1.35] text-foreground">
              Default validity period
            </span>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-24 rounded-md sm:h-8" />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <span className="text-sm text-muted-foreground">
              How long new quotes stay valid before expiring (1–365 days).
            </span>
          </div>
          <StaticField
            label="Default quote notes"
            controlClassName="h-36 rounded-md"
          >
            <span className="text-sm text-muted-foreground">
              Automatically added to the notes section of every new quote. Customers
              see this on the public quote page.
            </span>
          </StaticField>
          <StaticField
            label="Default terms & conditions"
            controlClassName="h-36 rounded-md"
          >
            <span className="text-sm text-muted-foreground">
              Automatically included in the terms section of every new quote.
              Displayed below line items on the public quote page.
            </span>
          </StaticField>
        </div>
      </StaticSection>

      <StaticSection
        title="Inquiry handling"
        description="Automations that run as new inquiries arrive."
      >
        <div className="flex flex-col gap-5">
          {switchRows.map((row) => (
            <div
              className="flex items-center justify-between gap-4"
              key={row.label}
            >
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium leading-[1.35] text-foreground">
                  {row.label}
                </span>
                <span className="text-sm text-muted-foreground">
                  {row.description}
                </span>
              </div>
              <StaticSwitch />
            </div>
          ))}
          <div className="grid gap-3">
            <span className="text-sm font-medium leading-[1.35] text-foreground">
              Stale inquiry idle window
            </span>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-24 rounded-md sm:h-8" />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <span className="text-sm text-muted-foreground">
              Inquiries are archived when they receive no activity for this many
              days (1–365).
            </span>
          </div>
        </div>
      </StaticSection>

      <StaticSection
        title="Quote follow-ups"
        description="Automations that run after a quote is sent."
      >
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium leading-[1.35] text-foreground">
                Follow up on viewed quotes
              </span>
              <span className="text-sm text-muted-foreground">
                Create a follow-up task when a customer views a quote but hasn&apos;t
                responded after the delay below.
              </span>
            </div>
            <StaticSwitch />
          </div>
          <div className="grid gap-3">
            <span className="text-sm font-medium leading-[1.35] text-foreground">
              Follow-up delay after view
            </span>
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-24 rounded-md sm:h-8" />
              <span className="text-sm text-muted-foreground">days</span>
            </div>
            <span className="text-sm text-muted-foreground">
              How long to wait after a quote is viewed before creating the
              follow-up task (1–90).
            </span>
          </div>
        </div>
      </StaticSection>
    </div>
  );
}

/**
 * Static shell fallback for the assistant (public chat) settings tab.
 *
 * Mirrors BusinessAgentSettingsForm's real layout (max-w-xl, bare sections)
 * with real static copy. Only the enable switch, tone selector, chat link,
 * and instructions textarea (which need DB values) render as skeletons. Copy
 * duplicated from business-agent-settings-form.tsx — keep in sync.
 */
export function BusinessAssistantStaticFallback() {
  return (
    <div
      className="mx-auto flex w-full max-w-xl min-w-0 flex-col gap-10"
      aria-hidden="true"
    >
      <StaticSection
        title="Public chat"
        description="A public link where customers can ask questions and share what they need. New inquiries land in your inbox."
      >
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border/70 px-4 py-3">
          <span className="min-w-0 text-sm text-foreground">
            Enable public chat
            <span className="block text-xs text-muted-foreground">
              Your chat link is live for customers.
            </span>
          </span>
          <StaticSwitch />
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-medium text-foreground">
            Tone of voice
          </span>
          <div className="inline-flex h-9 w-full max-w-xs gap-1 rounded-md border border-border/60 bg-muted/30 p-1 sm:h-8">
            {["Friendly", "Professional", "Casual"].map((tone, index) => (
              <span
                className={cn(
                  "flex flex-1 items-center justify-center rounded-md px-2.5 text-xs font-medium",
                  index === 0
                    ? "border border-border/50 bg-card text-foreground shadow-xs"
                    : "text-muted-foreground",
                )}
                key={tone}
              >
                {tone}
              </span>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            How your public chat sounds to customers.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex h-9 items-center justify-between gap-2 rounded-md border border-input/95 px-3 sm:h-8">
            <Skeleton className="h-3 w-40 rounded-md" />
            <Skeleton className="size-7 shrink-0 rounded-md" />
          </div>
          <p className="text-sm text-muted-foreground">
            Share this link anywhere customers reach you.
          </p>
        </div>
      </StaticSection>

      <StaticSection
        title="Business instructions"
        description="Appended to every AI reply, for both your public chat and your assistant. Describe the work you take on, how you price it, and what to avoid promising."
      >
        <div className="grid gap-3">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
      </StaticSection>
    </div>
  );
}

/**
 * Static shell fallback for the email templates settings page.
 *
 * The template tab bar, kind title/description, subject label, merge-tag
 * labels, and canvas headings are static config — they paint instantly. Only
 * the subject input, canvas blocks, and inspector (which need DB values)
 * render as skeletons. Assumes the default Quote tab; kind labels come from
 * the static email-templates module.
 */
export function BusinessEmailTemplateStaticFallback({
  kindLabel,
  kindDescription,
  mergeTags,
}: {
  kindLabel: string;
  kindDescription: string;
  mergeTags: ReadonlyArray<{ tag: string; label: string }>;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6" aria-hidden="true">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          {kindLabel}
        </h2>
        <p className="text-sm font-semibold tracking-tight text-foreground">
          {kindDescription}
        </p>
      </div>

      <div className="flex w-full max-w-xl flex-col gap-5">
        <StaticField label="Subject line" />
        <div className="grid gap-3">
          <span className="text-sm font-medium leading-[1.35] text-foreground">
            Available merge tags
          </span>
          <p className="text-sm leading-7 text-muted-foreground">
            {mergeTags.map((tag, index) => (
              <span key={tag.tag}>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
                  {tag.tag}
                </code>
                <span className="text-xs"> ({tag.label})</span>
                {index < mergeTags.length - 1 ? ", " : ""}
              </span>
            ))}
          </p>
        </div>
      </div>

      <div>
        <p className="text-sm font-medium text-foreground">Email content</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          This is your actual email. Click a block to edit it in the inspector,
          drag blocks to reorder, hide blocks to skip them without deleting.
        </p>
      </div>

      <div className="grid w-full items-start gap-6 lg:grid-cols-[minmax(0,640px)_320px] lg:justify-center">
        <div className="mx-auto w-full max-w-[640px] min-w-0 space-y-3 lg:mx-0">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
        <div className="mx-auto w-full max-w-[640px] min-w-0 lg:mx-0 lg:w-[320px] lg:max-w-none">
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export function SettingsFormBodySkeleton() {
  return (
    <div className="dashboard-side-stack">
      <CardSkeleton>
        <TitleBlock />
        <div className="grid gap-4">
          <FieldSkeleton />
          <FieldSkeleton />
          <FieldSkeleton className="h-20 rounded-md" />
        </div>
        <div className="flex justify-end">
          <Skeleton className="h-9 w-32 rounded-md sm:h-8" />
        </div>
      </CardSkeleton>
      <CardSkeleton>
        <TitleBlock titleWidth="w-32" descriptionWidth="w-48" />
        <FieldSkeleton />
        <FieldSkeleton className="h-20 rounded-md" />
      </CardSkeleton>
    </div>
  );
}

export function SettingsCollectionBodySkeleton() {
  return (
    <div className="dashboard-side-stack">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/75 bg-muted/30 px-5 py-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
        </div>
        <Skeleton className="h-9 w-36 rounded-md sm:h-8" />
      </div>
      <CardSkeleton>
        <TitleBlock titleWidth="w-32" descriptionWidth="w-44" />
        <div className="overflow-hidden rounded-xl border border-border/70 bg-background/50 shadow-sm">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              className={cn(index > 0 && "border-t border-border/70")}
              key={index}
            >
              <div className="flex items-start justify-between gap-4 px-4 py-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-28 rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-11/12 rounded-md" />
                </div>
                <Skeleton className="size-8 rounded-lg" />
              </div>
            </div>
          ))}
        </div>
      </CardSkeleton>
    </div>
  );
}

export function SettingsPricingBodySkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Stats summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="flex items-start gap-3 rounded-xl border border-border/75 bg-card/97 p-4" key={i}>
            <Skeleton className="size-8 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2 py-0.5">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-6 w-12 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar: tabs + add button */}
      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-full max-w-[20rem] rounded-md sm:h-8" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-32 rounded-md sm:h-8" />
          <Skeleton className="h-9 w-28 rounded-md sm:h-8" />
        </div>
      </div>

      {/* Entries list */}
      <div className="overflow-hidden rounded-xl border border-border/75">
        <div className="divide-y divide-border/60">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              className="flex items-start gap-3 px-4 py-2.5 sm:items-center sm:gap-4 sm:px-4 sm:py-3"
              key={index}
            >
              <Skeleton className="mt-0.5 size-8 rounded-lg sm:mt-0" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-32 rounded-md" />
                    <Skeleton className="h-4 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-48 rounded-md" />
                </div>
                <Skeleton className="h-4 w-16 shrink-0 rounded-md" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BillingStatusCardBodySkeleton() {
  return (
 <section className="section-panel">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-5 w-40 rounded-md" />
            <Skeleton className="h-4 w-60 rounded-md" />
          </div>
          <Skeleton className="h-9 w-32 rounded-md sm:h-8" />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div className="info-tile" key={index}>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-6 w-24 rounded-md" />
                <Skeleton className="h-3 w-28 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ManagerBodySkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Action row */}
      <div className="flex justify-end gap-2">
        <Skeleton className="h-9 w-[8.5rem] rounded-md sm:h-8" />
      </div>

      {/* Form list table */}
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="border-b border-border/70 bg-muted/30 px-4 py-3">
          <div className="grid grid-cols-[18rem_12rem_8rem_9rem_3rem] gap-4">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-4 w-14 rounded-md" />
            <Skeleton className="h-4 w-8 rounded-md" />
          </div>
        </div>
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            className={cn(
              "grid grid-cols-[18rem_12rem_8rem_9rem_3rem] items-center gap-4 px-4 py-4",
              index > 0 && "border-t border-border/70",
            )}
            key={index}
          >
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-48 rounded-md" />
            </div>
            <Skeleton className="h-5 w-24 rounded-full" />
            <Skeleton className="h-4 w-8 rounded-md" />
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-8 w-8 rounded-md justify-self-end" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AiSettingsBodySkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {/* Top settings card skeleton */}
      <div className="rounded-xl border border-border/75 bg-card/97 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <Skeleton className="size-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-5 w-32 rounded-md" />
              <Skeleton className="h-4 w-72 max-w-full rounded-md" />
            </div>
          </div>
          <Skeleton className="h-6 w-14 rounded-full" />
        </div>
      </div>

      {/* Knowledge stats skeleton */}
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            className="flex items-start gap-3 rounded-xl border border-border/75 bg-card/97 p-4"
            key={i}
          >
            <Skeleton className="size-8 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2 py-0.5">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-6 w-12 rounded-md" />
              <Skeleton className="h-3 w-20 rounded-md" />
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-9 w-48 rounded-md sm:h-8" />
        <div className="flex gap-2">
          <Skeleton className="h-9 w-32 rounded-md sm:h-8" />
          <Skeleton className="h-9 w-28 rounded-md sm:h-8" />
        </div>
      </div>

      {/* List skeleton */}
      <div className="overflow-hidden rounded-xl border border-border/75">
        <div className="divide-y divide-border/60">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              className="flex items-center gap-4 px-5 py-4"
              key={index}
            >
              <Skeleton className="size-8 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40 rounded-md" />
                <Skeleton className="h-3 w-64 rounded-md" />
              </div>
              <Skeleton className="size-8 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Static shell fallback for the billing settings page.
 *
 * Mirrors BillingStatusCard's real layout (flex-col gap-8, cards) with real
 * static copy — section headings, descriptions, detail labels, usage notes,
 * and the static action labels paint instantly. Only DB-backed values
 * (plan name, dates, payment method, usage numbers, portal/upgrade actions)
 * render as skeletons. Copy duplicated from billing-status-card.tsx — keep
 * in sync. The page already renders the sr-only title + max-w-2xl wrapper
 * synchronously around this fallback.
 */
export function BillingStatusStaticFallback() {
  const detailRows: Array<{ label: string; valueWidth: string }> = [
    { label: "Plan", valueWidth: "w-20" },
    { label: "Renewal date", valueWidth: "w-24" },
    { label: "Payment method", valueWidth: "w-28" },
    { label: "Price", valueWidth: "w-16" },
    { label: "Emails included", valueWidth: "w-24" },
  ];

  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Subscription</h2>
        <Skeleton className="h-4 w-64 max-w-full rounded-md" />
        <div className="rounded-xl border border-border/75 bg-card">
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-24 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Skeleton className="h-8 w-28 rounded-md" />
                <Skeleton className="h-8 w-32 rounded-md" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 sm:gap-6">
              <div className="flex flex-col gap-3">
                {detailRows.slice(0, 3).map((row) => (
                  <p className="min-w-0 truncate text-sm" key={row.label}>
                    <span className="text-muted-foreground">{row.label} </span>
                    <Skeleton
                      className={`inline-block h-4 rounded-md align-middle ${row.valueWidth}`}
                    />
                  </p>
                ))}
              </div>
              <div className="flex flex-col gap-3 sm:border-l sm:border-border sm:pl-6">
                {detailRows.slice(3).map((row) => (
                  <p className="min-w-0 truncate text-sm" key={row.label}>
                    <span className="text-muted-foreground">{row.label} </span>
                    <Skeleton
                      className={`inline-block h-4 rounded-md align-middle ${row.valueWidth}`}
                    />
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">Credits</h2>
        <p className="text-sm text-muted-foreground">
          Credits are used by AI quote drafts, the assistant, and agent chats.
        </p>
        <div className="rounded-xl border border-border/75 bg-card">
          <div className="flex flex-col gap-5 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-foreground">
                <Skeleton className="h-4 w-36 rounded-md" />
                <span className="text-muted-foreground">/month</span>
              </p>
              <Skeleton className="h-8 w-20 rounded-md" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-1.5 w-full rounded-full" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">
                  Resets monthly
                </span>
                <Skeleton className="h-3 w-40 rounded-md" />
              </div>
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-4">
              <Skeleton className="h-5 w-48 rounded-md" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-1.5 w-full rounded-full" />
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-28 rounded-md" />
                  <Skeleton className="h-3 w-40 rounded-md" />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex h-8 items-center rounded-md border border-border/70 px-3 text-sm font-medium text-foreground">
                View usage
              </span>
              <span className="inline-flex h-8 items-center rounded-md border border-border/70 px-3 text-sm font-medium text-foreground">
                How credits work
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

