import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardEmptyState,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { InfoTile } from "@/components/shared/info-tile";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
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
import { CustomerHistoryPanel } from "@/features/customers/components/customer-history-panel";
import { InquiryNoteForm } from "@/features/inquiries/components/inquiry-note-form";
import type {
  DashboardInquiryActivity,
  DashboardInquiryNote,
  InquiryNoteActionState,
} from "@/features/inquiries/types";
import { formatInquiryDateTime } from "@/features/inquiries/utils";

export function InquiryActivitySheetSection({
  activities,
}: {
  activities: DashboardInquiryActivity[];
}) {
  const latestActivity = activities[0];

  return (
    <DashboardSection
      description="Submission and owner actions."
      title="Activity log"
    >
      {activities.length ? (
        <div className="flex flex-col gap-3">
          <DashboardDetailFeed>
            <DashboardDetailFeedItem
              meta={
                <>
                  <span>{latestActivity.actorName ?? "Requo"}</span>
                  <span aria-hidden="true">|</span>
                  <span>{formatInquiryDateTime(latestActivity.createdAt)}</span>
                </>
              }
              title={latestActivity.summary}
            />
          </DashboardDetailFeed>

          {activities.length > 1 && (
            <Sheet>
              <SheetTrigger asChild>
                <Button className="w-full" type="button" variant="outline">
                  View all activity
                </Button>
              </SheetTrigger>
              <SheetContent className="w-full sm:max-w-md">
                <SheetHeader>
                  <SheetTitle>Activity log</SheetTitle>
                  <SheetDescription>
                    Complete timeline of events for this inquiry.
                  </SheetDescription>
                </SheetHeader>
                <SheetBody className="min-h-0 flex-1 gap-5">
                  <ScrollArea className="h-full pr-4">
                    <DashboardDetailFeed>
                      {activities.map((activity) => (
                        <DashboardDetailFeedItem
                          key={activity.id}
                          meta={
                            <>
                              <span>{activity.actorName ?? "Requo"}</span>
                              <span aria-hidden="true">|</span>
                              <span>
                                {formatInquiryDateTime(activity.createdAt)}
                              </span>
                            </>
                          }
                          title={activity.summary}
                        />
                      ))}
                    </DashboardDetailFeed>
                  </ScrollArea>
                </SheetBody>
              </SheetContent>
            </Sheet>
          )}
        </div>
      ) : (
        <DashboardEmptyState
          description="Change the status or generate a quote to start the timeline for this inquiry."
          title="No activity yet"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}

export function InquiryNotesSheetSection({
  notes,
  noteAction,
}: {
  notes: DashboardInquiryNote[];
  noteAction: (
    state: InquiryNoteActionState,
    formData: FormData,
  ) => Promise<InquiryNoteActionState>;
}) {
  const latestNote = notes[0];

  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Private business notes and follow-up context."
      title="Internal notes"
    >
      {latestNote ? (
        <DashboardDetailFeed>
          <DashboardDetailFeedItem
            meta={formatInquiryDateTime(latestNote.createdAt)}
            title={latestNote.authorName ?? "Business owner"}
          >
            <TruncatedTextWithTooltip
              className="whitespace-pre-wrap"
              lines={6}
              text={latestNote.body}
            />
          </DashboardDetailFeedItem>
        </DashboardDetailFeed>
      ) : (
        <DashboardEmptyState
          description="Add notes only when you need private context for follow-up."
          title="No internal notes yet"
          variant="section"
        />
      )}

      <Sheet>
        <SheetTrigger asChild>
          <Button className="w-full" type="button" variant="outline">
            Add or view notes
          </Button>
        </SheetTrigger>
        <SheetContent className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Internal notes</SheetTitle>
            <SheetDescription>
              Add private context and review all notes for this inquiry.
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="min-h-0 flex-1 gap-5">
            <InquiryNoteForm action={noteAction} embedded />
            {notes.length ? (
              <ScrollArea className="h-full pr-4">
                <DashboardDetailFeed>
                  {notes.map((note) => (
                    <DashboardDetailFeedItem
                      key={note.id}
                      meta={formatInquiryDateTime(note.createdAt)}
                      title={note.authorName ?? "Business owner"}
                    >
                      <TruncatedTextWithTooltip
                        className="whitespace-pre-wrap"
                        lines={6}
                        text={note.body}
                      />
                    </DashboardDetailFeedItem>
                  ))}
                </DashboardDetailFeed>
              </ScrollArea>
            ) : null}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </DashboardSection>
  );
}

export function CustomerHistorySheetSection({
  businessSlug,
  history,
  locked = false,
}: Parameters<typeof CustomerHistoryPanel>[0] & { locked?: boolean }) {
  return (
    <DashboardSection
      contentClassName="flex flex-col gap-4"
      description="Past records for this customer email inside the current business."
      title="Customer history"
    >
      {locked ? (
        <DashboardEmptyState
          description="Upgrade to Pro to review prior inquiries and quotes for this customer."
          title="Customer history is a Pro feature"
          variant="section"
        />
      ) : history ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <InfoTile label="Past inquiries" value={`${history.inquiryCount}`} />
            <InfoTile label="Past quotes" value={`${history.quoteCount}`} />
          </div>
          <Sheet>
            <SheetTrigger asChild>
              <Button className="w-full" type="button" variant="outline">
                View customer history
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-xl">
              <SheetHeader>
                <SheetTitle>Customer history</SheetTitle>
                <SheetDescription>
                  Past inquiries and quotes for this customer.
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="min-h-0 flex-1">
                <ScrollArea className="h-full pr-4">
                  <CustomerHistoryPanel
                    businessSlug={businessSlug}
                    history={history}
                  />
                </ScrollArea>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </>
      ) : (
        <DashboardEmptyState
          description="No prior inquiries or quotes were found for this customer."
          title="No customer history"
          variant="section"
        />
      )}
    </DashboardSection>
  );
}
