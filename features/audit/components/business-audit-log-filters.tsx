"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { useState } from "react";

import { DashboardActionsRow } from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldContent, FieldLabel } from "@/components/ui/field";
import type { AuditLogFilters, BusinessAuditLogFiltersView } from "@/features/audit/types";
import { useProgressRouter } from "@/hooks/use-progress-router";

type BusinessAuditLogFiltersProps = {
  action: string;
  filters: AuditLogFilters;
  options: BusinessAuditLogFiltersView;
};

function FilterCombobox({
  id,
  name,
  value,
  label,
  placeholder,
  options,
}: {
  id: string;
  name: string;
  value: string | null;
  label: string;
  placeholder: string;
  options: Array<{
    value: string;
    label: string;
  }>;
}) {
  const [val, setVal] = useState(value ?? "");
  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <input type="hidden" name={name} value={val} />
        <Combobox
          id={id}
          value={val}
          onValueChange={setVal}
          options={options}
          placeholder={placeholder}
          searchPlaceholder={`Search ${placeholder.toLowerCase()}`}
        />
      </FieldContent>
    </Field>
  );
}

function FilterDatePicker({
  id,
  name,
  value,
  label,
  placeholder,
}: {
  id: string;
  name: string;
  value: string | null;
  label: string;
  placeholder: string;
}) {
  const [val, setVal] = useState(value ?? "");
  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <FieldContent>
        <DatePicker
          id={id}
          name={name}
          value={val}
          onChange={setVal}
          placeholder={placeholder}
        />
      </FieldContent>
    </Field>
  );
}

export function BusinessAuditLogFilters({
  action,
  filters,
  options,
}: BusinessAuditLogFiltersProps) {
  const router = useProgressRouter();
  const hasFilters = Boolean(filters.actor || filters.business || filters.entity || filters.action || filters.from || filters.to);

  return (
    <div className="px-4 py-4 sm:px-5 sm:py-5">
      <form
        action={action}
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          const params = new URLSearchParams();
          for (const [key, value] of formData.entries()) {
            if (value && typeof value === "string") {
              params.set(key, value);
            }
          }
          router.push(`${action}?${params.toString()}`);
        }}
      >
        <FilterCombobox
          id="audit-log-actor-filter"
          name="actor"
          options={options.actors}
          label="Actor"
          placeholder="All actors"
          value={filters.actor}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <FilterCombobox
            id="audit-log-entity-filter"
            name="entity"
            options={options.entities}
            label="Entity"
            placeholder="All entities"
            value={filters.entity}
          />
          <FilterCombobox
            id="audit-log-action-filter"
            name="action"
            options={options.actions}
            label="Action"
            placeholder="All actions"
            value={filters.action}
          />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium leading-none" id="audit-log-period-label">
            Period
          </span>
          <div
            aria-labelledby="audit-log-period-label"
            className="grid gap-4 sm:grid-cols-2"
            role="group"
          >
            <FilterDatePicker
              id="audit-log-from-filter"
              name="from"
              label="Start date"
              placeholder="Start date"
              value={filters.from}
            />
            <FilterDatePicker
              id="audit-log-to-filter"
              name="to"
              label="End date"
              placeholder="End date"
              value={filters.to}
            />
          </div>
        </div>
        <input name="page" type="hidden" value="1" />
        <DashboardActionsRow className="sm:justify-end">
          <Button type="submit">Apply filters</Button>
          <Button asChild variant="ghost" disabled={!hasFilters}>
            <Link href={action} prefetch={true} className={!hasFilters ? "pointer-events-none opacity-50" : ""}>
              <X data-icon="inline-start" className="size-4" />
              Clear
            </Link>
          </Button>
        </DashboardActionsRow>
      </form>
    </div>
  );
}
