"use client";

import { ChevronDown, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { UpgradeNoticeButton } from "@/features/entitlements/components/upgrade-notice-button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { getBusinessInvoicesExportPath } from "@/features/businesses/routes";
import type {
  InvoiceListFilters,
  InvoiceStatusFilterValue,
} from "@/features/invoices/types";
import { invoiceStatusFilterValues } from "@/features/invoices/types";
import { getInvoiceStatusLabel } from "@/features/invoices/utils";

const statusOptions: InvoiceStatusFilterValue[] = [...invoiceStatusFilterValues];

type InvoiceExportCsvDropdownProps = {
  businessSlug: string;
  canExport: boolean;
  filters: InvoiceListFilters;
  resultCount: number;
};

export function InvoiceExportCsvDropdown({
  businessSlug,
  canExport,
  filters,
  resultCount,
}: InvoiceExportCsvDropdownProps) {
  const [query, setQuery] = useState(filters.q ?? "");
  const [status, setStatus] = useState<InvoiceStatusFilterValue>(filters.status);
  const [sort, setSort] = useState<"newest" | "oldest">(filters.sort);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams();
    const trimmedQuery = query.trim();

    if (trimmedQuery) {
      params.set("q", trimmedQuery);
    }
    if (status !== "all") {
      params.set("status", status);
    }
    if (sort !== "newest") {
      params.set("sort", sort);
    }

    return `${getBusinessInvoicesExportPath(businessSlug)}${
      params.size ? `?${params.toString()}` : ""
    }`;
  }, [businessSlug, query, sort, status]);

  if (!canExport) {
    return (
      <UpgradeNoticeButton
        aria-label="Export CSV"
        title="Export CSV"
        size="sm"
        className={mobileNavbarIconButtonClassName}
        noticeDescription="Upgrade your plan to export invoice records for reporting, handoff, and backup workflows."
        noticeTitle="CSV export requires an upgrade."
        variant="outline"
      >
        <Download data-icon="inline-start" />
        <span className="hidden lg:inline">Export CSV</span>
        <ChevronDown className="opacity-60 max-lg:hidden" data-icon="inline-end" />
      </UpgradeNoticeButton>
    );
  }

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
          <h2 className="text-sm font-medium">Export invoices CSV</h2>
          <p className="text-sm leading-5 text-muted-foreground">
            Choose filters for this export.
          </p>
        </div>

        <div className="grid gap-2.5 px-3 py-3">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="invoice-export-q">Search</FieldLabel>
            <FieldContent>
              <Input
                id="invoice-export-q"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Invoice number, title, customer"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="invoice-export-status">Status</FieldLabel>
            <FieldContent>
              <Combobox
                id="invoice-export-status"
                value={status}
                onValueChange={(value) => setStatus(value as InvoiceStatusFilterValue)}
                options={statusOptions.map((option) => ({
                  value: option,
                  label: option === "all" ? "All statuses" : getInvoiceStatusLabel(option),
                }))}
                placeholder="Filter by status"
                searchPlaceholder="Search status"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="invoice-export-sort">Sort</FieldLabel>
            <FieldContent>
              <Combobox
                id="invoice-export-sort"
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
