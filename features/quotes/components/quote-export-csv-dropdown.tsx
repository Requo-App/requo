"use client";

import { ChevronDown, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getBusinessQuotesExportPath } from "@/features/businesses/routes";
import type {
  QuoteListFilters,
  QuoteStatusFilterValue,
} from "@/features/quotes/types";
import { quoteStatusFilterValues } from "@/features/quotes/types";
import { getQuoteStatusLabel } from "@/features/quotes/utils";

const statusOptions: QuoteStatusFilterValue[] = [...quoteStatusFilterValues];

type QuoteExportCsvDropdownProps = {
  businessSlug: string;
  filters: QuoteListFilters;
  resultCount: number;
};

export function QuoteExportCsvDropdown({
  businessSlug,
  filters,
  resultCount,
}: QuoteExportCsvDropdownProps) {
  const [query, setQuery] = useState(filters.q ?? "");
  const view = filters.view;
  const [status, setStatus] = useState<QuoteStatusFilterValue>(filters.status);
  const [sort, setSort] = useState<"newest" | "oldest">(filters.sort);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    if (view !== "active") {
      params.set("view", view);
    }
    if (status !== "all") {
      params.set("status", status);
    }
    if (sort !== "newest") {
      params.set("sort", sort);
    }
    if (from) {
      params.set("from", from);
    }
    if (to) {
      params.set("to", to);
    }

    return `${getBusinessQuotesExportPath(businessSlug)}${
      params.size ? `?${params.toString()}` : ""
    }`;
  }, [businessSlug, from, query, sort, status, to, view]);

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Export CSV"
          title="Export CSV"
          size="sm"
          className={mobileNavbarIconButtonClassName}
          disabled={resultCount === 0}
          variant="outline"
        >
          <Download data-icon="inline-start" />
          <span className="hidden lg:inline">Export CSV</span>
          <ChevronDown className="opacity-60 max-lg:hidden" data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(22rem,calc(100vw-1rem))] min-w-0 p-0"
      >
        <div className="flex flex-col gap-0.5 border-b border-border/70 px-3 py-2.5">
          <h2 className="text-sm font-medium">Export quotes CSV</h2>
          <p className="text-sm leading-5 text-muted-foreground">
            Choose filters and date range for this export.
          </p>
        </div>

        <div className="grid gap-2.5 px-3 py-3">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="quote-export-q">Search</FieldLabel>
            <FieldContent>
              <Input
                id="quote-export-q"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Quote number, title, customer"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="quote-export-status">Status</FieldLabel>
            <FieldContent>
              <Combobox
                id="quote-export-status"
                value={status}
                onValueChange={(value) => setStatus(value as QuoteStatusFilterValue)}
                options={statusOptions.map((option) => ({
                  value: option,
                  label: option === "all" ? "All statuses" : getQuoteStatusLabel(option),
                }))}
                placeholder="Filter by status"
                searchPlaceholder="Search status"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="quote-export-sort">Sort</FieldLabel>
            <FieldContent>
              <Combobox
                id="quote-export-sort"
                value={sort}
                onValueChange={(value) => setSort(value as "newest" | "oldest")}
                options={[
                  { label: "Newest first", value: "newest" },
                  { label: "Oldest first", value: "oldest" },
                ]}
                placeholder="Sort by"
                searchPlaceholder="Search sort"
              />
            </FieldContent>
          </Field>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="quote-export-from">From</FieldLabel>
              <FieldContent>
                <DatePicker
                  id="quote-export-from"
                  onChange={setFrom}
                  placeholder="Pick date"
                  value={from}
                />
              </FieldContent>
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="quote-export-to">To</FieldLabel>
              <FieldContent>
                <DatePicker
                  id="quote-export-to"
                  onChange={setTo}
                  placeholder="Pick date"
                  value={to}
                />
              </FieldContent>
            </Field>
          </div>
        </div>

        <div className="flex justify-end border-t border-border/70 px-3 py-2.5">
          <Button
            asChild
            className="w-full sm:w-auto"
            disabled={resultCount === 0}
            size="sm"
          >
            <a href={exportHref}>Download CSV</a>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
