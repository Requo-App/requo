"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

export type LegalTocItem = {
  id: string;
  label: string;
  /** Pre-existing anchors to recognize when the page is opened from an old link. */
  legacyIds?: string[];
};

type LegalTableOfContentsProps = {
  items: LegalTocItem[];
  variant: "desktop" | "mobile";
};

const ACTIVE_HEADING_OFFSET = 96;

function useActiveHeadingId(items: LegalTocItem[]) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const itemIds = useMemo(() => items.map((item) => item.id), [items]);
  const legacyIds = useMemo(
    () =>
      new Map(
        items.flatMap((item) =>
          (item.legacyIds ?? []).map((legacyId) => [legacyId, item.id] as const),
        ),
      ),
    [items],
  );

  useEffect(() => {
    const headings = itemIds
      .map((id) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => heading !== null);

    if (headings.length === 0) return;

    let frame = 0;

    const scheduleUpdate = (preferredId?: string) => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (preferredId) {
          setActiveId(preferredId);
          return;
        }

        const documentElement = document.documentElement;
        const atPageBottom =
          window.scrollY + window.innerHeight >=
          documentElement.scrollHeight - 2;

        if (atPageBottom) {
          setActiveId(headings[headings.length - 1]?.id ?? null);
          return;
        }

        let nextId: string | null = null;

        for (const heading of headings) {
          if (
            heading.getBoundingClientRect().top <= ACTIVE_HEADING_OFFSET
          ) {
            nextId = heading.id;
          } else {
            break;
          }
        }

        setActiveId(nextId ?? headings[0]?.id ?? null);
      });
    };

    const update = () => scheduleUpdate();
    const initialHash = window.location.hash.replace(/^#/, "");
    const initialId = legacyIds.get(initialHash) ?? initialHash;
    scheduleUpdate(
      itemIds.includes(initialId) ? initialId : undefined,
    );

    // The observer wakes the same calculation when a heading enters or leaves
    // the reading band; the scroll listener keeps the bar accurate in between.
    const observer = new IntersectionObserver(update, {
      rootMargin: "-96px 0px -65% 0px",
      threshold: [0, 1],
    });

    headings.forEach((heading) => observer.observe(heading));
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("hashchange", update);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("hashchange", update);
    };
  }, [itemIds, legacyIds]);

  return activeId;
}

export function LegalTableOfContents({
  items,
  variant,
}: LegalTableOfContentsProps) {
  const activeId = useActiveHeadingId(items);

  const list = (
    <ol className="legal-toc-list">
      {items.map((item) => {
        const isActive = item.id === activeId;

        return (
          <li key={item.id}>
            <a
              aria-current={isActive ? "location" : undefined}
              className="legal-toc-link"
              data-active={isActive ? "true" : "false"}
              href={`#${item.id}`}
            >
              {item.label}
            </a>
          </li>
        );
      })}
    </ol>
  );

  if (variant === "mobile") {
    return (
      <details className="legal-toc legal-toc--mobile">
        <summary className="legal-toc-summary">
          <span>On this page</span>
          <ChevronDown
            aria-hidden="true"
            className="legal-toc-chevron size-4"
          />
        </summary>
        <nav aria-label="On this page" className="legal-toc-mobile-panel">
          {list}
        </nav>
      </details>
    );
  }

  return (
    <nav aria-label="On this page" className="legal-toc legal-toc--desktop">
      <p className="legal-toc-label">On this page</p>
      {list}
    </nav>
  );
}
