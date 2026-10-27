"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ChevronDown, ChevronUp, Search, Library, SearchX } from "lucide-react";
import { usePathname } from "next/navigation";

import { DashboardMetaPill } from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  EmptyMedia,
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
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  DashboardQuoteLibraryEntry,
  QuoteEditorLineItemValue,
  QuoteLibraryEntryKind,
} from "@/features/quotes/types";
import {
  getBusinessSlugFromPathname,
  getBusinessSettingsPath,
  getBusinessQuoteLibraryPath,
  homePath,
} from "@/features/businesses/routes";
import {
  formatQuoteMoney,
  getQuoteLibraryEntryKindLabel,
  isQuoteEditorLineItemBlank,
} from "@/features/quotes/utils";

type QuoteLibrarySheetProps = {
  currency: string;
  entries: DashboardQuoteLibraryEntry[];
  initialTab?: string | null;
  items: QuoteEditorLineItemValue[];
  onInsert: (entry: DashboardQuoteLibraryEntry) => void;
  onApplyTemplate?: (entry: DashboardQuoteLibraryEntry) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type QuoteLibraryTabValue = "all" | QuoteLibraryEntryKind;

export function QuoteLibrarySheet({
  currency,
  entries,
  initialTab,
  items,
  onInsert,
  onApplyTemplate,
  open,
  onOpenChange,
}: QuoteLibrarySheetProps) {
  const pathname = usePathname();
  const isTemplateMode = initialTab === "template";
  const [tab, setTab] = useState<QuoteLibraryTabValue>(
    isTemplateMode ? "template" : "all",
  );
  const [search, setSearch] = useState("");
  const [expandedPreviewId, setExpandedPreviewId] = useState<string | null>(null);
  const deferredSearch = useDeferredValue(search);

  const [prevOpen, setPrevOpen] = useState(open);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setTab(initialTab === "template" ? "template" : "all");
      setSearch("");
      setExpandedPreviewId(null);
    }
  }

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const businessSlug = getBusinessSlugFromPathname(pathname);
  const shouldReplacePlaceholder =
    items.length === 1 && isQuoteEditorLineItemBlank(items[0]);
  const baseItemCount = shouldReplacePlaceholder ? 0 : items.length;

  // In template mode, only show templates. In pricing mode, exclude templates.
  const availableEntries = isTemplateMode
    ? entries.filter((e) => e.kind === "template")
    : entries.filter((e) => e.kind !== "template");

  const filteredEntries = availableEntries.filter((entry) => {
    if (!isTemplateMode && tab !== "all" && entry.kind !== tab) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      entry.name,
      entry.currency,
      entry.description ?? "",
      ...entry.items.map((item) => item.description),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });

  // Sort templates by recency
  const sortedEntries = isTemplateMode
    ? [...filteredEntries].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    : filteredEntries;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[92vw] sm:max-w-xl" side="right">
        <SheetHeader>
          <SheetTitle>
            {isTemplateMode ? "Choose a template" : "Insert saved pricing"}
          </SheetTitle>
          <SheetDescription>
            {isTemplateMode
              ? "Pick a template to replace your quote's title, notes, terms, and line items."
              : "Choose a saved block or package to add to this quote."}
          </SheetDescription>
        </SheetHeader>

        <SheetBody className="min-h-0 flex-1 gap-0 px-0 py-0 sm:px-0 sm:py-0">
          <div className="flex flex-col gap-4 border-b border-border/70 px-5 py-5 sm:px-6 sm:py-6">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder={isTemplateMode ? "Search templates" : "Search saved pricing"}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
              />
            </div>

            {!isTemplateMode ? (
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as QuoteLibraryTabValue)}
              >
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="block">Blocks</TabsTrigger>
                  <TabsTrigger value="package">Packages</TabsTrigger>
                </TabsList>
              </Tabs>
            ) : null}
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-5 py-5 sm:px-6 sm:py-6">
            {availableEntries.length === 0 ? (
              <Empty className="border-border/70 bg-background/80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Library />
                  </EmptyMedia>
                  <EmptyTitle>
                    {isTemplateMode ? "No templates yet" : "No saved pricing yet"}
                  </EmptyTitle>
                  <EmptyDescription>
                    {isTemplateMode
                      ? "Create quote templates in Settings → Quotes to pre-fill entire quotes."
                      : "Save pricing blocks or packages in Business settings first."}
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button asChild variant="outline">
                    <Link
                      href={
                        businessSlug
                          ? isTemplateMode
                            ? getBusinessSettingsPath(businessSlug, "quote")
                            : getBusinessQuoteLibraryPath(businessSlug)
                          : homePath
                      }
                    >
                      {isTemplateMode ? "Open quote settings" : "Open quote library"}
                    </Link>
                  </Button>
                </EmptyContent>
              </Empty>
            ) : sortedEntries.length === 0 ? (
              <Empty className="border-border/70 bg-background/80">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <SearchX />
                  </EmptyMedia>
                  <EmptyTitle>No matching entries</EmptyTitle>
                  <EmptyDescription>
                    Try a different search{!isTemplateMode ? " or switch back to another tab" : ""}.
                  </EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      if (!isTemplateMode) setTab("all");
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <div className="flex flex-col gap-4">
                {sortedEntries.map((entry) => (
                  <LibraryEntryCard
                    key={entry.id}
                    baseItemCount={baseItemCount}
                    currency={currency}
                    entry={entry}
                    expandedPreviewId={expandedPreviewId}
                    onApplyTemplate={onApplyTemplate}
                    onInsert={onInsert}
                    onTogglePreview={setExpandedPreviewId}
                  />
                ))}
              </div>
            )}
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

