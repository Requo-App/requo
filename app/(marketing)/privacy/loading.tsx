import { LegalPageSkeleton } from "@/features/legal/components/legal-loading";

/**
 * Structural loading state for legal pages (privacy, terms, etc.).
 * Renders the legal document page frame synchronously.
 * Legal content is static — skeleton represents the text block area.
 */
export default function PrivacyLoading() {
  return <LegalPageSkeleton title="Privacy Policy" />;
}
