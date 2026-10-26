"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { FileText, Menu, type LucideIcon } from "lucide-react";

import { resourceLinks } from "@/components/marketing/marketing-data";
import {
  MarketingMainNav,
  productLinks,
  resourceDetails,
} from "@/components/marketing/marketing-main-nav";
import {
  solutionHref,
  solutionLinks,
} from "@/components/marketing/solutions-data";
import { MarketingThemeToggle } from "@/components/marketing/marketing-theme-toggle";
import { BrandMark } from "@/components/shared/brand-mark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Shared nav-link class for public/marketing headers. */
const navLinkClass = "public-page-header-link marketing-nav-link";

/**
 * Fullscreen mobile nav row — same icon/title/description vocabulary as the
 * desktop dropdown cards (`MarketingMenuLink`), closing the sheet on navigate.
 */
function MobileNavLink({
  href,
  icon: Icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <SheetClose asChild>
      <Link
        href={href}
        className="flex items-start gap-3 rounded-xl px-3 py-2.5 outline-none transition-colors hover:bg-accent focus-visible:bg-accent"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border/70 bg-muted text-foreground">
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-semibold leading-snug text-foreground">
            {title}
          </span>
          {description ? (
            <span className="text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          ) : null}
        </span>
      </Link>
    </SheetClose>
  );
}

type MarketingHeaderShellProps = {
  /** Auth-aware CTA cluster for desktop (rendered as a Suspense slot). */
  actions: ReactNode;
  /** Auth-aware CTA cluster for the mobile sheet footer. */
  mobileActions: ReactNode;
};

export function MarketingHeaderShell({
  actions,
  mobileActions,
}: MarketingHeaderShellProps) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 8);

    update();
    window.addEventListener("scroll", update, { passive: true });

    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <header
      className="marketing-header sticky top-0 z-50 w-full"
      data-scrolled={scrolled ? "true" : "false"}
    >
      <div className="marketing-shell-container relative flex items-center justify-between gap-4 py-3">
        {/* Left side: Brand + Nav items */}
        <div className="flex items-center gap-6 lg:gap-8">
          <BrandMark subtitle={null} size="default" />

          <nav className="hidden items-center gap-1 lg:flex">
            <MarketingMainNav triggerClassName={navLinkClass} />
            <Link className={navLinkClass} href="/pricing">
              Pricing
              <span className="nav-underline" aria-hidden="true" />
            </Link>
            <div className="ml-1 flex items-center">
              <MarketingThemeToggle />
            </div>
          </nav>
        </div>

        {/* Right side: Actions & Mobile toggle */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <div className="hidden items-center gap-2 sm:flex sm:gap-2.5">
            {actions}
          </div>

          <div className="flex items-center gap-1 lg:hidden">
            <MarketingThemeToggle />
            <Sheet onOpenChange={setOpen} open={open}>
              <SheetTrigger asChild>
                <Button
                  aria-label="Open navigation"
                  size="icon-sm"
                  variant="ghost"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                className="w-[20rem] max-w-[calc(100vw-1.5rem)] max-sm:data-[side=right]:inset-0 max-sm:data-[side=right]:h-[100dvh] max-sm:data-[side=right]:w-full max-sm:data-[side=right]:max-w-none max-sm:data-[side=right]:rounded-none max-sm:data-[side=right]:border-0"
                side="right"
              >
                <SheetHeader className="border-b border-border/70">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <BrandMark subtitle={null} size="default" />
                </SheetHeader>

                <SheetBody className="gap-1">
                  <div className="flex flex-col gap-0.5">
                    <p className="px-3 pb-1 text-[13px] font-medium leading-5 text-muted-foreground">Product</p>
                    {productLinks.map((link) => (
                      <MobileNavLink
                        key={link.href}
                        href={link.href}
                        icon={link.icon}
                        title={link.label}
                        description={link.description}
                      />
                    ))}
                    <SheetClose asChild>
                      <Link
                        className="rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                        href="/pricing"
                      >
                        Pricing
                      </Link>
                    </SheetClose>
                  </div>

                  <div className="mt-4 flex flex-col gap-0.5">
                    <p className="px-3 pb-1 text-[13px] font-medium leading-5 text-muted-foreground">Solutions</p>
                    {solutionLinks.map((solution) => (
                      <MobileNavLink
                        key={solution.slug}
                        href={solutionHref(solution.slug)}
                        icon={solution.icon}
                        title={solution.title}
                        description={solution.description}
                      />
                    ))}
                  </div>

                  <div className="mt-4 flex flex-col gap-0.5">
                    <p className="px-3 pb-1 text-[13px] font-medium leading-5 text-muted-foreground">Resources</p>
                    {resourceLinks.map((link) => {
                      const details = resourceDetails[link.href] ?? {
                        description: "",
                        icon: FileText,
                      };
                      return (
                        <MobileNavLink
                          key={link.href}
                          href={link.href}
                          icon={details.icon}
                          title={link.label}
                          description={details.description || undefined}
                        />
                      );
                    })}
                  </div>
                </SheetBody>

                <SheetFooter className="flex-col gap-2.5 border-t border-border/70">
                  {mobileActions}
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
