import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { BrandMark } from "@/components/shared/brand-mark";
import {
  extractFirstName,
  extractLastName,
  isSingleTokenName,
} from "@/features/account/name";
import { getAccountProfileForUser, hasGoogleAccountLinked } from "@/features/account/queries";
import { isSupportedBusinessCountryCode } from "@/features/businesses/locale";
import { homePath } from "@/features/businesses/routes";
import { completeOnboardingAction } from "@/features/onboarding/actions";
import { OnboardingForm } from "@/features/onboarding/components/onboarding-form";
import { ThemePreferenceSync } from "@/features/theme/components/theme-preference-sync";
import { getThemePreferenceForUser } from "@/features/theme/queries";
import { UiScaleSync } from "@/features/theme/components/ui-scale-sync";
import { getUiScalePreferenceForUser } from "@/features/theme/ui-scale-queries";
import { ensureProfileForUser } from "@/lib/auth/business-bootstrap";
import { requireSession } from "@/lib/auth/session";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { timed } from "@/lib/dev/server-timing";
import { createNoIndexMetadata } from "@/lib/seo/site";

import OnboardingLoading from "./loading";

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Onboarding - Requo",
  description: "Set up your first business to start capturing inquiries.",
});

export const instant = true;

/**
 * Onboarding page — non-blocking structural shell.
 *
 * Returns the structural shell synchronously with skeleton fallback.
 * All dynamic reads (session, profile, memberships, geo-detection)
 * are resolved inside a Suspense-wrapped child server component.
 */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<OnboardingLoading />}>
      <OnboardingPageContent />
    </Suspense>
  );
}

async function OnboardingPageContent() {
  const session = await requireSession();

  await ensureProfileForUser({
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
  });

  const [themePreference, uiScale, memberships, profile, googleLinked] =
    await timed(
      "onboarding.parallelShellFetches",
      Promise.all([
        getThemePreferenceForUser(session.user.id),
        getUiScalePreferenceForUser(session.user.id),
        getBusinessMembershipsForUser(session.user.id),
        getAccountProfileForUser(session.user.id),
        hasGoogleAccountLinked(session.user.id),
      ]),
    );

  if (memberships.length > 0 || profile?.onboardingCompletedAt) {
    redirect(homePath);
  }

  const prefilledFirstName =
    profile?.firstName?.trim() || extractFirstName(session.user.name);
  const prefilledLastName =
    profile?.lastName?.trim() || extractLastName(session.user.name);
  // Auto-skip: single-name Google account with no stored last name.
  const lastNameOptional =
    prefilledLastName === "" &&
    (profile?.lastName ?? "").trim() === "" &&
    isSingleTokenName(session.user.name) &&
    googleLinked;

  const headerStore = await headers();
  const geoCountry =
    headerStore.get("x-vercel-ip-country")?.toUpperCase() ?? "";
  const detectedCountryCode = isSupportedBusinessCountryCode(geoCountry)
    ? geoCountry
    : "";

  return (
    <>
      <ThemePreferenceSync
        themePreference={themePreference}
        userId={session.user.id}
      />
      <UiScaleSync uiScale={uiScale} userId={session.user.id} />
      <div className="min-h-svh">
        <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 py-4 sm:px-6 lg:px-8">
          <div className="fixed top-4 left-4 z-10 sm:left-6 lg:left-8">
            <BrandMark subtitle={null} />
          </div>

          <div className="flex flex-1 items-center justify-center pt-12 pb-6 sm:pt-8">
            <OnboardingForm
              action={completeOnboardingAction}
              detectedCountryCode={detectedCountryCode}
              initialProfile={{
                firstName: prefilledFirstName,
                lastName: prefilledLastName,
                avatarUrl: session.user.image ?? null,
              }}
              lastNameOptional={lastNameOptional}
            />
          </div>
        </div>
      </div>
    </>
  );
}
