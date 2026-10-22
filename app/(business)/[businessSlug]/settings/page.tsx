import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getDefaultBusinessSettingsPath } from "@/features/settings/navigation";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessSettingsPageContext } from "./_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Settings",
  description: "Personal and business settings for your Requo business.",
});

export const instant = true;

export default function SettingsPage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <SettingsRedirect params={params} />
    </Suspense>
  );
}

async function SettingsRedirect({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getBusinessSettingsPageContext(businessSlug);
  const destination = getDefaultBusinessSettingsPath(
    businessSlug,
    businessContext.role,
  );
  redirect(destination);
  return null as never;
}
