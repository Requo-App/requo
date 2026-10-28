"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type ComboboxOption = {
  disabled?: boolean;
  label: string;
  searchText?: string;
  value: string;
};

export type ComboboxOptionGroup<TOption extends ComboboxOption> = {
  heading?: string;
  options: ReadonlyArray<TOption>;
};

type ComboboxProps<TOption extends ComboboxOption> = {
  autoFocus?: boolean;
  buttonClassName?: string;
  contentClassName?: string;
  disabled?: boolean;
  emptyMessage?: string;
  groupHeading?: string;
  groups?: ReadonlyArray<ComboboxOptionGroup<TOption>>;
  id: string;
  onValueChange: (value: string) => void;
  options?: ReadonlyArray<TOption>;
  placeholder: string;
  renderOption?: (option: TOption) => ReactNode;
  renderValue?: (option: TOption) => ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  value: string;
  "aria-invalid"?: boolean;
};

export function Combobox<TOption extends ComboboxOption>({
  autoFocus = false,
  buttonClassName,
  contentClassName,
  disabled = false,
  emptyMessage = "No options found.",
  groupHeading,
  groups,
  id,
  onValueChange,
  options = [],
  placeholder,
  renderOption,
  renderValue,
  searchable = false,
  searchPlaceholder = "Search",
  value,
  "aria-invalid": ariaInvalid,
}: ComboboxProps<TOption>) {
  const [open, setOpen] = useState(false);
  const resolvedGroups = useMemo<ReadonlyArray<ComboboxOptionGroup<TOption>>>(
    () => groups ?? [{ heading: groupHeading, options }],
    [groupHeading, groups, options],
  );
  const flatOptions = useMemo(
    () => resolvedGroups.flatMap((group) => group.options),
    [resolvedGroups],
  );
  const selectedOption = useMemo(
    () => flatOptions.find((option) => option.value === value) ?? null,
    [flatOptions, value],
  );

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          aria-invalid={ariaInvalid}
          autoFocus={autoFocus}
          className={cn(
            "w-full justify-between",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            buttonClassName,
          )}
          disabled={disabled}
          id={id}
          role="combobox"
          type="button"
          variant="outline"
        >
          {selectedOption ? (
            renderValue ? (
              renderValue(selectedOption)
            ) : (
              <span className="truncate">{selectedOption.label}</span>
            )
          ) : (
            <span className="truncate text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDownIcon
            className="shrink-0 text-muted-foreground"
            data-icon="inline-end"
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-auto min-w-[var(--radix-popover-trigger-width)] max-w-[min(20rem,calc(100vw-2rem))] p-0",
          contentClassName,
        )}
        onWheel={(e) => e.stopPropagation()}
      >
        <Command>
          {searchable ? <CommandInput placeholder={searchPlaceholder} /> : null}
          <CommandList onWheel={(e) => e.stopPropagation()}>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {resolvedGroups.map((group, index) => (
              <CommandGroup heading={group.heading} key={`${group.heading ?? "group"}-${index}`}>
                {group.options.map((option) => (
                  <CommandItem
                    disabled={option.disabled}
                    key={option.value}
                    onSelect={() => {
                      if (option.disabled) {
                        return;
                      }

                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    value={option.searchText ?? option.label}
                  >
                    <div className="min-w-0 flex-1">
                      {renderOption ? (
                        renderOption(option)
                      ) : (
                        <span className="block truncate">{option.label}</span>
                      )}
                    </div>
                    <CheckIcon
                      className={cn(
                        "shrink-0 text-primary-ink transition-opacity",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
