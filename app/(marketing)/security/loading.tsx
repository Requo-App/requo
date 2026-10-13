import { LegalPageSkeleton } from "@/features/legal/components/legal-loading";

/**
 * Structural loading state for the Security page.
 * Renders the legal document page frame synchronously.
 */
export default function SecurityLoading() {
  return <LegalPageSkeleton title="Security" />;
}
