"use client";

import type { ReactNode } from "react";
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
import { MarketingMenuLink } from "@/components/marketing/marketing-menu-link";
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

/**
 * Primitive trigger (not the shadcn wrapper): the wrapper always appends
 * its own chevron, which breaks `asChild` composition (`Children.only`).
 * Same Radix state machine, identical UI.
 */
function NavTrigger({
  triggerClassName,
  children,
}: {
  triggerClassName?: string;
  children: ReactNode;
}) {
  return (
    <NavigationMenuPrimitive.Trigger asChild>
      <button
        className={cn(defaultTriggerClass, "gap-1", triggerClassName, "group")}
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
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavTrigger triggerClassName={triggerClassName}>
            Product
          </NavTrigger>
          <NavigationMenuContent className="w-[42rem] max-w-[calc(100vw-2rem)] p-2 md:w-[42rem]">
            <ul className="grid grid-cols-2 gap-0.5">
              {productLinks.map((link) => (
                <li key={link.label}>
                  <MarketingMenuLink
                    href={link.href}
                    icon={link.icon}
                    title={link.label}
                    description={link.description}
                  />
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavTrigger triggerClassName={triggerClassName}>
            Solutions
          </NavTrigger>
          <NavigationMenuContent className="w-[42rem] max-w-[calc(100vw-2rem)] p-2 md:w-[42rem]">
            <ul className="grid grid-cols-2 gap-0.5">
              {solutionLinks.map((solution) => (
                <li key={solution.slug}>
                  <MarketingMenuLink
                    href={solutionHref(solution.slug)}
                    icon={solution.icon}
                    title={solution.title}
                    description={solution.description}
                  />
                </li>
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>

        <NavigationMenuItem>
          <NavTrigger triggerClassName={triggerClassName}>
            Resources
          </NavTrigger>
          <NavigationMenuContent className="w-[21rem] max-w-[calc(100vw-2rem)] p-2 md:w-[21rem]">
            <ul className="flex flex-col gap-0.5">
              {resourceLinks.map((link) => {
                const details = resourceDetails[link.href] ?? {
                  description: "",
                  icon: FileText,
                };
                return (
                  <li key={link.href}>
                    <MarketingMenuLink
                      href={link.href}
                      icon={details.icon}
                      title={link.label}
                      description={details.description}
                    />
                  </li>
                );
              })}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
