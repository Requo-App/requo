"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-4 data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center gap-0.5 rounded-lg border border-[var(--surface-stroke)] bg-[var(--surface-inset-bg)] p-1 text-muted-foreground group-data-vertical/tabs:h-fit group-data-vertical/tabs:flex-col data-[variant=line]:rounded-none data-[variant=line]:border-0 data-[variant=line]:bg-transparent data-[variant=line]:p-0",
  {
    variants: {
      variant: {
        default: "",
        line: "gap-1",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  const listRef = React.useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = React.useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const active = el.querySelector<HTMLElement>(
        '[role="tab"][data-state="active"]',
      );
      if (!active) {
        setThumb(null);
        return;
      }
      const isLine = el.dataset.variant === "line";
      const isVertical =
        el.closest('[data-orientation="vertical"]') !== null;
      if (!isLine) {
        setThumb({
          x: active.offsetLeft,
          y: active.offsetTop,
          w: active.offsetWidth,
          h: active.offsetHeight,
        });
        return;
      }
      // Line variant: travel a thin strip along the tab edge.
      if (isVertical) {
        setThumb({
          x: active.offsetLeft + active.offsetWidth + 4,
          y: active.offsetTop,
          w: 2,
          h: active.offsetHeight,
        });
      } else {
        setThumb({
          x: active.offsetLeft,
          y: active.offsetTop + active.offsetHeight + 5,
          w: active.offsetWidth,
          h: 2,
        });
      }
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(el, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-state", "data-variant", "class"],
    });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, []);

  return (
    <TabsPrimitive.List
      ref={listRef as React.Ref<HTMLDivElement>}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), "relative", className)}
      {...props}
    >
      {variant === "default" && thumb ? (
        <span
          aria-hidden
          data-slot="tabs-indicator"
          className="pointer-events-none absolute top-0 left-0 z-0 rounded-md border border-border/80 bg-[var(--control-bg)] shadow-[var(--control-shadow)] transition-[transform,width,height] duration-200 ease-[var(--motion-ease-emphasized)] motion-reduce:hidden"
          style={{
            transform: `translate(${thumb.x}px, ${thumb.y}px)`,
            width: thumb.w,
            height: thumb.h,
          }}
        />
      ) : null}
      {variant === "line" && thumb ? (
        <span
          aria-hidden
          data-slot="tabs-indicator"
          className="pointer-events-none absolute top-0 left-0 z-0 rounded-full bg-primary transition-[transform,width,height] duration-200 ease-[var(--motion-ease-emphasized)] motion-reduce:hidden"
          style={{
            transform: `translate(${thumb.x}px, ${thumb.y}px)`,
            width: thumb.w,
            height: thumb.h,
          }}
        />
      ) : null}
      {children}
    </TabsPrimitive.List>
  );
}
function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex h-auto min-h-0 shrink-0 items-center justify-center gap-2 rounded-md border border-transparent px-3 py-1.5 text-sm font-medium whitespace-nowrap text-foreground/65 transition-all group-data-horizontal/tabs:flex-none group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start hover:text-foreground focus-visible:border-ring/50 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-1 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 dark:text-muted-foreground dark:hover:text-foreground group-data-[variant=default]/tabs-list:data-active:shadow-[var(--control-shadow)] group-data-[variant=line]/tabs-list:data-active:shadow-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-active:bg-transparent dark:group-data-[variant=line]/tabs-list:data-active:border-transparent dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "data-active:border-[var(--control-border)] data-active:bg-[var(--control-bg)] data-active:text-foreground dark:data-active:border-[var(--control-border)] dark:data-active:text-foreground group-data-[variant=line]/tabs-list:data-active:text-primary-ink dark:group-data-[variant=line]/tabs-list:data-active:text-primary-ink",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-horizontal/tabs:after:inset-x-0 group-data-horizontal/tabs:after:bottom-[-5px] group-data-horizontal/tabs:after:h-0.5 group-data-vertical/tabs:after:inset-y-0 group-data-vertical/tabs:after:-right-1 group-data-vertical/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
