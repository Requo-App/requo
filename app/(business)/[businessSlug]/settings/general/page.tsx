import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RotateCcw } from "lucide-react";

import { ServerActionButton } from "@/components/shared/server-action-button";
import { BusinessGeneralSettingsStaticFallback } from "@/components/shell/settings-body-skeletons";
import {
  archiveBusinessAction,
  deleteBusinessPermanentlyAction,
  restoreBusinessAction,
  unarchiveBusinessAction,
} from "@/features/businesses/actions";
import { BusinessSettingsForm } from "@/features/settings/components/business-settings-form";
import { updateBusinessSettingsAction } from "@/features/settings/actions";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOwnerPageContext } from "../_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Profile",
  description:
    "General business profile settings, branding, and lifecycle actions.",
});

export const instant = true;

/**
 * General settings page — non-blocking structural shell.
 *
 * Static section titles, descriptions, and field labels paint instantly
 * (like (main) PageHeader titles); only the controls that need DB values
 * stream behind skeletons. All dynamic reads (getBusinessOwnerPageContext,
 * settings queries) are resolved inside a Suspense-wrapped child server
 * component.
 */
export default function BusinessGeneralSettingsPage() {
  return (
    <Suspense fallback={<BusinessGeneralSettingsStaticFallback />}>
      <BusinessGeneralSettingsContent />
    </Suspense>
  );
}

async function BusinessGeneralSettingsContent() {
  const { user, businessContext } = await getBusinessOwnerPageContext();
  const settings = await getBusinessSettingsForBusiness(
    businessContext.business.id,
  );

  if (!settings) {
    notFound();
  }

  const logoPreviewUrl = settings.logoStoragePath
    ? `/api/business/logo?v=${settings.updatedAt.getTime()}`
    : null;

  const form = (
    <BusinessSettingsForm
      action={updateBusinessSettingsAction}
      archiveAction={archiveBusinessAction.bind(
        null,
        settings.id,
        settings.slug,
      )}
      deleteAction={deleteBusinessPermanentlyAction.bind(
        null,
        settings.id,
        settings.slug,
      )}
      fallbackContactEmail={user.email}
      key={`business-settings-${settings.updatedAt.getTime()}`}
      logoPreviewUrl={logoPreviewUrl}
      restoreAction={restoreBusinessAction.bind(
        null,
        settings.id,
        settings.slug,
      )}
      settings={settings}
      unarchiveAction={unarchiveBusinessAction.bind(
        null,
        settings.id,
        settings.slug,
      )}
    />
  );

  if (settings.recordState === "archived") {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-10">
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold tracking-tight text-foreground">
              Restore business
            </h2>
            <p className="text-sm leading-6 text-muted-foreground">
              Restore this business to make it active again. You&apos;ll be
              able to manage inquiries, quotes, and settings.
            </p>
          </div>
          <div data-allow-archived>
            <ServerActionButton
              action={unarchiveBusinessAction.bind(
                null,
                settings.id,
                settings.slug,
              )}
              icon={RotateCcw}
              label="Restore business"
              pendingLabel="Restoring..."
            />
          </div>
        </section>

        {form}
      </div>
    );
  }

  return form;
}
