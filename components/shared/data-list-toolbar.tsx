"use client";

import { ListFilter, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  DashboardActionsRow,
} from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type DataListToolbarOption = {
  label: string;
  value: string;
};

type DataListToolbarProps = {
  description: ReactNode;
  resultLabel: ReactNode;
  searchId: string;
  searchLabel: string;
  searchPlaceholder: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterId: string;
  filterLabel: string;
  filterValue: string;
  onFilterChange: (value: string) => void;
  filterOptions: DataListToolbarOption[];
  /** Hide the primary filter while keeping search and clear actions. */
  showFilter?: boolean;
  secondaryFilterId?: string;
  secondaryFilterLabel?: string;
  secondaryFilterValue?: string;
  onSecondaryFilterChange?: (value: string) => void;
  secondaryFilterOptions?: DataListToolbarOption[];
  tertiaryFilterId?: string;
  tertiaryFilterLabel?: string;
  tertiaryFilterValue?: string;
  onTertiaryFilterChange?: (value: string) => void;
  tertiaryFilterOptions?: DataListToolbarOption[];
  sortId?: string;
  sortLabel?: string;
  sortValue?: string;
  onSortChange?: (value: string) => void;
  sortOptions?: DataListToolbarOption[];
  isPending: boolean;
  onClear: () => void;
  canClear: boolean;
  /**
   * Extra filter row rendered inside the strip between the main grid and the
   * result count — e.g. a date range. Stays visible on mobile (outside the
   * filter sheet), so keep it compact.
   */
  children?: ReactNode;
};

