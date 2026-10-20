"use client";

import { useTransition } from "react";

import { toast } from "@/components/shared/notify";
import { DuplicateWarningBanner } from "@/features/inquiries/components/duplicate-warning-banner";
import type { DuplicateFlag } from "@/features/inquiries/qualification/types";

type InquiryDuplicateBannerProps = {
  duplicate: DuplicateFlag;
  businessSlug: string;
  dismissAction: () => Promise<{ error?: string } | void>;
};

export function InquiryDuplicateBanner({
  duplicate,
  businessSlug,
  dismissAction,
}: InquiryDuplicateBannerProps) {
  const [isPending, startTransition] = useTransition();

  function handleDismiss() {
    startTransition(async () => {
      const result = await dismissAction();

      if (result?.error) {
        toast.error(result.error);
      }
    });
  }

  if (isPending) {
    return null;
  }

  return (
    <DuplicateWarningBanner
      duplicate={duplicate}
      businessSlug={businessSlug}
      onDismiss={handleDismiss}
    />
  );
}
