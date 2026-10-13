import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import {
  DashboardPage,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import {
  AdminAiCapacityFallback,
  AdminAiCapacitySection,
  AdminAiProviders,
  AdminAiProvidersFallback,
} from "@/features/admin/components/ai/admin-ai-providers";
import { withAdminViewLog } from "@/features/admin/page-shell";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "AI providers - Requo admin",
  description: "Configured providers, routing, and live capacity.",
});

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type AdminAiProvidersPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

/**
 * Admin AI providers page — non-blocking structural shell.
 *
 * The shell and `PageHeader` return synchronously so the header paints
 * instantly on sibling navigations. Provider state, routing profiles, and
 * the `?capacity=1` flag resolve inside the region below. Live Redis
 * capacity stays opt-in behind its own Suspense boundary — the snapshot
 * fans out many Redis GETs, so it never blocks the region and is never
 * cached.
 */
export default function AdminAiProvidersPage({
  searchParams,
}: AdminAiProvidersPageProps) {
  return (
    <DashboardPage>
      <PageHeader
        title="AI providers"
        description="Configured providers, routing, and live capacity."
      />
      <Suspense fallback={<AdminAiProvidersFallback />}>
        <AdminAiProvidersRegion searchParams={searchParams} />
      </Suspense>
    </DashboardPage>
  );
}

async function AdminAiProvidersRegion({
  searchParams,
}: AdminAiProvidersPageProps) {
  const rawParams = await searchParams;
  const showCapacity = rawParams.capacity === "1";

  return withAdminViewLog(
    { action: "view.ai-providers", targetType: "ai-provider" },
    () => (
      <>
        <AdminAiProviders />
        {showCapacity ? (
          <Suspense fallback={<AdminAiCapacityFallback />}>
            <AdminAiCapacitySection />
          </Suspense>
        ) : (
          <DashboardSection
            description="Per-model request counters and load, read live from Redis. Loading it fans out many reads, so it stays off until requested."
            title="Live capacity"
          >
            <Button asChild size="sm" variant="outline">
              <Link href="?capacity=1" prefetch={false}>
                Load live capacity
              </Link>
            </Button>
          </DashboardSection>
        )}
      </>
    ),
  );
}
