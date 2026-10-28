import { Fragment, type ReactNode } from "react";

import { MarketingHeader } from "@/components/marketing/marketing-header";
import { PublicPageShell } from "@/components/shared/public-page-shell";
import {
  LegalTableOfContents,
  type LegalTocItem,
} from "@/features/legal/components/legal-table-of-contents";
import {
  isNumberedLegalHeading,
  toLegalHeadingIds,
} from "@/features/legal/heading-id";
import { cn } from "@/lib/utils";

export type LegalDocumentSection = {
  /** Existing anchor to preserve when it differs from the generated slug. */
  id?: string;
  /** Additional older anchors that should resolve to this section. */
  legacyIds?: string[];
  title: string;
  content: ReactNode;
};

type LegalDocumentPageProps = {
  title: string;
  effectiveDate: string;
  content: LegalDocumentSection[];
};

export function LegalDocumentPage({
  title,
  effectiveDate,
  content,
}: LegalDocumentPageProps) {
  const headingIds = toLegalHeadingIds(content.map((section) => section.title));
  const sections = content.map((section, index) => {
    const headingId = headingIds[index];
    const legacyIds = [section.id, ...(section.legacyIds ?? [])].filter(
      (id): id is string => Boolean(id && id !== headingId),
    );

    return { section, headingId, legacyIds };
  });
  const tocItems: LegalTocItem[] = sections
    .filter(({ section }) => isNumberedLegalHeading(section.title))
    .map(({ section, headingId, legacyIds }) => ({
      id: headingId,
      label: section.title,
      legacyIds,
    }));
  const showToc = tocItems.length >= 3;

  return (
    <PublicPageShell
      brandSubtitle={null}
      className="public-page--flush"
      header={<MarketingHeader />}
    >
      <div className="marketing-shell-container legal-page">
        <div className={cn("legal-grid", showToc && "legal-grid--with-toc")}>
          <header className="legal-header">
            <p className="legal-effective-date">
              Effective date: {effectiveDate}
            </p>
            <h1 className="legal-title font-heading">{title}</h1>
          </header>

          {showToc ? (
            <aside className="legal-sidebar">
              <div className="legal-sidebar-sticky">
                <LegalTableOfContents items={tocItems} variant="desktop" />
              </div>
            </aside>
          ) : null}

          <article className="legal-article">
            {showToc ? (
              <LegalTableOfContents items={tocItems} variant="mobile" />
            ) : null}

            <div className="legal-prose">
              {sections.map(({ section, headingId, legacyIds }) => (
                <Fragment key={headingId}>
                  <h2 className="legal-heading font-heading" id={headingId}>
                    {legacyIds.map((legacyId) => (
                      <span
                        className="legal-legacy-anchor"
                        id={legacyId}
                        key={legacyId}
                      />
                    ))}
                    {section.title}
                  </h2>
                  {section.content}
                </Fragment>
              ))}
            </div>
          </article>
        </div>
      </div>
    </PublicPageShell>
  );
}

export function LegalSubheading({ children }: { children: ReactNode }) {
  return <h3>{children}</h3>;
}

export function LegalParagraph({ children }: { children: ReactNode }) {
  return <p>{children}</p>;
}

export function LegalList({ items }: { items: ReactNode[] }) {
  return (
    <ul>
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </ul>
  );
}
