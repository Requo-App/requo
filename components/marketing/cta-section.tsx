import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { BookDemoDialog } from "@/components/marketing/book-demo-dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The one closing-CTA composition used by every marketing page: a centred
 * headline, one supporting line, and at most two actions. The panel, type
 * scale, spacing, and button treatment live in `app/globals.css` so a CTA
 * never restates them.
 */
export function CtaSection({
  children,
  className,
  headline,
  headingId,
  sub,
}: {
  children: ReactNode;
  className?: string;
  headline: string;
  headingId: string;
  sub: string;
}) {
  return (
    <section
      aria-labelledby={headingId}
      className={cn("marketing-cta-shell", className)}
    >
      <div className="marketing-cta-panel">
        <h2 className="marketing-cta-headline" id={headingId}>
          {headline}
        </h2>
        <p className="marketing-cta-sub">{sub}</p>
        <div className="marketing-cta-actions">{children}</div>
      </div>
    </section>
  );
}

export function CtaArrow() {
  return (
    <ArrowRight
      aria-hidden="true"
      className="size-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:group-hover/button:translate-x-0.5"
      data-icon="inline-end"
    />
  );
}

export function CtaPrimaryLink({
  children = "Start free",
  className,
  href = "/signup",
}: {
  children?: ReactNode;
  className?: string;
  href?: string;
}) {
  return (
    <Button
      asChild
      className={cn(
        "h-11 w-full px-6 text-sm font-medium sm:h-12 sm:w-auto",
        className,
      )}
      size="lg"
    >
      <Link href={href}>
        {children}
        <CtaArrow />
      </Link>
    </Button>
  );
}

export function CtaSecondaryLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  return (
    <Button
      asChild
      className={cn(
        "marketing-button-secondary h-11 w-full px-6 text-sm font-medium sm:h-12 sm:w-auto",
        className,
      )}
      size="lg"
      variant="outline"
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function CtaDemoButton({
  children = "Book a demo",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <BookDemoDialog
      className={cn(
        "marketing-button-secondary h-11 w-full px-6 text-sm font-medium sm:h-12 sm:w-auto",
        className,
      )}
      size="lg"
      variant="outline"
    >
      {children}
    </BookDemoDialog>
  );
}
