import { LegalPageSkeleton } from "@/features/legal/components/legal-loading";

/**
 * Structural loading state for the Refund Policy page.
 * Renders the legal document page frame synchronously.
 */
export default function RefundPolicyLoading() {
  return <LegalPageSkeleton title="Refund Policy" sections={4} />;
}
