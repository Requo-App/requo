import { DetailHeaderFallback } from "@/components/shared/detail-section-fallback";

export { DetailSectionFallback as AdminDetailSectionFallback } from "@/components/shared/detail-section-fallback";

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
