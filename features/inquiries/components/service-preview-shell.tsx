"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PublicInquiryPageRenderer } from "@/features/inquiries/components/public-inquiry-page-renderer";
import type { PublicInquiryBusiness, PublicInquiryFormState } from "@/features/inquiries/types";

type ServicePreviewShellProps = {
  business: PublicInquiryBusiness;
  action: (
    state: PublicInquiryFormState,
    formData: FormData,
  ) => Promise<PublicInquiryFormState>;
  settingsHref: string;
};

export function ServicePreviewShell({
  business,
  action,
  settingsHref,
}: ServicePreviewShellProps) {
  return (
    <PublicInquiryPageRenderer
      action={action}
      headerAction={
        <Button asChild variant="outline">
          <Link href={settingsHref} prefetch={true}>
            <ArrowLeft data-icon="inline-start" />
            Back to editor
          </Link>
        </Button>
      }
      business={business}
      previewMode
    />
  );
}
