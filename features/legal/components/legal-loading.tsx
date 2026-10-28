import { MarketingHeader } from "@/components/marketing/marketing-header";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { legalConfig } from "@/features/legal/config";

export function LegalPageSkeleton({
  title,
  sections = 5,
  withToc = sections >= 3,
}: {
  title: string;
  sections?: number;
  withToc?: boolean;
}) {
  return (
    <PublicPageShell
      brandSubtitle={null}
      className="public-page--flush"
      header={<MarketingHeader />}
    >
      <div className="marketing-shell-container legal-page">
        <div
          className={
            withToc ? "legal-grid legal-grid--with-toc" : "legal-grid"
          }
        >
          <header className="legal-header">
            <p className="legal-effective-date">
              Effective date: {legalConfig.effectiveDate}
            </p>
            <h1 className="legal-title font-heading">{title}</h1>
          </header>

          <article className="legal-article">
            <div className="legal-prose">
              {Array.from({ length: sections }).map((_, index) => (
                <div className="flex flex-col gap-4" key={`section-${index}`}>
                  <Skeleton className="h-7 w-52 rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                </div>
              ))}
            </div>
          </article>

          {withToc ? (
            <aside className="legal-sidebar">
              <div className="legal-sidebar-sticky flex flex-col gap-3">
                <Skeleton className="h-4 w-24 rounded-md" />
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton
                    className="h-3.5 w-full rounded-md"
                    key={`toc-${index}`}
                  />
                ))}
              </div>
            </aside>
          ) : null}
        </div>
      </div>
    </PublicPageShell>
  );
}
