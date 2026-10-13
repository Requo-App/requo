import { LegalPageSkeleton } from "@/features/legal/components/legal-loading";

/**
 * Structural loading state for the DPA page.
 * Renders the legal document page frame synchronously.
 */
export default function DpaLoading() {
  return <LegalPageSkeleton title="Data Processing Agreement" />;
}
