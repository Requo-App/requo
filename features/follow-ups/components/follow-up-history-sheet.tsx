"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { History, Inbox, Search, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { FilterPills } from "@/components/shared/filter-pills";
import { getFollowUpRelatedHref } from "@/features/follow-ups/components/follow-up-item";
import {
  FollowUpSendModeBadge,
  FollowUpStatusBadge,
} from "@/features/follow-ups/components/follow-up-status-badge";
import {
  formatFollowUpDate,
  getFollowUpChannelLabel,
} from "@/features/follow-ups/utils";
import type { FollowUpStatus, FollowUpView } from "@/features/follow-ups/types";

const statusFilterOptions: { label: string; value: FollowUpStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Done", value: "completed" },
  { label: "Dismissed", value: "skipped" },
];

type FollowUpHistorySheetProps = {
  businessSlug: string;
  history: FollowUpView[];
  historyCount: number;
};

export function FollowUpHistorySheet({
  businessSlug,
  history,
  historyCount,
}: FollowUpHistorySheetProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FollowUpStatus | "all">("all");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return history.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.customerName.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q) ||
        (item.quoteNumber?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [history, query, statusFilter]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label={historyCount > 0 ? `History (${historyCount})` : "History"}
          title={historyCount > 0 ? `History (${historyCount})` : "History"}
          size="sm"
          className={mobileNavbarIconButtonClassName}
          type="button"
          variant="outline"
        >
          <History data-icon="inline-start" />
          <span className="hidden lg:inline">History</span>
          {historyCount > 0 ? (
            <span className="ml-1 tabular-nums text-muted-foreground max-lg:hidden">
              ({historyCount})
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Follow-up history</SheetTitle>
          <SheetDescription>
            {historyCount === 0
              ? "No history yet."
              : `${historyCount} ${historyCount === 1 ? "follow-up" : "follow-ups"} done or dismissed`}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4 overflow-y-auto">
          {history.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <label className="sr-only" htmlFor="follow-up-history-search">
                  Search follow-up history
                </label>
                <Input
                  id="follow-up-history-search"
                  className="pl-9"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search name, title, or quote..."
                  type="search"
                  value={query}
                />
              </div>
              <FilterPills
                label="Status"
                options={statusFilterOptions}
                value={statusFilter}
                onChange={setStatusFilter}
              />
            </div>
          ) : null}

          {history.length === 0 ? (
            <Empty className="rounded-none border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyDescription>
                  Completed and dismissed follow-ups will appear here.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : filtered.length === 0 ? (
            <Empty className="rounded-none border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchX />
                </EmptyMedia>
                <EmptyDescription>No matches found.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery("");
                    setStatusFilter("all");
                  }}
                >
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <div className="flex flex-col gap-2.5">
              <p className="data-list-toolbar-count">
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </p>
              {filtered.map((item) => {
                const finishedAt =
                  item.completedAt ?? item.skippedAt ?? item.updatedAt;

                return (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 rounded-xl border border-border/80 bg-muted/60 px-3.5 py-3"
                  >
                    <Link
                      className="block min-w-0 truncate text-sm font-semibold tracking-tight text-foreground hover:underline"
                      href={getFollowUpRelatedHref(businessSlug, item)}
                      prefetch={true}
                    >
                      {item.customerName}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground/90">
                      {formatFollowUpDate(finishedAt, item.businessTimezone)}
                      {" · via "}
                      {getFollowUpChannelLabel(item.channel)}
                    </p>
                    {item.completionNote ? (
                      <p className="line-clamp-2 text-xs text-muted-foreground/90">
                        {item.completionNote}
                      </p>
                    ) : null}
                    <div className="flex items-center gap-1.5 pt-1">
                      <FollowUpStatusBadge status={item.status} />
                      <FollowUpSendModeBadge sendMode={item.sendMode ?? "manual"} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
