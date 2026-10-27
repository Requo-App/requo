"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BarChart3,
  BellRing,
  ChevronDown,
  FileSignature,
  FileText,
  Inbox,
  Receipt,
  Sparkles,
} from "lucide-react";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";

import { resourceLinks } from "@/components/marketing/marketing-data";
import {
  MarketingMenuList,
  type MarketingMenuItem,
} from "@/components/marketing/marketing-menu-link";
import {
  solutionHref,
  solutionLinks,
} from "@/components/marketing/solutions-data";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";
import { cn } from "@/lib/utils";

const defaultTriggerClass = "public-page-header-link";

export const productLinks = [
  {
    href: "/features/inquiries",
    label: "Inquiry",
    description: "Capture requests from forms, email, and DMs.",
    icon: Inbox,
  },
  {
    href: "/features/quotes",
    label: "Quote",
    description: "Send scoped quotes customers can accept.",
    icon: FileSignature,
  },
  {
    href: "/features/follow-ups",
    label: "Follow-up",
    description: "Nudge open quotes before they go cold.",
    icon: BellRing,
  },
  {
    href: "/features/ai",
    label: "AI",
    description: "Drafts grounded in your pricing and past work.",
    icon: Sparkles,
  },
  {
    href: "/features/invoices",
    label: "Invoice",
    description: "Convert accepted quotes and track payments.",
    icon: Receipt,
  },
  {
    href: "/features/analytics",
    label: "Analytics",
    description: "See where opportunities get stuck.",
    icon: BarChart3,
  },
] as const;

export const resourceDetails: Record<string, { description: string; icon: typeof FileText }> = {
  "/about": {
    description: "What Requo is and who it fits.",
    icon: FileText,
  },
  "/security": {
    description: "How Requo protects your data.",
    icon: FileText,
  },
  "/privacy": {
    description: "How Requo collects and protects data.",
    icon: FileText,
  },
  "/terms": {
    description: "The rules for using Requo.",
    icon: FileSignature,
  },
  "/refund-policy": {
    description: "Cancellations and refund eligibility.",
    icon: Receipt,
  },
};

const productItems: MarketingMenuItem[] = productLinks.map((link) => ({
  href: link.href,
  icon: link.icon,
  title: link.label,
  description: link.description,
}));

const solutionItems: MarketingMenuItem[] = solutionLinks.map((solution) => ({
  href: solutionHref(solution.slug),
  icon: solution.icon,
  title: solution.title,
  description: solution.description,
}));

const resourceItems: MarketingMenuItem[] = resourceLinks.map((link) => {
  const details = resourceDetails[link.href] ?? {
    description: "",
    icon: FileText,
  };

  return {
    href: link.href,
    icon: details.icon,
    title: link.label,
    description: details.description,
  };
});

/**
 * Primitive trigger (not the shadcn wrapper): the wrapper always appends
 * its own chevron, which breaks `asChild` composition (`Children.only`).
 * Same Radix state machine, identical UI.
 */
function NavTrigger({
  triggerClassName,
  children,
  open,
  onArrowDown,
  onRequestClose,
}: {
  triggerClassName?: string;
  children: ReactNode;
  open: boolean;
  /** Returns true when it opened the menu and handled the key itself. */
  onArrowDown?: () => boolean;
  onRequestClose?: () => void;
}) {
  return (
    <NavigationMenuPrimitive.Trigger asChild>
      <button
        className={cn(defaultTriggerClass, "gap-1", triggerClassName, "group")}
        onClick={() => {
          if (open) {
            onRequestClose?.();
          }
        }}
        onKeyDown={(event) => {
          if (
            event.key !== "ArrowDown" ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          ) {
            return;
          }

          // Leave the key to Radix when this trigger is already open so its
          // own focus-first-item handling runs.
          if (onArrowDown?.()) {
            event.preventDefault();
          }
        }}
        type="button"
      >
        {children}
        <span className="nav-underline" aria-hidden="true" />
        <ChevronDown
          aria-hidden="true"
          className="size-3 opacity-50 transition-transform duration-150 group-data-[state=open]:rotate-180"
        />
      </button>
    </NavigationMenuPrimitive.Trigger>
  );
}

type MenuValue = "product" | "solutions" | "resources";

/**
 * Single navigation root for Product / Solutions / Resources so the shared
 * viewport card persists and morphs when moving between triggers instead of
 * unmounting and remounting per menu.
 */
