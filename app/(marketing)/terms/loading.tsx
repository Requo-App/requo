import { LegalPageSkeleton } from "@/features/legal/components/legal-loading";

/**
 * Structural loading state for the Terms of Service page.
 * Renders the legal document page frame synchronously.
 */
export default function TermsLoading() {
  return <LegalPageSkeleton title="Terms of Service" />;
}
