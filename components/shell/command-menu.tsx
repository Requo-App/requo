"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiFileTextLine,
  RiInboxLine,
  RiPriceTagLine,
  RiReceiptLine,
  RiStickyNoteLine,
  RiToolsLine,
} from "@remixicon/react";
import { Search, XIcon } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  clearRecentSearchRecords,
  getRecentSearchRecords,
  recordRecentSearchRecord,
  type RecentSearchRecord,
  type SearchRecordType,
} from "@/components/shell/search-recents";

export const OPEN_COMMAND_MENU_EVENT = "requo:open-command-menu";

export function openGlobalCommandMenu() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_MENU_EVENT));
}

type CommandMenuProps = {
  businessSlug: string;
  /** Controlled open state (for triggering from the sidebar search). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Hides the inline trigger button; only the dialog renders. */
  hideTrigger?: boolean;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; results: RecentSearchRecord[] };

type SearchTab = "all" | SearchRecordType;

const tabs: Array<{ value: SearchTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "inquiry", label: "Inquiries" },
  { value: "quote", label: "Quotes" },
  { value: "invoice", label: "Invoices" },
  { value: "quote-library", label: "Quote library" },
  { value: "service", label: "Services" },
  { value: "follow-up", label: "Follow-ups" },
];

const typeLabels: Record<SearchRecordType, string> = {
  inquiry: "Inquiry",
  quote: "Quote",
  invoice: "Invoice",
  "quote-library": "Quote library",
  service: "Service",
  "follow-up": "Follow-up",
};

function ResultIcon({ type }: { type: SearchRecordType }) {
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

function ResultRow({
  result,
  onSelect,
}: {
  result: RecentSearchRecord;
  onSelect: (result: RecentSearchRecord) => void;
}) {
  return (
    <Link
      href={result.href}
      prefetch={true}
      onClick={() => onSelect(result)}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
        "text-foreground hover:bg-muted",
        "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
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
  );
}

/**
 * Global record search dialog (sidebar Search / ⌘K).
 *
 * Searches inquiries, quotes, invoices, quote library, services, and follow-ups
 * through the business-scoped mobile-search endpoint. Type tabs appear once
 * the user types; with an empty query the dialog lists last-opened records
 * from per-business localStorage recents.
 */
export function CommandMenu({
  businessSlug,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: CommandMenuProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const pathname = usePathname();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [query, setQuery] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<SearchTab>("all");
  const [state, setState] = React.useState<SearchState>({ status: "idle" });
  const [recents, setRecents] = React.useState<RecentSearchRecord[]>([]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!isControlled) {
        setInternalOpen(next);
      }
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );

  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        handleOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [handleOpenChange, open]);

  React.useEffect(() => {
    const handler = () => handleOpenChange(true);
    window.addEventListener(OPEN_COMMAND_MENU_EVENT, handler);
    return () => window.removeEventListener(OPEN_COMMAND_MENU_EVENT, handler);
  }, [handleOpenChange]);

  // Reset on open and refresh recents; focus the input.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    setQuery("");
    setActiveTab("all");
    setState({ status: "idle" });
    setRecents(getRecentSearchRecords(businessSlug));
    // Focusing the search field must not move the dashboard behind the
    // dialog to the top of the page.
    const frame = window.requestAnimationFrame(() =>
      inputRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [open, businessSlug]);

  // Close the dialog on successful navigation.
  React.useEffect(() => {
    if (open) {
      handleOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Debounced server search once the user types.
  React.useEffect(() => {
    if (!open) {
      return;
    }
    const trimmed = query.trim();
    if (trimmed.length < 1) {
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
          results?: RecentSearchRecord[];
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

  const handleSelect = React.useCallback(
    (result: RecentSearchRecord) => {
      recordRecentSearchRecord(businessSlug, result);
      handleOpenChange(false);
    },
    [businessSlug, handleOpenChange],
  );

  const handleClearRecents = React.useCallback(() => {
    clearRecentSearchRecords(businessSlug);
    setRecents([]);
  }, [businessSlug]);

  const isSearching = query.trim().length >= 1;
  const results = state.status === "ready" ? state.results : [];
  const visibleResults =
    activeTab === "all"
      ? results
      : results.filter((result) => result.type === activeTab);

  return (
    <>
      {hideTrigger ? null : (
        <button
          type="button"
          onClick={() => handleOpenChange(true)}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/25 px-3 text-sm text-muted-foreground transition-colors hover:bg-muted/40 md:w-64 lg:w-80"
        >
          <div className="flex items-center gap-2">
            <Search className="size-4 shrink-0" />
            <span className="truncate">Search…</span>
          </div>
          <kbd className="pointer-events-none hidden select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium opacity-100 sm:flex">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>
      )}

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="h-[min(30rem,calc(100dvh-4rem))] gap-0 p-0 sm:max-w-[720px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search records</DialogTitle>
          <DialogDescription className="sr-only">
            Search inquiries, quotes, invoices, quote library, services, and
            follow-ups.
          </DialogDescription>
          <div className="flex shrink-0 items-center gap-1 px-4">
            <input
              ref={inputRef}
              type="search"
              aria-label="Search inquiries, quotes, invoices, quote library, services, and follow-ups"
              placeholder="Search..."
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveTab("all");
              }}
              className="h-12 min-w-0 flex-1 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {query.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setActiveTab("all");
                  inputRef.current?.focus({ preventScroll: true });
                }}
                aria-label="Clear search"
                className="shrink-0 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-border-focus-ring"
              >
                Clear
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              aria-label="Close search"
              className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-border-focus-ring"
            >
              <XIcon className="size-4" aria-hidden="true" />
            </button>
          </div>

          {isSearching ? (
            <div className="shrink-0 px-3 py-2">
              <Tabs
                value={activeTab}
                onValueChange={(value) => setActiveTab(value as SearchTab)}
              >
                <TabsList className="grid w-full grid-cols-7 gap-1">
                  {tabs.map((tab) => (
                    <TabsTrigger
                      key={tab.value}
                      value={tab.value}
                      className="min-w-0 truncate px-1.5"
                    >
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            </div>
          ) : null}

          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
            {!isSearching ? (
              recents.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  Type to search inquiries, quotes, invoices, quote library,
                  services, and follow-ups.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center justify-between px-3 py-1">
                    <span className="meta-label text-muted-foreground">
                      Last opened
                    </span>
                    <button
                      type="button"
                      onClick={handleClearRecents}
                      aria-label="Clear last opened"
                      className="shrink-0 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                    >
                      Clear
                    </button>
                  </div>
                  {recents.map((result) => (
                    <ResultRow
                      key={`${result.type}-${result.id}`}
                      result={result}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )
            ) : state.status === "loading" ? (
              <p
                className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground"
                role="status"
              >
                <Spinner />
                Searching…
              </p>
            ) : state.status === "ready" ? (
              visibleResults.length === 0 ? (
                <p className="px-3 py-3 text-sm text-muted-foreground">
                  No matching records.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {visibleResults.map((result) => (
                    <ResultRow
                      key={`${result.type}-${result.id}`}
                      result={result}
                      onSelect={handleSelect}
                    />
                  ))}
                </div>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
