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
      <Button asChild size="sm" className="font-mono text-xs uppercase tracking-wider">
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
        variant="outline"
        className="border-border/80 bg-background font-mono text-xs uppercase tracking-wider hover:bg-accent"
      >
        Book a demo
      </BookDemoDialog>
      <Button asChild size="sm" className="bg-primary font-mono text-xs uppercase tracking-wider text-primary-foreground hover:bg-primary/90">
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
      <Button size="sm" variant="outline" disabled className="font-mono text-xs uppercase tracking-wider">
        Book a demo
      </Button>
      <Button size="sm" disabled className="font-mono text-xs uppercase tracking-wider">
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
        <Button asChild className="w-full font-mono text-xs uppercase tracking-wider" size="lg">
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
            variant="outline"
            className="w-full font-mono text-xs uppercase tracking-wider"
          >
            Book a demo
          </BookDemoDialog>
        </div>
      </SheetClose>
      <SheetClose asChild>
        <Button asChild className="w-full bg-primary font-mono text-xs uppercase tracking-wider text-primary-foreground hover:bg-primary/90" size="lg">
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
      <Button className="w-full font-mono text-xs uppercase tracking-wider" size="lg" variant="outline" disabled>
        Book a demo
      </Button>
      <Button className="w-full font-mono text-xs uppercase tracking-wider" size="lg" disabled>
        Start free
        <ArrowRight data-icon="inline-end" />
      </Button>
    </>
  );
}