export function DataListToolbar({
  description: _description,
  resultLabel,
  searchId,
  searchLabel,
  searchPlaceholder,
  searchValue,
  onSearchChange,
  filterId,
  filterLabel,
  filterValue,
  onFilterChange,
  filterOptions,
  showFilter = true,
  secondaryFilterId,
  secondaryFilterLabel,
  secondaryFilterValue,
  onSecondaryFilterChange,
  secondaryFilterOptions,
  tertiaryFilterId,
  tertiaryFilterLabel,
  tertiaryFilterValue,
  onTertiaryFilterChange,
  tertiaryFilterOptions,
  sortId,
  sortLabel,
  sortValue,
  onSortChange,
  sortOptions,
  isPending,
  onClear,
  canClear,
  children,
}: DataListToolbarProps) {
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

  const shouldShowSecondaryFilter = Boolean(
    secondaryFilterId &&
      secondaryFilterLabel &&
      secondaryFilterValue !== undefined &&
      onSecondaryFilterChange &&
      secondaryFilterOptions?.length,
  );
  const shouldShowTertiaryFilter = Boolean(
    tertiaryFilterId &&
      tertiaryFilterLabel &&
      tertiaryFilterValue !== undefined &&
      onTertiaryFilterChange &&
      tertiaryFilterOptions?.length,
  );
  const shouldShowSortFilter = Boolean(
    sortId &&
      sortLabel &&
      sortValue !== undefined &&
      onSortChange &&
      sortOptions?.length,
  );

  // Mobile sheet keeps visible labels where no placeholder can carry the hint.
  const filterFields = useMemo(
    () => (
      <>
        <Field className="min-w-0 w-full">
          <FieldLabel htmlFor={filterId}>{filterLabel}</FieldLabel>          <FieldContent>
            <Combobox
              id={filterId}
              value={filterValue}
              onValueChange={(value) => {
                onFilterChange(value);
              }}
              options={filterOptions}
              placeholder={filterLabel}
              searchPlaceholder={`Search ${filterLabel.toLowerCase()}`}
            />
          </FieldContent>
        </Field>

        {shouldShowSecondaryFilter ? (
          <Field className="min-w-0 w-full">
            <FieldLabel htmlFor={secondaryFilterId}>
              {secondaryFilterLabel}
            </FieldLabel>
            <FieldContent>
              <Combobox
                id={secondaryFilterId!}
                value={secondaryFilterValue!}
                onValueChange={(value) => {
                  onSecondaryFilterChange!(value);
                }}
                options={secondaryFilterOptions!}
                placeholder={secondaryFilterLabel!}
                searchPlaceholder={`Search ${secondaryFilterLabel!.toLowerCase()}`}
              />
            </FieldContent>
          </Field>
        ) : null}

        {shouldShowTertiaryFilter ? (
          <Field className="min-w-0 w-full">
            <FieldLabel htmlFor={tertiaryFilterId}>
              {tertiaryFilterLabel}
            </FieldLabel>
            <FieldContent>
              <Combobox
                id={tertiaryFilterId!}
                value={tertiaryFilterValue!}
                onValueChange={(value) => {
                  onTertiaryFilterChange!(value);
                }}
                options={tertiaryFilterOptions!}
                placeholder={tertiaryFilterLabel!}
                searchPlaceholder={`Search ${tertiaryFilterLabel!.toLowerCase()}`}
              />
            </FieldContent>
          </Field>
        ) : null}

        {shouldShowSortFilter ? (
          <Field className="min-w-0 w-full">
            <FieldLabel htmlFor={sortId}>{sortLabel}</FieldLabel>
            <FieldContent>
              <Combobox
                id={sortId!}
                value={sortValue!}
                onValueChange={(value) => {
                  onSortChange!(value);
                }}
                options={sortOptions!}
                placeholder={sortLabel!}
                searchPlaceholder={`Search ${sortLabel!.toLowerCase()}`}
              />
            </FieldContent>
          </Field>
        ) : null}
      </>
    ),
    [
      filterId,
      filterLabel,
      filterOptions,
      filterValue,
      onFilterChange,
      onSecondaryFilterChange,
      onSortChange,
      onTertiaryFilterChange,
      secondaryFilterId,
      secondaryFilterLabel,
      secondaryFilterOptions,
      secondaryFilterValue,
      shouldShowSecondaryFilter,
      shouldShowSortFilter,
      shouldShowTertiaryFilter,
      sortId,
      sortLabel,
      sortOptions,
      sortValue,
      tertiaryFilterId,
      tertiaryFilterLabel,
      tertiaryFilterOptions,
      tertiaryFilterValue,
    ],
  );

  return (
    <div className="data-list-toolbar-strip">
      <div className="data-list-toolbar-grid">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Field className="min-w-0 flex-1">
            <FieldLabel className="sr-only" htmlFor={searchId}>
              {searchLabel}
            </FieldLabel>
            <FieldContent>
              <Input
                id={searchId}
                value={searchValue}
                onChange={(event) => onSearchChange(event.currentTarget.value)}
                placeholder={searchPlaceholder}
                aria-label={searchLabel}
                aria-busy={isPending}
              />
            </FieldContent>
          </Field>

          {/* Mobile Filter Button alongside search */}
          {showFilter ? (
            <div className="sm:hidden">
              <Sheet open={isMobileFiltersOpen} onOpenChange={setIsMobileFiltersOpen}>
                <SheetTrigger asChild>
                  <Button
                    aria-label="Filter records"
                    className="size-9 shrink-0 px-0"
                    type="button"
                    variant="outline"
                  >
                    <ListFilter className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                    <SheetDescription>
                      Narrow list results with status, service, source, and sort options.
                    </SheetDescription>
                  </SheetHeader>
                  <SheetBody className="gap-4">{filterFields}</SheetBody>
                </SheetContent>
              </Sheet>
            </div>
          ) : null}
        </div>

        <div className="hidden min-w-0 items-center gap-2 sm:flex sm:min-w-0 sm:flex-1">
          {showFilter ? (
            <Field className="min-w-0 flex-1 sm:max-w-44">
              <FieldLabel className="sr-only" htmlFor={filterId}>
                {filterLabel}
              </FieldLabel>
              <FieldContent>
                <Combobox
                  id={filterId}
                  value={filterValue}
                  onValueChange={(value) => {
                    onFilterChange(value);
                  }}
                  options={filterOptions}
                  placeholder={filterLabel}
                  searchPlaceholder={`Search ${filterLabel.toLowerCase()}`}
                />
              </FieldContent>
            </Field>
          ) : null}

          {shouldShowSecondaryFilter ? (
            <Field className="min-w-0 flex-1 sm:max-w-44">
              <FieldLabel className="sr-only" htmlFor={secondaryFilterId}>
                {secondaryFilterLabel}
              </FieldLabel>
              <FieldContent>
                <Combobox
                  id={secondaryFilterId!}
                  value={secondaryFilterValue!}
                  onValueChange={(value) => {
                    onSecondaryFilterChange!(value);
                  }}
                  options={secondaryFilterOptions!}
                  placeholder={secondaryFilterLabel!}
                  searchPlaceholder={`Search ${secondaryFilterLabel!.toLowerCase()}`}
                />
              </FieldContent>
            </Field>
          ) : null}

          {shouldShowTertiaryFilter ? (
            <Field className="min-w-0 flex-1 sm:max-w-44">
              <FieldLabel className="sr-only" htmlFor={tertiaryFilterId}>
                {tertiaryFilterLabel}
              </FieldLabel>
              <FieldContent>
                <Combobox
                  id={tertiaryFilterId!}
                  value={tertiaryFilterValue!}
                  onValueChange={(value) => {
                    onTertiaryFilterChange!(value);
                  }}
                  options={tertiaryFilterOptions!}
                  placeholder={tertiaryFilterLabel!}
                  searchPlaceholder={`Search ${tertiaryFilterLabel!.toLowerCase()}`}
                />
              </FieldContent>
            </Field>
          ) : null}

          {shouldShowSortFilter ? (
            <Field className="min-w-0 flex-1 sm:max-w-36">
              <FieldLabel className="sr-only" htmlFor={sortId}>
                {sortLabel}
              </FieldLabel>
              <FieldContent>
                <Combobox
                  id={sortId!}
                  value={sortValue!}
                  onValueChange={(value) => {
                    onSortChange!(value);
                  }}
                  options={sortOptions!}
                  placeholder={sortLabel!}
                  searchPlaceholder={`Search ${sortLabel!.toLowerCase()}`}
                />
              </FieldContent>
            </Field>
          ) : null}
        </div>

        <DashboardActionsRow className="data-list-toolbar-actions">
          <Button
            aria-label="Clear filters"
            className="size-9 shrink-0 px-0 sm:hidden"
            disabled={!canClear}
            onClick={onClear}
            size="icon"
            title="Clear filters"
            type="button"
            variant="ghost"
          >
            <X />
          </Button>
          <Button
            className="hidden shrink-0 sm:inline-flex"
            size="sm"
            disabled={!canClear}
            onClick={onClear}
            type="button"
            variant="ghost"
          >
            <X data-icon="inline-start" />
            Clear
          </Button>
          {isPending ? <Spinner className="inline-flex" aria-hidden="true" /> : null}
        </DashboardActionsRow>
      </div>

      {children}

      <p className="data-list-toolbar-count">{resultLabel}</p>
    </div>
  );
}
