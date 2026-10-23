import Link from "next/link";
import { Inbox, Plus } from "lucide-react";

import { DashboardListResultsSkeleton } from "@/components/shared/dashboard-list-results-skeleton";
import {
  DashboardEmptyState,
} from "@/components/shared/dashboard-layout";
import { MobileHeaderSlot, mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArchivedInquiriesSheet } from "@/features/inquiries/components/archived-inquiries-sheet";
import { InquiryExportCsvDropdown } from "@/features/inquiries/components/inquiry-export-csv-dropdown";
import { InquiryListFilters as InquiryListToolbar } from "@/features/inquiries/components/inquiry-list-filters";
import { InquiryListResults } from "@/features/inquiries/components/inquiry-list-results";
import type {
  DashboardInquiryListItem,
  InquiryListFilters,
} from "@/features/inquiries/types";
import type { InquiryRecordActionState } from "@/features/inquiries/types";
import {
  getBusinessInquiriesPath,
  getBusinessNewInquiryPath,
} from "@/features/businesses/routes";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type InquiryListResultsData = {
  cachedPages?: Record<number, DashboardInquiryListItem[]> | null;
  currentPage: number;
  filterKey: string;
  totalItems: number;
  totalPages: number;
};

type InquiryFormOption = {
  slug: string;
  name: string;
  archivedAt: Date | null;
};

type InquiryListControlsSectionProps = {
  businessSlug: string;
  filters: InquiryListFilters;
  searchParams: SearchParamsRecord;
  totalItemsPromise: Promise<number>;
  formOptionsPromise: Promise<InquiryFormOption[]>;
  unarchiveAction: (
    inquiryId: string,
    state: InquiryRecordActionState,
    formData: FormData,
  ) => Promise<InquiryRecordActionState>;
};

type InquiryListHeaderActionsProps = InquiryListControlsSectionProps & {
  archivedItemsPromise: Promise<DashboardInquiryListItem[]>;
  exportableInquiryCountPromise: Promise<number>;
};

export async function InquiryListHeaderActions({
  businessSlug,
  filters,
  totalItemsPromise,
  formOptionsPromise,
  archivedItemsPromise,
  exportableInquiryCountPromise,
  unarchiveAction,
}: InquiryListHeaderActionsProps) {
  const [, inquiryFormOptions, archivedItems, exportableCount] =
    await Promise.all([
      totalItemsPromise,
      formOptionsPromise,
      archivedItemsPromise,
      exportableInquiryCountPromise,
    ]);
  const formOptions = [
    {
      value: "all",
      label: "All services",
    },
    ...inquiryFormOptions.map((form) => ({
      value: form.slug,
      label: form.archivedAt ? `${form.name} (Archived)` : form.name,
    })),
  ];

  return (
    <MobileHeaderSlot>
      <InquiryExportCsvDropdown
        businessSlug={businessSlug}
        filters={filters}
        formOptions={formOptions}
        resultCount={exportableCount}
      />
      <ArchivedInquiriesSheet
        businessSlug={businessSlug}
        items={archivedItems}
        unarchiveAction={unarchiveAction}
      />
      <Button
        asChild
        aria-label="Quick-add inquiry"
        title="Quick-add inquiry"
        size="sm"
        className={mobileNavbarIconButtonClassName}
      >
        <Link href={getBusinessNewInquiryPath(businessSlug)} prefetch={true}>
          <Plus data-icon="inline-start" />
          <span className="hidden lg:inline">Quick-add</span>
        </Link>
      </Button>
    </MobileHeaderSlot>
  );
}

export async function InquiryListControlsSection({
  businessSlug: _businessSlug,
  filters,
  searchParams: _searchParams,
  totalItemsPromise,
  formOptionsPromise,
  unarchiveAction: _unarchiveAction,
}: InquiryListControlsSectionProps) {
  const [totalItems, inquiryFormOptions] = await Promise.all([
    totalItemsPromise,
    formOptionsPromise,
  ]);
  const formOptions = [
    {
      value: "all",
      label: "All services",
    },
    ...inquiryFormOptions.map((form) => ({
      value: form.slug,
      label: form.archivedAt ? `${form.name} (Archived)` : form.name,
    })),
  ];

  return (
    <InquiryListToolbar
      key={`${filters.view}:${filters.status}:${filters.form}:${filters.source}:${filters.q ?? ""}:${filters.sort}:${filters.escalated ? "escalated" : ""}`}
      filters={filters}
      formOptions={formOptions}
      resultCount={totalItems}
    />
  );
}

type InquiryListContentSectionProps = {
  businessSlug: string;
  filters: InquiryListFilters;
  searchParams: SearchParamsRecord;
  totalItemsPromise: Promise<number>;
  pageDataPromise: Promise<InquiryListResultsData>;
  clearFiltersPath: string;
  hasNonViewFilters: boolean;
};

export async function InquiryListContentSection({
  businessSlug,
  filters,
  searchParams,
  totalItemsPromise,
  pageDataPromise,
  clearFiltersPath,
  hasNonViewFilters,
}: InquiryListContentSectionProps) {
  const totalItems = await totalItemsPromise;

  if (totalItems) {
    return (
      <InquiryListResults
        businessSlug={businessSlug}
        pageData={pageDataPromise}
        searchParams={searchParams}
      />
    );
  }

  return (
    <div className="p-4">
    <DashboardEmptyState
      action={
        hasNonViewFilters ? (
          <Button asChild variant="outline">
            <Link href={clearFiltersPath} prefetch={true}>
              Clear filters
            </Link>
          </Button>
        ) : filters.view !== "active" ? (
          <Button asChild variant="outline">
            <Link href={getBusinessInquiriesPath(businessSlug)} prefetch={true}>
              View active inquiries
            </Link>
          </Button>
        ) : (
          <Button asChild>
            <Link href={getBusinessNewInquiryPath(businessSlug)} prefetch={true}>
              <Plus data-icon="inline-start" />
              Quick-add
            </Link>
          </Button>
        )
      }
      description={
        hasNonViewFilters
          ? "Try another search or status."
          : filters.view === "archived"
            ? "Archived inquiries stay here until you restore them."
            : "Quick-add an inquiry manually or wait for new inquiries to arrive."
      }
      icon={Inbox}
      title={
        hasNonViewFilters
          ? "No inquiries match these filters."
          : filters.view === "archived"
            ? "No archived inquiries"
            : "Your inquiry inbox is still empty."
      }
      variant="list"
    />
    </div>
  );
}

export function InquiryListHeaderActionsFallback() {
  return (
    <>
      <Skeleton className="h-8 w-full rounded-md sm:w-32" />
      <Skeleton className="h-8 w-full rounded-md sm:w-28" />
      <Skeleton className="h-8 w-full rounded-md sm:w-40" />
    </>
  );
}

export function InquiryListControlsFallback() {
  return (
    <div className="data-list-toolbar-strip" aria-hidden="true">
      <div className="data-list-toolbar-grid">
        <Skeleton className="h-9 min-w-0 flex-1 rounded-md sm:h-8" />
        <Skeleton className="hidden h-9 min-w-0 flex-1 rounded-md sm:block sm:h-8" />
        <Skeleton className="hidden h-9 w-32 rounded-md sm:block sm:h-8" />
        <Skeleton className="h-9 w-20 shrink-0 rounded-md sm:h-8" />
      </div>
      <Skeleton className="h-4 w-28 rounded-md" />
    </div>
  );
}

export function InquiryListContentFallback() {
  return <DashboardListResultsSkeleton variant="inquiries" />;
}
