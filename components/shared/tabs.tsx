"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, ReactNode, Ref } from "react";
import {
  Tab as AriaTab,
  TabList as AriaTabList,
  TabPanel as AriaTabPanel,
  Tabs as AriaTabs,
} from "react-aria-components";
import type {
  TabListProps as AriaTabListProps,
  TabPanelProps as AriaTabPanelProps,
  TabProps as AriaTabProps,
  TabsProps as AriaTabsProps,
} from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * Underline tabs. The tab strip sits on a 1px border baseline; the active tab
 * paints a 2px primary underline over it (an absolutely-positioned thumb that
 * measures the selected tab, so it slides between tabs).
 *   tab       px 10, py 8, gap 10 (label ↔ count), Body 1 (14/20)
 *     active     primary text, Medium weight, 2px underline
 *     inactive   foreground text, Regular weight, transparent underline
 *   count     small radius, px 4, py 1, Caption 1/Medium (12/16)
 *     active     primary/10 bg, primary text
 *     inactive   muted bg @ 50% opacity, foreground text
 *   icon      optional 16px leading glyph, inherits the label color
 *
 * Built on react-aria Tabs: roving-tabindex arrow-key navigation, automatic
 * activation, and TabList/TabPanel association.
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface TabsProps extends AriaTabsProps {
  ref?: Ref<HTMLDivElement>;
}

const tabsVariants = cva("flex w-full flex-col gap-4", {
  variants: {
    orientation: {
      horizontal: "",
      vertical: "flex-row",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
  },
});

export function Tabs({ className, ref, ...props }: TabsProps) {
  return (
    <AriaTabs
      ref={ref}
      {...props}
      className={(state) =>
        cn(
          tabsVariants({
            orientation: state.orientation === "vertical" ? "vertical" : "horizontal",
          }),
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}

export interface TabListProps<T extends object> extends AriaTabListProps<T> {
  ref?: Ref<HTMLDivElement>;
}

type Underline = { left: number; width: number };

export function TabList<T extends object>({ className, ref, ...props }: TabListProps<T>) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [underline, setUnderline] = useState<Underline | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const measure = () => {
      const selected = el.querySelector<HTMLElement>("[role='tab'][data-selected]");
      if (selected) {
        setUnderline({ left: selected.offsetLeft, width: selected.offsetWidth });
      }
    };
    measure();
    // Re-measure when selection flips (data-selected toggles) or size changes.
    const mo = new MutationObserver(measure);
    mo.observe(el, { attributes: true, subtree: true, attributeFilter: ["data-selected"] });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <AriaTabList
        ref={ref}
        {...props}
        className={(state) =>
          cn(
            "flex w-full items-center gap-1 border-b border-border",
            typeof className === "function" ? className(state) : className,
          )
        }
      />
      {underline && (
        <span
          aria-hidden
          className="pointer-events-none absolute bottom-0 left-0 h-0.5 bg-primary transition-[transform,width] duration-200 ease"
          style={{
            transform: `translateX(${underline.left}px)`,
            width: underline.width,
          }}
        />
      )}
    </div>
  );
}

const tabVariants = cva(
  cn(
    "relative inline-flex cursor-pointer items-center gap-2.5 px-2.5 py-2 whitespace-nowrap",
    "outline-none transition-[color,background-color,transform] duration-150 ease-[var(--motion-ease-standard)]",
    "focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
    "active:scale-[0.98] disabled:active:scale-100",
  ),
  {
    variants: {
      isDisabled: {
        true: "cursor-not-allowed opacity-50",
        false: "",
      },
    },
    defaultVariants: {
      isDisabled: false,
    },
  },
);

const tabLabelVariants = cva("inline-flex items-center gap-1.5", {
  variants: {
    isSelected: {
      true: "text-body-medium text-primary-ink",
      false: "text-body-regular text-foreground",
    },
  },
  defaultVariants: {
    isSelected: false,
  },
});

const tabCountVariants = cva(
  "inline-flex items-center justify-center rounded-sm px-1 py-px text-caption-1-medium whitespace-nowrap",
  {
    variants: {
      isSelected: {
        true: "bg-primary/10 text-primary-ink",
        false: "bg-muted text-foreground opacity-50",
      },
    },
    defaultVariants: {
      isSelected: false,
    },
  },
);

export interface TabProps extends Omit<AriaTabProps, "children"> {
  children?: ReactNode;
  /** Optional leading icon (16px). Inherits the label color. */
  icon?: IconComponent;
  /** Optional trailing count badge. */
  count?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

export function Tab({ className, children, icon: Icon, count, ref, ...props }: TabProps) {
  return (
    <AriaTab
      ref={ref}
      {...props}
      className={(state) =>
        cn(
          tabVariants({ isDisabled: state.isDisabled }),
          typeof className === "function" ? className(state) : className,
        )
      }
    >
      {({ isSelected }) => (
        <>
          <span className={cn(tabLabelVariants({ isSelected }))}>
            {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
            {children}
          </span>
          {count != null && (
            <span className={cn(tabCountVariants({ isSelected }))}>
              {count}
            </span>
          )}
        </>
      )}
    </AriaTab>
  );
}

export interface TabPanelProps extends AriaTabPanelProps {
  ref?: Ref<HTMLDivElement>;
}

export function TabPanel({ className, ref, ...props }: TabPanelProps) {
  return (
    <AriaTabPanel
      ref={ref}
      {...props}
      className={(state) =>
        cn(
          "outline-none focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring",
          typeof className === "function" ? className(state) : className,
        )
      }
    />
  );
}
