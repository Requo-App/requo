import type { Metadata } from "next";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { OwnerAssistantChat } from "@/features/owner-assistant/components/owner-assistant-chat";
import { loadAssistantTranscript } from "@/features/owner-assistant/session-service";

type AssistantSearchParams = { q?: string; session?: string };

type AssistantPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<AssistantSearchParams>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "Assistant",
  description: "AI-powered assistant for your business operations",
});

export const instant = true;

/**
 * The Assistant, for a new chat and for every saved conversation.
 *
 * Which conversation is open lives in `?session=`, not in the path: the first
 * send mints the session server-side and rewrites the search param in place, so
 * "new chat" and "chatting" are the same page segment. A path change here would
 * swap the segment and tear the surface down mid-stream.
 */
export default function AssistantPage({
  params,
  searchParams,
}: AssistantPageProps) {
  return (
    <DashboardPage className="min-h-0 flex-1">
      <Suspense fallback={<AssistantSkeleton />}>
        <RegionErrorBoundary fallback={<AssistantErrorState />}>
          <AssistantRegion params={params} searchParams={searchParams} />
        </RegionErrorBoundary>
      </Suspense>
    </DashboardPage>
  );
}

async function AssistantRegion({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<AssistantSearchParams>;
}) {
  const { businessSlug } = await params;
  const { q, session } = await searchParams;
  const { user, businessContext } = await getAppShellContext(businessSlug);

  // `?session=` is a pointer, not a promise: an unknown or deleted id opens a
  // new chat instead of 404ing, because the client may still be holding this
  // conversation in memory (it rewrites the param itself as it mints).
  const transcript =
    typeof session === "string" && session.trim()
      ? await loadAssistantTranscript({
          businessId: businessContext.business.id,
          userId: user.id,
          sessionId: session,
        })
      : null;

  return (
    // No `key`: the surface must never be remounted by a param change, or a
    // mint would restart the conversation it just created.
    <OwnerAssistantChat
      autoPrompt={typeof q === "string" && q.trim() ? q : null}
      businessId={businessContext.business.id}
      businessSlug={businessSlug}
      initialMessages={transcript?.rows ?? []}
      plan={businessContext.business.plan}
      sessionId={transcript?.sessionId ?? null}
      userId={user.id}
    />
  );
}

export function AssistantSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-assistant-pane="">
      <div className="flex items-center justify-between gap-2 px-3 pt-3 md:px-6">
        <Skeleton className="h-8 w-24 rounded-lg" />
        <Skeleton className="h-8 w-8 rounded-lg" />
      </div>
      <div className="chat-stage min-h-0 flex-1" data-conversation="empty">
        <div className="chat-stage-transcript px-3 md:px-6">
          <div className="chat-stage-transcript-inner mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 pt-6 pb-2">
            <div className="my-auto flex w-full flex-col items-center gap-5 py-6 text-center">
              <Skeleton className="h-7 w-64 rounded-lg sm:w-80" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <div className="flex w-full flex-col divide-y divide-border/60">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton className="my-2 h-5 w-2/3 rounded-md" key={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div aria-hidden="true" />
      </div>
    </div>
  );
}

function AssistantErrorState() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <p className="text-sm text-muted-foreground">
        The assistant couldn&apos;t be loaded. Please try again.
      </p>
    </div>
  );
}
