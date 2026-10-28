"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  RiCloseLine,
  RiFileTextLine,
  RiInboxLine,
  RiPriceTagLine,
  RiReceiptLine,
  RiSearchLine,
  RiStickyNoteLine,
  RiToolsLine,
} from "@remixicon/react";

import type { MobileSearchResult } from "@/features/search/queries";
import { cn } from "@/lib/utils";

export type MobileGlobalSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessSlug: string;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: MobileSearchResult[] };

const typeLabels: Record<MobileSearchResult["type"], string> = {
  inquiry: "Inquiry",
  quote: "Quote",
  invoice: "Invoice",
  "quote-library": "Quote library",
  service: "Service",
  "follow-up": "Follow-up",
};

function ResultIcon({ type }: { type: MobileSearchResult["type"] }) {
  const className = "size-4 shrink-0 text-muted-foreground";
  switch (type) {
    case "inquiry":
      return <RiInboxLine className={className} aria-hidden="true" />;
    case "quote":
      return <RiFileTextLine className={className} aria-hidden="true" />;
    case "invoice":
      return <RiReceiptLine className={className} aria-hidden="true" />;
    case "quote-library":
      return <RiPriceTagLine className={className} aria-hidden="true" />;
    case "service":
      return <RiToolsLine className={className} aria-hidden="true" />;
    case "follow-up":
      return <RiStickyNoteLine className={className} aria-hidden="true" />;
  }
}

/**
 * Fullscreen record search for mobile (below `lg`).
 * Searches inquiries, quotes, invoices, quote library, services, and follow-ups
 * through the business-scoped mobile-search endpoint.
 */
export function MobileGlobalSearch({
  open,
  onOpenChange,
  businessSlug,
}: MobileGlobalSearchProps) {
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIds = useRef<number[]>([]);

  // Two-phase mount so the fullscreen surface can play its enter and exit
  // motion before leaving the DOM.
  useEffect(() => {
    if (open) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      setMounted(true);
      rafIds.current.push(
        requestAnimationFrame(() =>
          rafIds.current.push(
            requestAnimationFrame(() => {
              setVisible(true);
              inputRef.current?.focus();
            }),
          ),
        ),
      );
    } else if (mounted) {
      setVisible(false);
      unmountTimer.current = setTimeout(() => setMounted(false), 240);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted is read at close time
  }, [open]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    return () => {
      for (const id of rafIds.current) cancelAnimationFrame(id);
      rafIds.current = [];
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setState({ status: "idle" });
  }, [open]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted, onOpenChange]);

  // Close the overlay on successful navigation.
  useEffect(() => {
    if (open) {
      // Leave instantly on navigation: a fading overlay over the destination
      // reads as a stuck screen, not as motion.
      setVisible(false);
      setMounted(false);
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading" });
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/business/${encodeURIComponent(businessSlug)}/mobile-search?q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          throw new Error(`Search failed: ${response.status}`);
        }
        const data = (await response.json()) as {
          results?: MobileSearchResult[];
        };
        setState({ status: "ready", results: data.results ?? [] });
      } catch {
        if (controller.signal.aborted) {
          return;
        }
        setState({ status: "ready", results: [] });
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, businessSlug]);

  if (!mounted) {
    return null;
  }

  const showResults = state.status === "ready";
  const results = showResults ? state.results : [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search records"
      data-state={visible ? "open" : "closed"}
      className={cn(
        "motion-fullscreen-panel motion-fullscreen-nav fixed inset-0 z-50 flex flex-col bg-background lg:hidden",
        !visible && "pointer-events-none",
      )}
    >
      <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <RiSearchLine
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          aria-label="Search inquiries, quotes, invoices, quote library, services, and follow-ups"
          placeholder="Type anything…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          aria-label="Close search"
          className="motion-press flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <RiCloseLine className="size-5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-28">
        {state.status === "idle" ? (
          <p className="px-1 py-3 text-sm text-muted-foreground">
            Search inquiries, quotes, invoices, quote library, services, and
            follow-ups.
          </p>
        ) : null}
        {state.status === "loading" ? (
          <p className="px-1 py-3 text-sm text-muted-foreground" role="status">
            Searching…
          </p>
        ) : null}
        {showResults ? (
          results.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">
              No matching records.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              <span className="meta-label px-3 py-1 text-xs text-muted-foreground">
                Results
              </span>
              {results.map((result) => (
                <Link
                  key={`${result.type}-${result.id}`}
                  href={result.href}
                  prefetch={true}
                  className={cn(
                    "motion-transition flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm",
                    "text-foreground hover:bg-muted",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  )}
                >
                  <ResultIcon type={result.type} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">{result.title}</span>
                    <span className="text-muted-foreground">
                      {" · "}
                      {typeLabels[result.type]}
                    </span>
                    {result.subtitle ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {result.subtitle}
                      </span>
                    ) : null}
                  </span>
                </Link>
              ))}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
