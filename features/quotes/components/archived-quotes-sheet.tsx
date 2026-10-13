"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Archive, Inbox, RotateCcw, Search, SearchX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
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
import { Spinner } from "@/components/ui/spinner";
import { FilterPills } from "@/components/shared/filter-pills";
import { QuoteStatusBadge } from "@/features/quotes/components/quote-status-badge";
import { bulkRestoreQuotesAction } from "@/features/quotes/actions";
import { formatQuoteDate, formatQuoteMoney } from "@/features/quotes/utils";
import type {
  DashboardQuoteListItem,
  QuoteStatus,
} from "@/features/quotes/types";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import { useAnimatedList } from "@/hooks/use-animated-list";
import { useBulkSelection } from "@/hooks/use-bulk-selection";

type QuoteRecordActionState = { error?: string; success?: string };

const statusFilterOptions: { label: string; value: QuoteStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "Draft", value: "draft" },
  { label: "Sent", value: "sent" },
  { label: "Accepted", value: "accepted" },
  { label: "Rejected", value: "rejected" },
  { label: "Expired", value: "expired" },
  { label: "Voided", value: "voided" },
];

type ArchivedQuotesSheetProps = {
  businessSlug: string;
  items: DashboardQuoteListItem[];
  restoreAction: (
    quoteId: string,
    state: QuoteRecordActionState,
    formData: FormData,
  ) => Promise<QuoteRecordActionState>;
};

export function ArchivedQuotesSheet({
  businessSlug,
  items,
  restoreAction,
}: ArchivedQuotesSheetProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");

  const {
    items: archived,
    getMotionState,
    getItemRef,
    isPendingKey,
    removeItem,
    removeItems,
  } = useAnimatedList(items);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return archived.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!q) return true;
      return (
        item.customerName.toLowerCase().includes(q) ||
        (item.customerEmail?.toLowerCase().includes(q) ?? false) ||
        item.title.toLowerCase().includes(q) ||
        item.quoteNumber.toLowerCase().includes(q)
      );
    });
  }, [archived, query, statusFilter]);

  const {
    selectedCount,
    selectedIds,
    isSelected,
    toggle,
    selectAll,
    deselectAll,
    allSelected,
  } = useBulkSelection(filtered);

  const allFilteredSelected =
    filtered.length > 0 &&
    allSelected(filtered.map((item) => item.id));

  function restoreSelected() {
    const restoreIds = filtered
      .filter((item) => selectedIds.has(item.id))
      .map((item) => item.id);
    if (restoreIds.length === 0) {
      return;
    }
    const formData = new FormData();
    formData.set("quoteIds", restoreIds.join(","));
    removeItems(restoreIds, () => bulkRestoreQuotesAction({}, formData));
    deselectAll();
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label="Archived quotes"
          title="Archived quotes"
          size="sm"
          className={mobileNavbarIconButtonClassName}
          type="button"
          variant="outline"
        >
          <Archive data-icon="inline-start" />
          <span className="hidden lg:inline">Archived</span>
          {archived.length > 0 ? (
            <span className="ml-1 tabular-nums text-muted-foreground max-lg:hidden">
              ({archived.length})
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Archived quotes</SheetTitle>
          <SheetDescription>
            {archived.length === 0
              ? "No archived quotes yet."
              : `${archived.length} archived ${archived.length === 1 ? "quote" : "quotes"}`}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4 overflow-y-auto">
          {archived.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <label className="sr-only" htmlFor="archived-quote-search">
                  Search archived quotes
                </label>
                <Input
                  id="archived-quote-search"
                  className="pl-9"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search name, title, or number..."
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

          {selectedCount > 0 ? (
            <div
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
              role="toolbar"
              aria-label="Archived quotes bulk actions"
            >
              <span className="text-xs font-medium tabular-nums">
                {selectedCount} selected
              </span>
              <Button size="xs" type="button" onClick={restoreSelected}>
                <RotateCcw data-icon="inline-start" />
                Restore selected
              </Button>
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={deselectAll}
              >
                Clear
              </Button>
            </div>
          ) : null}

          {archived.length === 0 ? (
            <Empty className="rounded-none border-0 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyDescription>Archived quotes will appear here.</EmptyDescription>
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
              <div className="flex items-center justify-between gap-2">
                <p className="data-list-toolbar-count">
                  {filtered.length} {filtered.length === 1 ? "result" : "results"}
                </p>
                {filtered.length > 1 && !allFilteredSelected ? (
                  <button
                    className="shrink-0 rounded-sm px-1 py-0.5 text-xs font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() =>
                      selectAll(filtered.map((item) => item.id))
                    }
                    type="button"
                  >
                    Select all
                  </button>
                ) : null}
              </div>
              {filtered.map((item) => {
                const pending = isPendingKey(item.id);
                return (
                  <div
                    key={item.id}
                    ref={getItemRef(item.id)}
                    className="motion-list-item flex flex-col gap-1.5 rounded-xl border border-border/80 bg-background px-3.5 py-3"
                    data-motion-state={getMotionState(item.id)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        aria-label={`Select quote ${item.quoteNumber} for ${item.customerName}`}
                        checked={isSelected(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        className="mt-0.5 size-4 rounded-md"
                      />
                      <Link
                        className="block min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground hover:underline"
                        href={getBusinessQuotePath(businessSlug, item.id)}
                      >
                        {item.quoteNumber} · {item.customerName}
                      </Link>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {item.title}
                    </p>
                    <p className="truncate text-xs text-muted-foreground/90">
                      {formatQuoteMoney(item.totalInCents, item.currency)}
                      {" · Valid until "}
                      {formatQuoteDate(item.validUntil)}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <QuoteStatusBadge size="sm" status={item.status} />
                      <Button
                        disabled={pending}
                        onClick={() =>
                          removeItem(item.id, () =>
                            restoreAction(item.id, {}, new FormData()),
                          )
                        }
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        {pending ? (
                          <Spinner data-icon="inline-start" aria-hidden="true" />
                        ) : (
                          <RotateCcw data-icon="inline-start" />
                        )}
                        {pending ? "Restoring..." : "Restore"}
                      </Button>
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
