"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { NavigationMenu as NavigationMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const highlightTransition = {
  // Mirrors `--motion-duration-fast` / `--motion-ease-standard`. Motion needs
  // numbers here, so the shared values are duplicated rather than a CSS var.
  duration: 0.15,
  ease: [0.32, 0.72, 0, 1] as const,
};

export type MarketingMenuItem = {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
};

/**
 * One menu column. The list owns the hover/focus state so a single highlight
 * can glide between rows with a shared `layoutId`; the current route keeps a
 * separate resting tint and `aria-current="page"`.
 */
export function MarketingMenuList({
  items,
  className,
  onNavigate,
}: {
  items: readonly MarketingMenuItem[];
  className?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const highlightId = useId();
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Focus outranks hover: a keyboard visitor must be able to see the row they
  // are on even when the pointer happens to rest over a different one.
  const highlightedHref = focused ?? hovered;

  return (
    <ul className={className}>
      {items.map((item) => (
        <li key={item.href}>
          <MarketingMenuLink
            current={pathname === item.href}
            description={item.description}
            highlighted={highlightedHref === item.href}
            href={item.href}
            icon={item.icon}
            // A reduced-motion visitor gets the same highlight without the
            // shared-layout glide between rows.
            layoutId={
              reduceMotion
                ? undefined
                : `marketing-nav-highlight-${highlightId}`
            }
            onBlur={() =>
              setFocused((current) => (current === item.href ? null : current))
            }
            onFocus={() => setFocused(item.href)}
            onHover={() => setHovered(item.href)}
            onHoverEnd={() =>
              setHovered((current) => (current === item.href ? null : current))
            }
            onNavigate={onNavigate}
            title={item.title}
          />
        </li>
      ))}
    </ul>
  );
}

export function MarketingMenuLink({
  href,
  icon: Icon,
  title,
  description,
  current = false,
  highlighted = false,
  layoutId,
  onFocus,
  onBlur,
  onHover,
  onHoverEnd,
  className,
  onNavigate,
}: MarketingMenuItem & {
  current?: boolean;
  highlighted?: boolean;
  layoutId?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  onHover?: () => void;
  onHoverEnd?: () => void;
  className?: string;
  onNavigate?: () => void;
}) {
  return (
    <NavigationMenuPrimitive.Link asChild>
      <Link
        aria-current={current ? "page" : undefined}
        className={cn(
          "marketing-nav-item relative flex items-start gap-3 rounded-lg px-2.5 py-2.5",
          className,
        )}
        data-slot="marketing-menu-link"
        href={href}
        onBlur={onBlur}
        onClick={onNavigate}
        onFocus={onFocus}
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") {
            onHover?.();
          }
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") {
            onHoverEnd?.();
          }
        }}
      >
        {current ? (
          <span
            aria-hidden="true"
            className="marketing-nav-row-highlight pointer-events-none absolute inset-0 rounded-lg"
          />
        ) : null}

        {highlighted && !current ? (
          <motion.span
            aria-hidden="true"
            className="marketing-nav-row-highlight pointer-events-none absolute inset-0 rounded-lg"
            layoutId={layoutId}
            transition={highlightTransition}
          />
        ) : null}

        <span className="marketing-nav-tile relative z-10 flex size-9 shrink-0 items-center justify-center rounded-lg">
          <Icon aria-hidden="true" className="size-4" />
        </span>

        <span className="relative z-10 flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="text-sm leading-snug font-semibold text-foreground">
              {title}
            </span>
            <ArrowRight
              aria-hidden="true"
              className="marketing-nav-arrow size-3.5 shrink-0"
            />
          </span>
          <span className="marketing-nav-description text-xs leading-snug">
            {description}
          </span>
        </span>
      </Link>
    </NavigationMenuPrimitive.Link>
  );
}