function LibraryEntryCard({
  baseItemCount,
  currency,
  entry,
  expandedPreviewId,
  onApplyTemplate,
  onInsert,
  onTogglePreview,
}: {
  baseItemCount: number;
  currency: string;
  entry: DashboardQuoteLibraryEntry;
  expandedPreviewId: string | null;
  onApplyTemplate?: (entry: DashboardQuoteLibraryEntry) => void;
  onInsert: (entry: DashboardQuoteLibraryEntry) => void;
  onTogglePreview: (id: string | null) => void;
}) {
  const nextItemCount = baseItemCount + entry.items.length;
  const wouldExceedLimit = nextItemCount > 50;
  const hasCurrencyMismatch = entry.currency !== currency;
  const isTemplate = entry.kind === "template";
  const isPreviewExpanded = expandedPreviewId === entry.id;
  const defaultPreviewCount = 3;

  return (
    <div
      className="soft-panel flex flex-col gap-4 shadow-none"
      data-testid="quote-library-sheet-entry"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-foreground">
              {entry.name}
            </p>
            <DashboardMetaPill>
              {getQuoteLibraryEntryKindLabel(entry.kind)}
            </DashboardMetaPill>
            <DashboardMetaPill>
              {entry.itemCount} {entry.itemCount === 1 ? "item" : "items"}
            </DashboardMetaPill>
            <DashboardMetaPill>{entry.currency}</DashboardMetaPill>
          </div>
          {entry.description ? (
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {entry.description}
            </p>
          ) : null}
          {isTemplate && entry.title ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Title: {entry.title}
              {entry.validityDays ? ` · ${entry.validityDays} day validity` : ""}
            </p>
          ) : null}
        </div>
        <p className="shrink-0 text-sm font-semibold text-foreground">
          {formatQuoteMoney(entry.totalInCents, entry.currency)}
        </p>
      </div>

      {/* Line items — show 3 by default, expand to show all */}
      <div className="flex flex-col gap-2">
        {entry.items
          .slice(0, isPreviewExpanded ? undefined : defaultPreviewCount)
          .map((item) => (
            <div
              className="flex items-center justify-between gap-4 rounded-lg border border-border/70 bg-background/85 px-3 py-2.5"
              key={item.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.description}
                </p>
                <p className="text-xs text-muted-foreground">
                  Qty {item.quantity} x{" "}
                  {formatQuoteMoney(item.unitPriceInCents, entry.currency)}
                </p>
              </div>
              <p className="text-sm font-medium text-foreground">
                {formatQuoteMoney(
                  item.quantity * item.unitPriceInCents,
                  entry.currency,
                )}
              </p>
            </div>
          ))}

        {/* Template preview: notes & terms when expanded */}
        {isTemplate && isPreviewExpanded ? (
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5">
            {entry.notes ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                <p className="mt-0.5 line-clamp-3 text-xs text-foreground/80">
                  {entry.notes}
                </p>
              </div>
            ) : null}
            {entry.terms ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">Terms</p>
                <p className="mt-0.5 line-clamp-3 text-xs text-foreground/80">
                  {entry.terms}
                </p>
              </div>
            ) : null}
            {!entry.notes && !entry.terms ? (
              <p className="text-xs italic text-muted-foreground">
                No notes or terms — business defaults will be used.
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Expand/collapse for entries with more than 3 items or templates with notes/terms */}
      {entry.items.length > defaultPreviewCount || (isTemplate && (entry.notes || entry.terms)) ? (
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => onTogglePreview(isPreviewExpanded ? null : entry.id)}
        >
          {isPreviewExpanded ? (
            <>
              <ChevronUp className="size-3" />
              Show less
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              {entry.items.length > defaultPreviewCount
                ? `Show all ${entry.items.length} items`
                : "Preview details"}
            </>
          )}
        </button>
      ) : null}

      {wouldExceedLimit && !isTemplate ? (
        <p className="text-sm text-destructive-ink">
          This insert would create {nextItemCount} quote line items. Quotes can include up to 50.
        </p>
      ) : null}

      {hasCurrencyMismatch ? (
        <p className="text-sm text-destructive-ink">
          This entry is saved in {entry.currency}. Requo does not
          auto-convert saved pricing before inserting it into a {currency}{" "}
          quote.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={(wouldExceedLimit && !isTemplate) || hasCurrencyMismatch}
          onClick={() => {
            if (isTemplate && onApplyTemplate) {
              onApplyTemplate(entry);
            } else {
              onInsert(entry);
            }
          }}
        >
          {isTemplate ? "Apply template" : "Insert into quote"}
        </Button>
      </div>
    </div>
  );
}
