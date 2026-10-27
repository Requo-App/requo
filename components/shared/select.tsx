"use client";

import { createContext, useContext, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";
import {
  Button as AriaButton,
  ListBox as AriaListBox,
  ListBoxItem as AriaListBoxItem,
  Popover as AriaPopover,
  Select as AriaSelect,
  SelectValue as AriaSelectValue,
} from "react-aria-components";
import type {
  ListBoxItemProps as AriaListBoxItemProps,
  SelectProps as AriaSelectProps,
  SelectValueRenderProps as AriaSelectValueRenderProps,
} from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import {
  MENU_ITEM,
  MENU_ITEM_ACTIVE,
  MENU_ITEMS_CONTAINER,
  MENU_POPOVER_SURFACE,
  MENU_POPOVER_WIDTH,
} from "@/components/shared/dropdown-menu-styles";
import { ChevronDownSmall } from "@/components/shared/chevrons";
import { useDismissOnOutsidePress, useTriggerToggle } from "@/hooks/use-dismiss-on-outside-press";

/**
 * Select with a button trigger.
 *
 * Trigger visuals: white surface, 1px border, xs shadow, px 10 py 8,
 * 10px radius, gap 6, Body 1/Medium foreground text, 16px chevron in
 * muted-foreground that rotates 180° when open.
 *
 * The open popover/listbox shares the menu recipe with Dropdown: 16px-radius
 * panel, p 10, overlay shadow, 150ms fade/scale/blur motion, and rounded rows
 * with the same hover/selected surface.
 *
 * Item content is free-form: pass a `StatusDot` + text for status selects.
 */

export type SelectSize = "sm" | "md";

const SelectSizeContext = createContext<SelectSize>("md");

const selectTriggerVariants = cva(
  cn(
    "flex w-full cursor-pointer items-center justify-between rounded-md",
    "control-surface border",
    "text-foreground",
    "transition-[background-color,border-color,box-shadow,padding,font-size] duration-200 ease",
    "hover:bg-[var(--control-bg-hover)] hover:border-[var(--control-border-hover)]",
    "outline-none focus-visible:border-ring/50 focus-visible:ring-2 focus-visible:ring-ring/40",
    "disabled:cursor-not-allowed disabled:bg-transparent disabled:border-[var(--control-disabled-border)] disabled:text-[var(--control-disabled-fg)] disabled:shadow-none disabled:opacity-100",
  ),
  {
    variants: {
      size: {
        sm: "gap-1 px-[7px] py-1 text-body-2-medium",
        md: "gap-1.5 px-2.5 py-2 text-body-medium",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

const selectValueVariants = cva("flex min-w-0 items-center truncate", {
  variants: {
    size: {
      sm: "gap-1",
      md: "gap-[5px]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

const selectItemVariants = cva(MENU_ITEM, {
  variants: {
    size: {
      sm: "px-2 py-1.5 text-body-2-medium",
      md: "text-body-medium",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

export interface SelectProps<T extends object>
  extends Omit<AriaSelectProps<T>, "children"> {
  /** Trigger width. Defaults to hug content; the menu uses the shared 266px width. */
  className?: string;
  triggerClassName?: string;
  /** Classes for the open popover (e.g. constrain its width). */
  popoverClassName?: string;
  /** `md` (default) or `sm` for compact/dense contexts (e.g. compact tables). */
  size?: SelectSize;
  children: ReactNode;
  items?: Iterable<T>;
  /** Customise the trigger's rendered value (e.g. a compact flag + dial code).
   *  Falls back to the selected item's own content when omitted. */
  renderValue?: ReactNode | ((values: AriaSelectValueRenderProps<T>) => ReactNode);
  ref?: Ref<HTMLDivElement>;
}

export function Select<T extends object>({
  className,
  triggerClassName,
  popoverClassName,
  size = "md",
  children,
  items,
  renderValue,
  ref,
  ...props
}: SelectProps<T>) {
  // The popover is `isNonModal`: react-aria's modal scroll lock puts
  // `overflow: hidden` on <html>, which — with this app's `h-full` root —
  // collapses the page scroll position and visibly yanks the sticky
  // sidebar upward every time a select opens. Non-modal skips the lock,
  // but also disables react-aria's outside-press dismissal (`isDismissable`
  // is hard-coupled to `!isNonModal` in usePopover), so open state is
  // controlled here and dismissal restored manually — the same fix as the
  // date-picker family (see hooks/use-dismiss-on-outside-press.ts).
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  useDismissOnOutsidePress(isOpen, () => setIsOpen(false), [triggerRef, popoverRef]);
  // Pressing the trigger while open closes the popover instead of reopening
  const allowOpenChange = useTriggerToggle(isOpen, triggerRef);

  return (
    <AriaSelect
      ref={ref}
      {...props}
      isOpen={isOpen}
      onOpenChange={(o) => allowOpenChange(o) && setIsOpen(o)}
      className={cn("group flex flex-col", className)}
    >
      {({ isOpen }) => (
        <>
          <AriaButton
            ref={triggerRef}
            className={cn(selectTriggerVariants({ size }), triggerClassName)}
          >
            <AriaSelectValue className={cn(selectValueVariants({ size }))}>
              {renderValue as never /* RAC accepts node or render-prop */}
            </AriaSelectValue>
            <ChevronDownSmall
              className={cn(
                "shrink-0 text-muted-foreground transition-transform duration-200 ease",
                size === "sm" ? "size-3.5" : "size-4",
                isOpen && "rotate-180",
              )}
            />
          </AriaButton>
          <AriaPopover
            ref={popoverRef}
            isNonModal
            offset={4}
            className={cn(
              MENU_POPOVER_WIDTH,
              MENU_POPOVER_SURFACE,
              // Listbox rows already space themselves 4px apart, so the
              // surface sits a touch tighter than the action-menu Dropdown.
              "p-2",
              popoverClassName,
            )}
          >
            <AriaListBox
              items={items}
              className={cn(MENU_ITEMS_CONTAINER, "max-h-[240px] overflow-auto")}
            >
              <SelectSizeContext.Provider value={size}>{children}</SelectSizeContext.Provider>
            </AriaListBox>
          </AriaPopover>
        </>
      )}
    </AriaSelect>
  );
}

export interface SelectItemProps extends Omit<AriaListBoxItemProps, "children"> {
  children?: ReactNode;
}

export function SelectItem({ className, children, ...props }: SelectItemProps) {
  const size = useContext(SelectSizeContext);
  return (
    <AriaListBoxItem
      {...props}
      className={(state) =>
        cn(
          selectItemVariants({ size }),
          (state.isFocused || state.isSelected) && MENU_ITEM_ACTIVE,
          state.isDisabled && "cursor-not-allowed text-muted-foreground opacity-60",
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {children}
    </AriaListBoxItem>
  );
}
