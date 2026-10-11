import {
  DetailHeaderFallback,
  DetailSectionFallback,
} from "@/components/shared/detail-section-fallback";

/**
 * Section-level fallback for admin detail collection boundaries.
 *
 * Thin adapter over the shared `DetailSectionFallback` — same panel
 * structure, heading, and row dimensions. Kept as a named export so
 * existing admin callers are unchanged.
 */
export function AdminDetailSectionFallback({ rows = 3 }: { rows?: number }) {
  return <DetailSectionFallback rows={rows} />;
}

/**
 * Header fallback for admin detail pages while the core row resolves.
 *
 * Reuses the shared `DetailHeaderFallback` structure with the admin
 * title/description widths preserved exactly.
 */
export function AdminDetailHeaderFallback() {
  return (
    <DetailHeaderFallback
      titleClassName="h-8 w-64 max-w-full rounded-lg"
      descriptionClassName="h-4 w-48 max-w-full rounded-md"
    />
  );
}
