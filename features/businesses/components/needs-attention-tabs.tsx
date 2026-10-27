"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Inbox,
  FileText,
  BellRing,
  CheckCircle2,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyHeader,
  EmptyDescription,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";

export type NeedsAttentionIconName = "inbox" | "file-text" | "bell-ring" | "check-circle";

type NeedsAttentionBadgeData =
  | { kind: "inquiry"; status: string }
  | { kind: "quote"; status: string }
  | { kind: "reminder"; reminderKind: string };

export type NeedsAttentionItemData = {
  href: string;
  key: string;
  label: string;
  title: string;
  description: string;
  meta: string;
  actionLabel: string;
  tone: "urgent" | "normal" | "positive";
  iconName: NeedsAttentionIconName;
  badge?: NeedsAttentionBadgeData;
  category: "Inquiry" | "Quote" | "Follow-up";
};

type CategoryFilter = "all" | "Inquiry" | "Quote" | "Follow-up";

const PAGE_SIZE = 15;

const categoryFilters: { label: string; value: CategoryFilter }[] = [
  { label: "All", value: "all" },
  { label: "Inquiries", value: "Inquiry" },
  { label: "Quotes", value: "Quote" },
  { label: "Follow-ups", value: "Follow-up" },
];

export function NeedsAttentionTabs({
  items,
}: {
  items: NeedsAttentionItemData[];
}) {
  const [activeFilter, setActiveFilter] = useState<CategoryFilter>("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const filteredItems = useMemo(
    () =>
      activeFilter === "all"
        ? items
        : items.filter((item) => item.category === activeFilter),
    [items, activeFilter],
  );

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );

  const hasMore = visibleCount < filteredItems.length;

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  // IntersectionObserver for infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    // Dashboard content scrolls inside the shell card, not the window. Anchor
    // the preload margin to that scrollport so the sentinel still triggers
    // before it reaches the card's bottom edge.
    const root = sentinel.closest<HTMLElement>("[data-shell-scroll]");

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMore();
        }
      },
      { root, rootMargin: "100px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadMore]);

  const visibleFilters = categoryFilters.filter(
    (f) => f.value === "all" || (categoryCounts[f.value] ?? 0) > 0,
  );

  return (
    <div className="flex flex-col">
      {/* Category filter tabs */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 pb-2">
        {visibleFilters.map((filter) => (
          <Button
            key={filter.value}
            onClick={() => {
              setActiveFilter(filter.value);
              setVisibleCount(PAGE_SIZE);
            }}
            size="sm"
            type="button"
            variant={activeFilter === filter.value ? "secondary" : "ghost"}
            className={cn(
              "h-7 gap-1 px-2.5 text-xs",
              activeFilter === filter.value && "font-semibold",
            )}
          >
            {filter.label}
            {(categoryCounts[filter.value] ?? 0) > 0 ? (
              <span className="text-xs text-muted-foreground">
                {categoryCounts[filter.value]}
              </span>
            ) : null}
          </Button>
        ))}
      </div>

      {/* Filtered items — flow with the window scroll (single scroll
          context on /home). Deliberately no inner `overflow-y-auto`: a nested
          scroller traps wheel/touch over the queue and fights scroll anchoring
          with the sticky sidebar rail. Infinite scroll observes against the
          viewport, so it keeps working. */}
      <div className="flex flex-col">
        <div className="flex flex-col">
          {visibleItems.length ? (
            visibleItems.map((item) => (
              <NeedsAttentionMinimalRow item={item} key={item.key} />
            ))
          ) : (
            <Empty className="rounded-none border-0 py-8">
              <EmptyHeader>
                <EmptyDescription>No items in this category.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div
              ref={sentinelRef}
              className="flex shrink-0 items-center justify-center py-2"
            >
              <span className="text-xs text-muted-foreground/60">Loading…</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action-oriented Row
// ---------------------------------------------------------------------------

const iconMap: Record<NeedsAttentionIconName, LucideIcon> = {
  "inbox": Inbox,
  "file-text": FileText,
  "bell-ring": BellRing,
  "check-circle": CheckCircle2,
};

const iconStyles: Record<NeedsAttentionIconName, string> = {
  "inbox": "bg-info/10 text-info-ink", // blue for inquiries
  "file-text": "bg-success/10 text-success-ink", // emerald for quotes
  "bell-ring": "bg-warning/10 text-warning-ink", // amber for follow-ups
  "check-circle": "bg-primary/10 text-primary-ink", // green for accepted/success
};

function NeedsAttentionMinimalRow({ item }: { item: NeedsAttentionItemData }) {
  const Icon = iconMap[item.iconName];
  const iconStyle = iconStyles[item.iconName] || "bg-muted text-muted-foreground";
  const isUrgent = item.tone === "urgent";

  return (
    <Link
      className="group flex items-center justify-between gap-4 border-b border-border/40 py-2.5 transition-colors hover:bg-accent/15 px-2 first:pt-2 last:border-b-0"
      href={item.href}
      prefetch={true}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        {/* Soft category-specific icon instead of stark solid red dot */}
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg transition-transform group-hover:scale-105",
            iconStyle
          )}
        >
          <Icon className="size-4" />
        </div>

        {/* Neat text stack */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-tight text-foreground">
              {item.title}
            </span>
            <span className="shrink-0 rounded-md bg-secondary/80 px-1.5 py-0.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {item.category}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.description}
            <span className="mx-1.5 text-muted-foreground/40">·</span>
            <span
              className={cn(
                isUrgent ? "text-destructive-ink font-medium" : "text-muted-foreground/80"
              )}
            >
              {item.meta}
            </span>
          </p>
        </div>
      </div>

      {/* Action link on the right side */}
      <div className="flex shrink-0 items-center gap-1.5">
        <span className="hidden text-xs font-semibold text-primary-ink/95 transition-colors group-hover:text-primary-ink group-hover:underline sm:inline-flex">
          {item.actionLabel}
        </span>
        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary-ink" />
      </div>
    </Link>
  );
}
