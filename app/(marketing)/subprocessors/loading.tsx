import { LegalPageSkeleton } from "@/features/legal/components/legal-loading";

/**
 * Structural loading state for the Subprocessors page.
 * Renders the legal document page frame synchronously.
 */
export default function SubprocessorsLoading() {
  return <LegalPageSkeleton title="Subprocessors" sections={4} />;
}
