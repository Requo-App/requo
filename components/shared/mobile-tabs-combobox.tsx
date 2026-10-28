"use client";

import React, { useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type MobileTabsComboboxItem = {
  label: string;
  value: string;
  icon?: LucideIcon;
};

export type MobileTabsComboboxGroup = {
  label?: string;
  items: MobileTabsComboboxItem[];
};

type MobileTabsComboboxProps = {
  groups: MobileTabsComboboxGroup[];
  activeValue: string;
  onValueChange: (value: string) => void;
  className?: string;
};

export function MobileTabsCombobox({
  groups,
  activeValue,
  onValueChange,
  className,
}: MobileTabsComboboxProps) {
  const [open, setOpen] = useState(false);
  
  // Find the active item across all groups
  const activeItem = React.useMemo(() => {
    for (const group of groups) {
      for (const item of group.items) {
        if (item.value === activeValue) {
          return item;
        }
      }
    }
    return groups[0]?.items[0]; // Fallback to first item
  }, [groups, activeValue]);

  // Command internal value needs to match the label in lower case typically, 
  // but to be perfectly safe across usages, we use the activeItem's label as the initial focus value.
  // Wait, Command `value` prop is matched against the item's `value` string. By default, `CommandItem` uses the textContent.
  const initialFocusValue = activeItem?.label ?? "";
  const [focusValue, setFocusValue] = useState<string>(initialFocusValue);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const ActiveIcon = activeItem?.icon;



  if (!activeItem) {
    return null;
  }

  return (
    <div className={cn("sm:hidden", className)}>
      <Popover open={open} onOpenChange={(newOpen) => {
        setOpen(newOpen);
        if (newOpen && activeItem) {
          setFocusValue(activeItem.label);
        }
      }}>
        <PopoverTrigger asChild>
          <Button
            ref={triggerRef}
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            <span className="flex items-center gap-2">
              {ActiveIcon && <ActiveIcon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="truncate">{activeItem.label}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] p-0"
        >
          <Command value={focusValue} onValueChange={setFocusValue}>
            <CommandList>
              {groups.map((group, groupIndex) => (
                <CommandGroup heading={group.label} key={group.label || groupIndex}>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = item.value === activeValue;

                    return (
                      <CommandItem
                        key={item.value}
                        onSelect={() => {
                          onValueChange(item.value);
                          setOpen(false);
                        }}
                        className={cn(isActive && "font-medium text-primary-ink data-[selected=true]:text-primary-ink")}
                        value={item.label}
                      >
                        {Icon && (
                          <Icon
                            className={cn(
                              "size-4 shrink-0",
                              isActive
                                ? "text-primary-ink"
                                : "text-muted-foreground",
                            )}
                          />
                        )}
                        {item.label}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
