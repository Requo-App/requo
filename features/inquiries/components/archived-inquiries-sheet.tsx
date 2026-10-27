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
import { InquiryStatusBadge } from "@/features/inquiries/components/inquiry-status-badge";
import { bulkUnarchiveInquiriesAction } from "@/features/inquiries/actions";
import type {
  DashboardInquiryListItem,
  InquiryRecordActionState,
  InquiryStatus,
} from "@/features/inquiries/types";
import { getBusinessInquiryPath } from "@/features/businesses/routes";
import {
  formatInquiryDate,
  getInquirySourceLabel,
} from "@/features/inquiries/utils";
import { useAnimatedList } from "@/hooks/use-animated-list";
import { useBulkSelection } from "@/hooks/use-bulk-selection";

const statusFilterOptions: { label: string; value: InquiryStatus | "all" }[] = [
  { label: "All statuses", value: "all" },
  { label: "New", value: "new" },
  { label: "Waiting", value: "waiting" },
  { label: "Quoted", value: "quoted" },
  { label: "Overdue", value: "overdue" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
];

type ArchivedInquiriesSheetProps = {
  businessSlug: string;
  items: DashboardInquiryListItem[];
  unarchiveAction: (
    inquiryId: string,
    state: InquiryRecordActionState,
    formData: FormData,
  ) => Promise<InquiryRecordActionState>;
};

export function ArchivedInquiriesSheet({
  businessSlug,
  items,
  unarchiveAction,
}: ArchivedInquiriesSheetProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<InquiryStatus | "all">(
    "all",
  );
  const [formFilter, setFormFilter] = useState("all");

  const {
    items: archived,
    getMotionState,
    getItemRef,
    isPendingKey,
    removeItem,
    removeItems,
  } = useAnimatedList(items);

  const formOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const item of archived) {
      const slug = item.serviceSlug ?? "__no_form__";
      const name = item.serviceName ?? getInquirySourceLabel(item.source);
      if (!seen.has(slug)) {
        seen.set(slug, name);
      }
    }
    return Array.from(seen, ([slug, name]) => ({ slug, name }));
  }, [archived]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return archived.filter((item) => {
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (formFilter !== "all" && (item.serviceSlug ?? "__no_form__") !== formFilter)
        return false;
      if (!q) return true;
      return (
        item.customerName.toLowerCase().includes(q) ||
        (item.customerEmail?.toLowerCase().includes(q) ?? false) ||
        getInquirySourceLabel(item.source).toLowerCase().includes(q) ||
        (item.subject?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [archived, query, statusFilter, formFilter]);

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
    formData.set("inquiryIds", restoreIds.join(","));
    removeItems(restoreIds, () => bulkUnarchiveInquiriesAction({}, formData));
    deselectAll();
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          aria-label="Archived inquiries"
          title="Archived inquiries"
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
          <SheetTitle>Archived inquiries</SheetTitle>
          <SheetDescription>
            {archived.length === 0
              ? "No archived inquiries yet."
              : `${archived.length} archived ${archived.length === 1 ? "inquiry" : "inquiries"}`}
          </SheetDescription>
        </SheetHeader>
        <SheetBody className="flex flex-col gap-4 overflow-y-auto">
          {archived.length > 0 ? (
            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <label className="sr-only" htmlFor="archived-inquiry-search">
                  Search archived inquiries
                </label>
                <Input
                  id="archived-inquiry-search"
                  className="pl-9"
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder="Search name, email, or subject..."
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
              {formOptions.length > 0 ? (
                <FilterPills
                  label="Service"
                  options={[
                    { label: "All services", value: "all" },
                    ...formOptions.map((form) => ({
                      label: form.name,
                      value: form.slug,
                    })),
                  ]}
                  value={formFilter}
                  onChange={setFormFilter}
                />
              ) : null}
            </div>
          ) : null}

          {selectedCount > 0 ? (
            <div
              className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2"
              role="toolbar"
              aria-label="Archived inquiries bulk actions"
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
                <EmptyDescription>Archived inquiries will appear here.</EmptyDescription>
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
                    setFormFilter("all");
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
                    className="motion-list-item flex flex-col gap-1.5 rounded-xl border border-border/80 bg-muted/60 px-3.5 py-3"
                    data-motion-state={getMotionState(item.id)}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        aria-label={`Select inquiry from ${item.customerName}`}
                        checked={isSelected(item.id)}
                        onCheckedChange={() => toggle(item.id)}
                        className="mt-0.5 size-4 rounded-md"
                      />
                      <Link
                        className="block min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-foreground hover:underline"
                        href={getBusinessInquiryPath(businessSlug, item.id)}
                      >
                        {item.customerName}
                      </Link>
                    </div>
                    {item.customerEmail ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {item.customerEmail}
                      </p>
                    ) : null}
                    <p className="truncate text-xs text-muted-foreground/90">
                      {item.serviceName ??
                        getInquirySourceLabel(item.source)}
                      {" · "}
                      {formatInquiryDate(item.submittedAt)}
                    </p>
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <InquiryStatusBadge size="sm" status={item.status} />
                      <Button
                        disabled={pending}
                        onClick={() =>
                          removeItem(item.id, () =>
                            unarchiveAction(item.id, {}, new FormData()),
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
