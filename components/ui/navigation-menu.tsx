"use client"

import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui"
import { ChevronDownIcon } from "lucide-react"

function NavigationMenu({
  className,
  children,
  viewport = true,
  viewportClassName,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & {
  viewport?: boolean
  /** Optional styling for the shared viewport card (the marketing panel). */
  viewportClassName?: string
}) {
  return (
    <NavigationMenuPrimitive.Root
      data-slot="navigation-menu"
      data-viewport={viewport}
      className={cn(
        "group/navigation-menu relative flex max-w-max flex-1 items-center justify-center",
        className
      )}
      {...props}
    >
      {children}
      {viewport && <NavigationMenuViewport className={viewportClassName} />}
    </NavigationMenuPrimitive.Root>
  )
}

function NavigationMenuList({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
  return (
    <NavigationMenuPrimitive.List
      data-slot="navigation-menu-list"
      className={cn(
        "group flex flex-1 list-none items-center justify-center gap-0",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuItem({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
  return (
    <NavigationMenuPrimitive.Item
      data-slot="navigation-menu-item"
      className={cn("relative", className)}
      {...props}
    />
  )
}

const navigationMenuTriggerStyle = cva(
  "motion-transition group/navigation-menu-trigger inline-flex h-9 w-max items-center justify-center rounded-lg px-2.5 py-1.5 text-sm font-medium outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50 data-popup-open:bg-muted/50 data-popup-open:hover:bg-muted data-open:bg-muted/50 data-open:hover:bg-muted data-open:focus:bg-muted"
)

function NavigationMenuTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
  return (
    <NavigationMenuPrimitive.Trigger
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon className="motion-icon-swap relative top-px ml-1 size-3 group-data-popup-open/navigation-menu-trigger:rotate-180 group-data-open/navigation-menu-trigger:rotate-180" aria-hidden="true" />
    </NavigationMenuPrimitive.Trigger>
  )
}

function NavigationMenuContent({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
  return (
    <NavigationMenuPrimitive.Content
      data-slot="navigation-menu-content"
      className={cn(
        "top-0 left-0 w-full p-1 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-lg group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:[animation-duration:var(--motion-duration-base)] group-data-[viewport=false]/navigation-menu:[animation-timing-function:var(--motion-ease-emphasized)] **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none md:absolute md:w-auto group-data-[viewport=false]/navigation-menu:data-open:animate-in group-data-[viewport=false]/navigation-menu:data-open:fade-in-0 group-data-[viewport=false]/navigation-menu:data-open:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-closed:animate-out group-data-[viewport=false]/navigation-menu:data-closed:fade-out-0 group-data-[viewport=false]/navigation-menu:data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )
}

/**
 * Radix measures the active panel with a ResizeObserver + rAF, so the shared
 * viewport can paint at its border-only fallback size for a frame — or much
 * longer when the main thread is busy. Measure the open item's panel
 * synchronously instead, before paint, and keep it in sync as it resizes.
 */
const panelWidthVar = "--navigation-menu-panel-width";
const panelHeightVar = "--navigation-menu-panel-height";

function usePanelSize(containerRef: React.RefObject<HTMLDivElement | null>) {
  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let contentObserver: ResizeObserver | null = null;
    let observedContent: HTMLElement | null = null;

    const measure = () => {
      const root = container.closest<HTMLElement>(
        '[data-slot="navigation-menu"]',
      );
      const viewport = container.querySelector<HTMLElement>(
        '[data-slot="navigation-menu-viewport"]',
      );
      if (!root || !viewport) return;

      const activeTrigger = root.querySelector<HTMLElement>(
        '[data-slot="navigation-menu-item"] [data-state="open"]',
      );
      const contentId = activeTrigger?.getAttribute("aria-controls");
      const content = contentId ? document.getElementById(contentId) : null;
      if (!content || !viewport.contains(content)) return;

      const width = content.offsetWidth;
      const height = content.offsetHeight;
      if (!width || !height) return;

      container.style.setProperty(panelWidthVar, `${width}px`);
      container.style.setProperty(panelHeightVar, `${height}px`);

      if (content !== observedContent) {
        contentObserver?.disconnect();
        observedContent = content;
        contentObserver = new ResizeObserver(measure);
        contentObserver.observe(content);
      }
    };

    measure();

    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(container, {
      attributes: true,
      attributeFilter: ["data-state"],
      childList: true,
      subtree: true,
    });

    return () => {
      mutationObserver.disconnect();
      contentObserver?.disconnect();
    };
  }, [containerRef]);
}

/**
 * Shared viewport card. Opens with a 100ms fade + settle, morphs its
 * width/height when moving between triggers, and shifts horizontally so its
 * left edge sits on the active trigger — the content swaps in place, so no
 * cross-fade / slide motion classes belong on `NavigationMenuContent`.
 */
function NavigationMenuViewport({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [offsetX, setOffsetX] = React.useState(0);

  usePanelSize(containerRef);

  React.useLayoutEffect(() => {
    const root = containerRef.current?.closest<HTMLElement>(
      '[data-slot="navigation-menu"]',
    );
    if (!root) return;

    // Radix only exposes the viewport's width/height, so track the active
    // trigger ourselves (same MutationObserver pattern as the tabs indicator)
    // and align the card's left edge with the open item.
    const measure = () => {
      const active = root.querySelector<HTMLElement>(
        '[data-slot="navigation-menu-item"] [data-state="open"]',
      );
      const item = active?.closest<HTMLElement>(
        '[data-slot="navigation-menu-item"]',
      );
      if (item) setOffsetX(item.offsetLeft);
    };

    measure();
    const mutationObserver = new MutationObserver(measure);
    mutationObserver.observe(root, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-state"],
    });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(root);
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div
      data-slot="navigation-menu-viewport-container"
      ref={containerRef}
      className={cn(
        "motion-control-thumb absolute top-full left-0 isolate z-50 flex justify-center"
      )}
      style={{ transform: `translateX(${offsetX}px)` }}
    >
      <NavigationMenuPrimitive.Viewport
        data-slot="navigation-menu-viewport"
        className={cn(
          "overlay-surface motion-popover origin-top relative mt-1.5 h-(--navigation-menu-panel-height) w-full overflow-hidden rounded-lg border text-popover-foreground transition-[width,height] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)] md:w-(--navigation-menu-panel-width)",
          className
        )}
        {...props}
      />
    </div>
  )
}

function NavigationMenuLink({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
  return (
    <NavigationMenuPrimitive.Link
      data-slot="navigation-menu-link"
      className={cn(
        "motion-transition flex items-center gap-2 rounded-lg p-2 text-sm outline-none hover:bg-muted focus:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-1 in-data-[slot=navigation-menu-content]:rounded-md data-active:bg-muted/50 data-active:hover:bg-muted data-active:focus:bg-muted [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function NavigationMenuIndicator({
  className,
  ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
  return (
    <NavigationMenuPrimitive.Indicator
      data-slot="navigation-menu-indicator"
      className={cn(
        "motion-fade top-full z-1 flex h-1.5 items-end justify-center overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm bg-[var(--overlay-surface-bg)]" />
    </NavigationMenuPrimitive.Indicator>
  )
}

export {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuContent,
  NavigationMenuTrigger,
  NavigationMenuLink,
  NavigationMenuIndicator,
  NavigationMenuViewport,
  navigationMenuTriggerStyle,
}
