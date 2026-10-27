import Link from "next/link";
import type { ReactNode } from "react";

import { AuthShell } from "@/components/shell/auth-shell";
import { Button } from "@/components/ui/button";
import { getOptionalSession } from "@/lib/auth/session";
import { getBusinessMemberInvitePath } from "@/features/businesses/routes";
import {
  getBusinessInviteLinkForToken,
  getBusinessMemberInviteForToken,
} from "@/features/business-members/queries";
import {
  acceptBusinessInviteLinkAction,
  acceptBusinessMemberInviteAction,
} from "@/features/business-members/actions";

export function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export async function getInviteForToken(token: string) {
  const [invite, inviteLink] = await Promise.all([
    getBusinessMemberInviteForToken(token),
    getBusinessInviteLinkForToken(token),
  ]);

  return { invite, inviteLink };
}

function getLoginNext(token: string) {
  return `/login?next=${encodeURIComponent(getBusinessMemberInvitePath(token))}`;
}

function InviteAcceptCard({
  businessName,
  detail,
  inviteError,
  token,
  action,
}: {
  businessName: string;
  detail: ReactNode;
  inviteError: string | undefined;
  token: string;
  action: (token: string) => Promise<void>;
}) {
  return (
    <AuthShell
      badge="Invite"
      description="Accept this invite to get access to the business dashboard."
      layout="centered"
      title={`Join ${businessName}`}
    >
      <div className="flex flex-col gap-4">
        {inviteError ? (
          <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive-ink">
            That invite could not be accepted. Please ask for a new link.
          </div>
        ) : null}

        <div className="rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          <p>{detail}</p>
        </div>

        <form action={action.bind(null, token)}>
          <Button className="w-full" size="lg" type="submit">
            Accept invite
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}

function InviteSignInCard({
  businessName,
  detail,
  token,
}: {
  businessName: string;
  detail: ReactNode;
  token: string;
}) {
  return (
    <AuthShell
      badge="Invite"
      description="Sign in to accept this business access invite."
      layout="centered"
      title={`Join ${businessName}`}
    >
      <div className="flex flex-col gap-4 text-sm leading-normal sm:leading-7 text-muted-foreground">
        <p>{detail}</p>
        <Button asChild>
          <Link href={getLoginNext(token)}>Sign in</Link>
        </Button>
      </div>
    </AuthShell>
  );
}

export async function BusinessMemberInviteContent({
  token,
  errorParam,
}: {
  token: string;
  errorParam: string | string[] | undefined;
}) {
  // Invite + session are independent — fetch in parallel. Await both up front
  // so a missing-invite early return never leaves a dangling session promise.
  const [{ invite, inviteLink }, session] = await Promise.all([
    getInviteForToken(token),
    getOptionalSession(),
  ]);
  const inviteError = firstSearchParam(errorParam);
  const isSignedIn = Boolean(session);

  if (inviteLink && !invite) {
    if (!isSignedIn) {
      return (
        <InviteSignInCard
          businessName={inviteLink.businessName}
          detail={
            <>
              You&apos;ve been invited to join{" "}
              <span className="font-medium text-foreground">
                {inviteLink.businessName}
              </span>
              .
            </>
          }
          token={token}
        />
      );
    }

    return (
      <InviteAcceptCard
        action={acceptBusinessInviteLinkAction}
        businessName={inviteLink.businessName}
        detail={
          <>
            You&apos;re accepting access to{" "}
            <span className="font-medium text-foreground">
              {inviteLink.businessName}
            </span>
            .
          </>
        }
        inviteError={inviteError}
        token={token}
      />
    );
  }

  if (!invite) {
    return (
      <AuthShell
        badge="Invite"
        description="This invite link is invalid or has expired."
        layout="centered"
        title="Invite not found"
      >
        <div className="flex flex-col gap-4 text-sm leading-normal sm:leading-7 text-muted-foreground">
          <p>Ask the business owner to send a fresh invite link.</p>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!isSignedIn) {
    return (
      <InviteSignInCard
        businessName={invite.businessName}
        detail={
          <>
            This invite was sent to{" "}
            <span className="font-medium text-foreground">{invite.email}</span>.
          </>
        }
        token={token}
      />
    );
  }

  if (session?.user?.email.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <AuthShell
        badge="Invite"
        description="This invite was sent to a different email address."
        layout="centered"
        title={`Join ${invite.businessName}`}
      >
        <div className="flex flex-col gap-4 text-sm leading-normal sm:leading-7 text-muted-foreground">
          <p>
            Signed in as{" "}
            <span className="font-medium text-foreground">
              {session?.user.email}
            </span>
            , but this invite is for{" "}
            <span className="font-medium text-foreground">{invite.email}</span>.
          </p>
          <Button asChild variant="outline">
            <Link href="/login">Use a different account</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <InviteAcceptCard
      action={acceptBusinessMemberInviteAction}
      businessName={invite.businessName}
      detail={
        <>
          You&apos;re accepting access for{" "}
          <span className="font-medium text-foreground">{invite.email}</span>.
        </>
      }
      inviteError={inviteError}
      token={token}
    />
  );
}

export function BusinessMemberInviteFallback() {
  return (
    <AuthShell
      badge="Invite"
      description="Checking this business access invite."
      layout="centered"
      title="Loading invite"
    >
      <div className="flex flex-col gap-4">
        <div className="h-4 w-52 rounded-md bg-muted" />
        <div className="h-11 w-full rounded-lg bg-muted" />
      </div>
    </AuthShell>
  );
}
