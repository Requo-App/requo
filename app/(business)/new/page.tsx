import { redirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";

import { BrandMark } from "@/components/shared/brand-mark";
import { Skeleton } from "@/components/ui/skeleton";
import { AccountUserMenu } from "@/features/account/components/account-user-menu";
import { getAccountProfileForUser } from "@/features/account/queries";
import { resolveUserAvatarSrc } from "@/features/account/utils";
import { createBusinessAction } from "@/features/businesses/actions";
import { CreateBusinessForm } from "@/features/businesses/components/create-business-form";
import { getBusinessQuotaForUser } from "@/features/businesses/quota";
import { homePath } from "@/features/businesses/routes";
import { newEntityId } from "@/lib/ids";
import { onboardingPath } from "@/features/onboarding/routes";
import { UpgradePrompt } from "@/features/paywall";
import { requireSession } from "@/lib/auth/session";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "New Business - Requo",
  description: "Create a new business workspace.",
});

export const instant = true;

export default function NewBusinessPage() {
  return (
    <Suspense fallback={<NewBusinessPageSkeleton />}>
      <NewBusinessPageContent />
    </Suspense>
  );
}

async function NewBusinessPageContent() {
  await connection();
  const session = await requireSession();
  const userId = session.user.id;

  const [profile, businessQuota] = await Promise.all([
    getAccountProfileForUser(userId),
    getBusinessQuotaForUser({ ownerUserId: userId }),
  ]);

  if (!profile?.onboardingCompletedAt) {
    redirect(onboardingPath);
  }

  const avatarSrc = resolveUserAvatarSrc({
    avatarStoragePath: profile.avatarStoragePath,
    profileUpdatedAt: profile.updatedAt,
    oauthImage: session.user.image ?? null,
  });

  const businessId = newEntityId();

  return (
    <div className="min-h-svh w-full bg-background">
      <NewBusinessHeader
        userMenu={
          <AccountUserMenu
            user={{
              id: session.user.id,
              email: session.user.email,
              name: session.user.name,
              avatarSrc,
            }}
          />
        }
      />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2 pb-8">
          <h1 className="font-heading text-xl font-semibold leading-tight tracking-tight text-foreground text-balance sm:text-2xl">
            Create a new business
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Set up a new workspace with inquiry capture, quote defaults, and
            follow-up basics.
          </p>
        </div>

        {businessQuota.allowed ? (
          <CreateBusinessForm
            action={createBusinessAction}
            businessId={businessId}
            plan="free"
            standalone
          />
        ) : (
          <UpgradePrompt
            variant="empty-state"
            plan={businessQuota.plan}
            description={`The Free plan supports 1 free business. You already have ${businessQuota.current}. Archive a free business or upgrade to Pro to create another.`}
          />
        )}
      </main>
    </div>
  );
}

function NewBusinessHeader({
  userMenu,
}: {
  userMenu: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-30 flex h-13 items-center border-b border-border/70 bg-background px-3 lg:h-12 lg:border-b-0 lg:px-0">
      <header className="flex min-w-0 flex-1 items-center">
        <div className="dashboard-topbar-inner min-w-0 flex-1">
          <div className="flex min-h-9 min-w-0 items-center gap-2 md:gap-2.5">
            <div className="min-w-0 flex-1">
              <BrandMark href={homePath} subtitle={null} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {userMenu}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}

function NewBusinessPageSkeleton() {
  return (
    <div className="min-h-svh w-full bg-background">
      <NewBusinessHeader
        userMenu={<Skeleton className="size-9 rounded-full" />}
      />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        <div className="space-y-2 pb-8">
          <h1 className="font-heading text-xl font-semibold leading-tight tracking-tight text-foreground text-balance sm:text-2xl">
            Create a new business
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Set up a new workspace with inquiry capture, quote defaults, and
            follow-up basics.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </main>
    </div>
  );
}
