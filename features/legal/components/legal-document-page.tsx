import type { ReactNode } from "react";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { Separator } from "@/components/ui/separator";
import { legalConfig } from "@/features/legal/config";
import { cn } from "@/lib/utils";

export type LegalDocumentSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocumentPageProps = {
  title: string;
  sections: LegalDocumentSection[];
};

export function LegalDocumentPage({
  title,
  sections,
}: LegalDocumentPageProps) {
  return (
    <PublicPageShell
      brandSubtitle={null}
      className="pb-10 lg:pb-14"
      header={<MarketingHeader />}
    >
      <div className="relative mx-auto w-full max-w-3xl px-6 py-12 md:py-20">
        <div className="relative z-10 mb-8">
          <p className="text-sm font-medium leading-none text-muted-foreground">
            Effective date: {legalConfig.effectiveDate}
          </p>
          <h1 className="mt-4 scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
            {title}
          </h1>
        </div>

        <div className="relative z-10 flex flex-col gap-10">
          {sections.map((section, index) => (
            <div className="flex flex-col gap-6" key={section.id}>
              <section className="scroll-mt-28" id={section.id}>
                <div className="flex flex-col gap-6">{section.content}</div>
              </section>
              {index < sections.length - 1 ? <Separator className="bg-border/50" /> : null}
            </div>
          ))}
        </div>
      </div>
    </PublicPageShell>
  );
}

export function LegalSectionHeading({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h2
      className={cn(
        "scroll-m-20 border-b pb-2 text-3xl font-semibold tracking-tight first:mt-0",
        className,
      )}
    >
      {children}
    </h2>
  );
}

export function LegalSubheading({ children }: { children: ReactNode }) {
  return (
    <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
      {children}
    </h3>
  );
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <p className="leading-7 [&:not(:first-child)]:mt-6">{children}</p>;
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
