"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ComponentType, HTMLAttributes, ReactNode, Ref } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * PillTab — the fully-rounded pill tab switcher, in two styles:
 *
 *   pill      px 8, py 5, gap 4
 *   blue      fully rounded (40px); selected bg uses the primary/10 pill
 *             surface, icon + label in primary
 *   gray      10px radius; selected bg muted, label in foreground (quieter —
 *             scope/filter rows)
 *   idle      label in muted-foreground, icon in muted-foreground,
 *             tertiary/hover background on hover (both styles)
 *   icon      optional 20px leading glyph
 *
 * `PillTabList` owns the animated selection background so it can slide
 * between pills with a subtle spring-like settle. `PillTab` remains a plain
 * button (not a React Aria Tabs collection): these switchers drive local view
 * state, not routed tab panels.
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type PillTabVariant = "blue" | "gray";

const pillTabVariants = cva(
  cn(
    "group relative z-10 flex shrink-0 cursor-pointer items-center gap-1 px-2 py-[5px]",
    "outline-none transition-colors duration-150 ease",
    "focus-visible:ring-2 focus-visible:ring-ring",
  ),
  {
    variants: {
      variant: {
        blue: "rounded-full",
        gray: "rounded-md",
      },
    },
    defaultVariants: {
      variant: "blue",
    },
  },
);

const pillThumbVariants = cva(
  cn(
    "pointer-events-none absolute left-0 top-0",
    "transition-[transform,width,height] duration-300",
    "[transition-timing-function:cubic-bezier(0.34,1.2,0.64,1)]",
  ),
  {
    variants: {
      variant: {
        blue: "rounded-full bg-primary/10",
        gray: "rounded-md bg-muted",
      },
    },
    defaultVariants: {
      variant: "blue",
    },
  },
);

const pillHoverVariants = cva(
  "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 ease-out",
  {
    variants: {
      variant: {
        blue: "rounded-full bg-primary/10",
        gray: "rounded-md bg-accent",
      },
    },
    defaultVariants: {
      variant: "blue",
    },
  },
);

const pillSelectedIconVariants = cva("", {
  variants: {
    variant: {
      blue: "text-primary",
      gray: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "blue",
  },
});

const pillSelectedLabelVariants = cva("", {
  variants: {
    variant: {
      blue: "text-primary",
      gray: "text-foreground",
    },
  },
  defaultVariants: {
    variant: "blue",
  },
});

type Thumb = {
  left: number;
  top: number;
  width: number;
  height: number;
  variant: PillTabVariant;
};

export interface PillTabListProps extends HTMLAttributes<HTMLDivElement> {
  ref?: Ref<HTMLDivElement>;
}

export function PillTabList({ children, className, ref, ...props }: PillTabListProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<Thumb | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const measure = () => {
      const selected = el.querySelector<HTMLElement>("[data-pill-selected]");
      if (!selected) return;
      setThumb({
        left: selected.offsetLeft,
        top: selected.offsetTop,
        width: selected.offsetWidth,
        height: selected.offsetHeight,
        variant: selected.dataset.pillVariant === "gray" ? "gray" : "blue",
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    mo.observe(el, {
      attributes: true,
      subtree: true,
      attributeFilter: ["data-pill-selected"],
    });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      mo.disconnect();
      ro.disconnect();
    };
  }, []);

  const setRefs = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof ref === "function") ref(node);
    else if (ref) (ref as { current: HTMLDivElement | null }).current = node;
  };

  return (
    <div
      ref={setRefs}
      role="group"
      className={cn("relative inline-flex items-center gap-1", className)}
      {...props}
    >
      {thumb && (
        <span
          aria-hidden
          className={cn(pillThumbVariants({ variant: thumb.variant }))}
          style={{
            transform: `translate(${thumb.left}px, ${thumb.top}px)`,
            width: thumb.width,
            height: thumb.height,
          }}
        />
      )}
      {children}
    </div>
  );
}

export function PillTab({
  variant = "blue",
  icon: Icon,
  isSelected,
  onSelect,
  children,
  className,
}: {
  variant?: PillTabVariant;
  icon?: IconComponent;
  isSelected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      data-pill-selected={isSelected ? "" : undefined}
      data-pill-variant={variant}
      onClick={onSelect}
      className={cn(
        pillTabVariants({ variant }),
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          pillHoverVariants({ variant }),
          !isSelected && "group-hover:opacity-100",
        )}
      />
      {Icon && (
        <Icon
          className={cn(
            "relative z-10 size-5 shrink-0",
            isSelected ? pillSelectedIconVariants({ variant }) : "text-muted-foreground",
          )}
          aria-hidden
        />
      )}
      <span
        className={cn(
          "relative z-10 text-body-medium whitespace-nowrap",
          isSelected ? pillSelectedLabelVariants({ variant }) : "text-muted-foreground",
        )}
      >
        {children}
      </span>
    </button>
  );
}