export function MarketingMainNav({
  triggerClassName,
}: {
  triggerClassName?: string;
}) {
  const [value, setValue] = useState("");
  const panelRefs = useRef<Partial<Record<MenuValue, HTMLDivElement | null>>>(
    {},
  );

  const focusFirstItem = useCallback((menu: MenuValue) => {
    window.requestAnimationFrame(() => {
      panelRefs.current[menu]?.querySelector<HTMLAnchorElement>("a")?.focus();
    });
  }, []);

  /**
   * Radix opens on ArrowDown only once a trigger is already open. Opening from
   * a closed root is ours: set the controlled value, then move focus into the
   * freshly mounted panel on the next frame.
   */
  const openFromKeyboard = useCallback(
    (menu: MenuValue) => {
      if (value === menu) {
        return false;
      }

      setValue(menu);
      focusFirstItem(menu);
      return true;
    },
    [focusFirstItem, value],
  );

  const setPanelRef =
    (menu: MenuValue) => (node: HTMLDivElement | null) => {
      panelRefs.current[menu] = node;
    };

  /*
   * Radix's internal 150ms hover-close fires even while the pointer is still
   * crossing the 6px gap between a trigger and the panel, which closed the
   * menu mid-traverse. Keep the menu open while the pointer is anywhere inside
   * the nav (trigger, gap, or panel) and close from the root's pointer-leave
   * instead, with the same 150ms delay.
   */
  const pointerInsideRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const handleValueChange = useCallback((next: string) => {
    if (next === "" && pointerInsideRef.current) {
      return;
    }

    setValue(next);
  }, []);

  /**
   * Trigger clicks close directly: Radix's own toggle would arrive at
   * `handleValueChange` as an internal dismiss, which the pointer-inside guard
   * above swallows, and waiting on it also made the close depend on the event
   * order. Closing here keeps the click path deterministic.
   */
  const closeMenu = useCallback(() => setValue(""), []);

  const handlePointerEnter = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      pointerInsideRef.current = true;
      clearCloseTimer();
    },
    [clearCloseTimer],
  );

  const handlePointerLeave = useCallback(
    (event: ReactPointerEvent) => {
      if (event.pointerType !== "mouse") {
        return;
      }

      pointerInsideRef.current = false;
      clearCloseTimer();
      closeTimerRef.current = window.setTimeout(() => {
        closeTimerRef.current = null;
        setValue("");
      }, 150);
    },
    [clearCloseTimer],
  );

  return (
    <NavigationMenu
      delayDuration={100}
      onBlur={(event) => {
        if (value === "") {
          return;
        }

        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) {
          return;
        }

        // Radix dismisses on focus-out, but the hover-close guard above would
        // swallow that dismiss while the pointer happens to rest inside the
        // nav. Close here so tabbing out never leaves the panel open.
        setValue("");
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || value === "") {
          return;
        }

        // Radix's DismissableLayer listens in the document capture phase, so it
        // has already returned focus to the trigger and asked to close by the
        // time this runs. Close directly: the hover-close guard would ignore
        // that internal dismiss while the pointer is still inside the nav.
        setValue("");
      }}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onValueChange={handleValueChange}
      value={value}
      viewportClassName="marketing-nav-panel"
    >
      <NavigationMenuList>
        <NavigationMenuItem value="product">
          <NavTrigger
            onArrowDown={() => openFromKeyboard("product")}
            onRequestClose={closeMenu}
            open={value === "product"}
            triggerClassName={triggerClassName}
          >
            Product
          </NavTrigger>
          <NavigationMenuContent className="w-[42rem] max-w-[calc(100vw-2rem)] p-2 md:w-[42rem]">
            <div className="marketing-nav-content" ref={setPanelRef("product")}>
              <MarketingMenuList
                className="grid grid-cols-2 gap-0.5"
                items={productItems}
                onNavigate={closeMenu}
              />
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="solutions">
          <NavTrigger
            onArrowDown={() => openFromKeyboard("solutions")}
            onRequestClose={closeMenu}
            open={value === "solutions"}
            triggerClassName={triggerClassName}
          >
            Solutions
          </NavTrigger>
          <NavigationMenuContent className="w-[42rem] max-w-[calc(100vw-2rem)] p-2 md:w-[42rem]">
            <div
              className="marketing-nav-content"
              ref={setPanelRef("solutions")}
            >
              <MarketingMenuList
                className="grid grid-cols-2 gap-0.5"
                items={solutionItems}
                onNavigate={closeMenu}
              />
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem value="resources">
          <NavTrigger
            onArrowDown={() => openFromKeyboard("resources")}
            onRequestClose={closeMenu}
            open={value === "resources"}
            triggerClassName={triggerClassName}
          >
            Resources
          </NavTrigger>
          <NavigationMenuContent className="w-[21rem] max-w-[calc(100vw-2rem)] p-2 md:w-[21rem]">
            <div
              className="marketing-nav-content"
              ref={setPanelRef("resources")}
            >
              <MarketingMenuList
                className="flex flex-col gap-0.5"
                items={resourceItems}
                onNavigate={closeMenu}
              />
            </div>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
