import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardEmptyState,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { FollowUpCreateDialog } from "@/features/follow-ups/components/follow-up-create-dialog";
import { FollowUpItem } from "@/features/follow-ups/components/follow-up-item";
import {
  FollowUpStatusBadge,
} from "@/features/follow-ups/components/follow-up-status-badge";
import type {
  FollowUpChannel,
  FollowUpCreateActionState,
  FollowUpView,
} from "@/features/follow-ups/types";
import {
  formatFollowUpDate,
  getDefaultFollowUpChannel,
} from "@/features/follow-ups/utils";
import type { PlanTier } from "@/lib/plans/plans";

type FollowUpCreateAction = (
  state: FollowUpCreateActionState,
  formData: FormData,
) => Promise<FollowUpCreateActionState>;

export function FollowUpPanel({
  businessName,
  businessSlug,
  createAction,
  ctaDescription,
  defaultChannel,
  defaultReason,
  defaultTitle,
  followUps,
  members = [],
  plan = "free",
  timezone,
  sharedQuoteWithoutFollowUp = false,
}: {
  businessName?: string;
  businessSlug: string;
  createAction: FollowUpCreateAction;
  ctaDescription?: string;
  defaultChannel?: FollowUpChannel | string | null;
  defaultReason: string;
  defaultTitle: string;
  followUps: FollowUpView[];
  members?: { userId: string; name: string; email: string }[];
  /** Business plan — automatic sending is a paid capability. */
  plan?: PlanTier;
  /** Business timezone — due dates are read in it. */
  timezone?: string;
  sharedQuoteWithoutFollowUp?: boolean;
}) {
  const pendingFollowUps = followUps.filter((followUp) => followUp.status === "pending");
  const nextFollowUp =
    pendingFollowUps
      .slice()
      .sort((left, right) => left.dueAt.getTime() - right.dueAt.getTime())[0] ??
    null;
  const history = followUps.filter((followUp) => followUp.id !== nextFollowUp?.id);
  const renderCreateDialog = () => (
    <FollowUpCreateDialog
      action={createAction}
      defaultChannel={
        typeof defaultChannel === "string"
          ? getDefaultFollowUpChannel(defaultChannel)
          : defaultChannel ?? "email"
      }
      defaultReason={defaultReason}
      defaultTitle={defaultTitle}
      description={ctaDescription}
      hasLinkedItem
      plan={plan}
      timezone={timezone}
      triggerLabel={sharedQuoteWithoutFollowUp ? "Set reminder" : "Set follow-up"}
    />
  );

  return (
    <DashboardSection
      action={renderCreateDialog()}
      contentClassName="flex flex-col gap-4"
      description="Plan the next customer touchpoint so work does not go cold."
      title="Follow-ups"
    >
      {nextFollowUp ? (
        <div className="flex flex-col gap-3">
          <p className="meta-label">Next pending follow-up</p>
          <FollowUpItem
            businessName={businessName}
            businessSlug={businessSlug}
            followUp={nextFollowUp}
            members={members}
            showMessage
          />
        </div>
      ) : sharedQuoteWithoutFollowUp ? (
        <DashboardEmptyState
          action={renderCreateDialog()}
          description="Set a follow-up reminder so this quote doesn't go cold."
          icon={BellRing}
          title="Set follow-up reminder"
          variant="section"
        />
      ) : followUps.length ? null : (
        <DashboardEmptyState
          action={renderCreateDialog()}
          description="No action needed here. Set a reminder so this record doesn't go cold."
          icon={BellRing}
          title="No follow-ups"
          variant="section"
        />
      )}

      {history.length ? (
        <div className="flex flex-col gap-3">
          <p className="meta-label">Previous ({history.length})</p>
          <DashboardDetailFeed>
            {history.slice(0, 2).map((followUp) => (
              <DashboardDetailFeedItem
                key={followUp.id}
                action={<FollowUpStatusBadge status={followUp.status} />}
                meta={
                  <>
                    <span>Due {formatFollowUpDate(followUp.dueAt, followUp.businessTimezone)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{followUp.related.label}</span>
                  </>
                }
                title={followUp.title}
              />
            ))}
          </DashboardDetailFeed>

          {history.length > 2 && (
            <Sheet>
              <SheetTrigger asChild>
                <Button className="w-full" type="button" variant="outline">
                  View all follow-ups ({history.length})
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Follow-up history</SheetTitle>
                  <SheetDescription>
                    All past follow-ups for this record.
                  </SheetDescription>
                </SheetHeader>
                <SheetBody className="min-h-0 flex-1 gap-5">
                  <ScrollArea className="h-full pr-4">
                    <DashboardDetailFeed>
                      {history.map((followUp) => (
                        <DashboardDetailFeedItem
                          key={followUp.id}
                          action={<FollowUpStatusBadge status={followUp.status} />}
                          meta={
                            <>
                              <span>Due {formatFollowUpDate(followUp.dueAt, followUp.businessTimezone)}</span>
                              <span aria-hidden="true">·</span>
                              <span>{followUp.related.label}</span>
                            </>
                          }
                          title={followUp.title}
                        >
                          <p className="text-sm text-muted-foreground">{followUp.reason}</p>
                        </DashboardDetailFeedItem>
                      ))}
                    </DashboardDetailFeed>
                  </ScrollArea>
                </SheetBody>
              </SheetContent>
            </Sheet>
          )}
        </div>
      ) : null}
    </DashboardSection>
  );
}
