"use client";

import { ChevronDown, Download } from "lucide-react";
import { useMemo, useState } from "react";

import { ProFeatureNoticeButton } from "@/components/shared/pro-feature-notice-button";
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
import { getBusinessInquiriesExportPath } from "@/features/businesses/routes";
import type {
  InquiryListFilters,
  InquirySourceFilterValue,
  InquiryStatusFilterValue,
} from "@/features/inquiries/types";
import {
  inquirySourceFilterValues,
  inquirySourceLabels,
  inquiryStatusFilterValues,
} from "@/features/inquiries/types";
import { getInquiryStatusLabel } from "@/features/inquiries/utils";

const statusOptions: InquiryStatusFilterValue[] = [...inquiryStatusFilterValues];
const sourceOptions: InquirySourceFilterValue[] = [...inquirySourceFilterValues];

type InquiryExportCsvDropdownProps = {
  businessSlug: string;
  canExport: boolean;
  filters: InquiryListFilters;
  formOptions: Array<{
    label: string;
    value: string;
  }>;
  /**
   * Total number of inquiries the business holds, across every list filter.
   * The export carries its own filters, so the list's filtered count is not
   * a valid proxy for whether an export can return rows.
   */
  resultCount: number;
};

export function InquiryExportCsvDropdown({
  businessSlug,
  canExport,
  filters,
  formOptions,
  resultCount,
}: InquiryExportCsvDropdownProps) {
  const [query, setQuery] = useState(filters.q ?? "");
  const view = filters.view;
  const [status, setStatus] = useState<InquiryStatusFilterValue>(filters.status);
  const [form, setForm] = useState(filters.form);
  const [source, setSource] = useState<InquirySourceFilterValue>(filters.source);
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
    if (form !== "all") {
      params.set("form", form);
    }
    if (source !== "all") {
      params.set("source", source);
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

    return `${getBusinessInquiriesExportPath(businessSlug)}${
      params.size ? `?${params.toString()}` : ""
    }`;
  }, [businessSlug, form, from, query, sort, source, status, to, view]);

  if (!canExport) {
    return (
      <ProFeatureNoticeButton
        aria-label="Export CSV"
        title="Export CSV"
        size="sm"
        className={mobileNavbarIconButtonClassName}
        noticeDescription="Upgrade to Pro to export inquiry records for reporting, handoff, and backup workflows."
        noticeTitle="CSV export is a Pro feature."
        variant="outline"
      >
        <Download data-icon="inline-start" />
        <span className="hidden lg:inline">Export CSV</span>
        <ChevronDown className="opacity-60 max-lg:hidden" data-icon="inline-end" />
      </ProFeatureNoticeButton>
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
          <h2 className="text-sm font-medium">Export inquiries CSV</h2>
          <p className="text-sm leading-5 text-muted-foreground">
            Choose filters and date range for this export.
          </p>
        </div>

        <div className="grid gap-2.5 px-3 py-3">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="inquiry-export-q">Search</FieldLabel>
            <FieldContent>
              <Input
                id="inquiry-export-q"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Customer, email, subject"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="inquiry-export-status">Status</FieldLabel>
            <FieldContent>
              <Combobox
                id="inquiry-export-status"
                value={status}
                onValueChange={(value) => setStatus(value as InquiryStatusFilterValue)}
                options={statusOptions.map((option) => ({
                  value: option,
                  label:
                    option === "all" ? "All statuses" : getInquiryStatusLabel(option),
                }))}
                placeholder="Filter by status"
                searchPlaceholder="Search status"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="inquiry-export-service">Service</FieldLabel>
            <FieldContent>
              <Combobox
                id="inquiry-export-service"
                value={form}
                onValueChange={setForm}
                options={formOptions}
                placeholder="Filter by service"
                searchPlaceholder="Search service"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="inquiry-export-source">Source</FieldLabel>
            <FieldContent>
              <Combobox
                id="inquiry-export-source"
                value={source}
                onValueChange={(value) => setSource(value as InquirySourceFilterValue)}
                options={sourceOptions.map((option) => ({
                  value: option,
                  label:
                    option === "all" ? "All sources" : inquirySourceLabels[option],
                }))}
                placeholder="Filter by source"
                searchPlaceholder="Search source"
              />
            </FieldContent>
          </Field>

          <Field className="gap-1.5">
            <FieldLabel htmlFor="inquiry-export-sort">Sort</FieldLabel>
            <FieldContent>
              <Combobox
                id="inquiry-export-sort"
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
              <FieldLabel htmlFor="inquiry-export-from">From</FieldLabel>
              <FieldContent>
                <DatePicker
                  id="inquiry-export-from"
                  onChange={setFrom}
                  placeholder="Pick date"
                  value={from}
                />
              </FieldContent>
            </Field>
            <Field className="gap-1.5">
              <FieldLabel htmlFor="inquiry-export-to">To</FieldLabel>
              <FieldContent>
                <DatePicker
                  id="inquiry-export-to"
                  onChange={setTo}
                  placeholder="Pick date"
                  value={to}
                />
              </FieldContent>
            </Field>
          </div>
        </div>

        <div className="flex justify-end border-t border-border/70 px-3 py-2.5">
          <Button asChild className="w-full sm:w-auto" size="sm">
            <a href={exportHref}>Download CSV</a>
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
