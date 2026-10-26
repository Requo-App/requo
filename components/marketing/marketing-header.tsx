"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { BookDemoDialog } from "@/components/marketing/book-demo-dialog";
import { MarketingHeaderShell } from "@/components/marketing/marketing-header-shell";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import { homePath } from "@/features/businesses/routes";
import { authClient } from "@/lib/auth/client";

/**
 * Marketing site header. Uses client-side session detection so marketing
 * pages can be statically generated at build time without calling headers()
 * or cookies().
 */
export function MarketingHeader() {
  return (
    <MarketingHeaderShell
      actions={<DesktopActions />}
      mobileActions={<MobileActions />}
    />
  );
}

function DesktopActions() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <DesktopActionsFallback />;
  }

  if (session?.user) {
    return (
      <Button asChild size="sm">
        <Link href={homePath}>
          Dashboard
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    );
  }

  return (
    <>
      <BookDemoDialog
        size="sm"
        variant="ghost"
        className="marketing-button-ghost px-2 text-sm font-medium text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:[outline-style:solid]"
      >
        Book a demo
      </BookDemoDialog>
      <Button asChild size="sm">
        <Link href="/signup">
          Start free
          <ArrowRight data-icon="inline-end" />
        </Link>
      </Button>
    </>
  );
}

function DesktopActionsFallback() {
  return (
    <>
      <Button
        className="marketing-button-ghost px-2 text-sm font-medium text-muted-foreground"
        size="sm"
        variant="ghost"
        disabled
      >
        Book a demo
      </Button>
      <Button size="sm" disabled>
        Start free
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}

function MobileActions() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return <MobileActionsFallback />;
  }

  if (session?.user) {
    return (
      <SheetClose asChild>
        <Button asChild className="h-11 w-full" size="lg">
          <Link href={homePath}>
            Go to dashboard
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </SheetClose>
    );
  }

  return (
    <>
      <SheetClose asChild>
        <div>
          <BookDemoDialog
            size="lg"
            variant="ghost"
            className="marketing-button-ghost h-11 w-full text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus-visible:[outline-style:solid]"
          >
            Book a demo
          </BookDemoDialog>
        </div>
      </SheetClose>
      <SheetClose asChild>
        <Button asChild className="h-11 w-full" size="lg">
          <Link href="/signup">
            Start free
            <ArrowRight data-icon="inline-end" />
          </Link>
        </Button>
      </SheetClose>
      <SheetClose asChild>
        <Link
          href="/login"
          className="text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Already have an account? Log in
        </Link>
      </SheetClose>
    </>
  );
}

function MobileActionsFallback() {
  return (
    <>
      <Button
        className="h-11 w-full text-sm font-medium"
        size="lg"
        variant="ghost"
        disabled
      >
        Book a demo
      </Button>
      <Button className="h-11 w-full" size="lg" disabled>
        Start free
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}
