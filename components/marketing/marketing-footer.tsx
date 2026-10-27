import Link from "next/link";

import { BrandMark } from "@/components/shared/brand-mark";

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.46 8.76a1.69 1.69 0 1 0 0-3.38 1.69 1.69 0 0 0 0 3.38m1.39 9.74v-8.37H5.07v8.37h2.78Z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        clipRule="evenodd"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.522 2 12 2Z"
        fillRule="evenodd"
      />
    </svg>
  );
}

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
  icon?: React.ComponentType<{ className?: string }>;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const footerColumns: FooterColumn[] = [
  {
    title: "Platform",
    links: [
      { label: "Inquiries", href: "/features/inquiries" },
      { label: "Quotes", href: "/features/quotes" },
      { label: "Follow-ups", href: "/features/follow-ups" },
      { label: "AI drafting", href: "/features/ai" },
      { label: "Invoices", href: "/features/invoices" },
      { label: "Analytics", href: "/features/analytics" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { label: "Contractors", href: "/solutions/contractors-home-services" },
      { label: "Professional & IT", href: "/solutions/professional-it-services" },
      { label: "Creative", href: "/solutions/creative-marketing" },
      { label: "Photo & Video", href: "/solutions/photo-video" },
      { label: "Events & Rentals", href: "/solutions/events-rentals" },
      {
        label: "Fabrication & Signage",
        href: "/solutions/custom-fabrication-signage",
      },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Why Requo", href: "/#why-requo" },
      { label: "How it works", href: "/#workflow" },
      { label: "FAQ", href: "/#faq" },
      { label: "Pricing", href: "/pricing" },
      { label: "About", href: "/about" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Security", href: "/security" },
      { label: "Terms of use", href: "/terms" },
      { label: "Privacy policy", href: "/privacy" },
      { label: "Refund policy", href: "/refund-policy" },
      { label: "DPA", href: "/legal/dpa" },
      { label: "Subprocessors", href: "/subprocessors" },
    ],
  },
  {
    title: "Socials",
    links: [
      {
        label: "X (Twitter)",
        href: "https://x.com/requoapp",
        external: true,
        icon: XIcon,
      },
      {
        label: "LinkedIn",
        href: "https://www.linkedin.com/company/requo-app",
        external: true,
        icon: LinkedInIcon,
      },
      {
        label: "GitHub",
        href: "https://github.com/marrrkkk/requo",
        external: true,
        icon: GitHubIcon,
      },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="marketing-footer relative z-10 w-full text-muted-foreground">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8 xl:px-0">
        {/* Left column: Brand & Desktop Copyright */}
        <div className="flex flex-col justify-between self-stretch">
          <div>
            <BrandMark
              className="transition-opacity hover:opacity-90"
              href="/"
              subtitle={null}
            />
          </div>

          <p className="mt-14 hidden text-xs leading-5 text-muted-foreground lg:block">
            © 2026 Requo, Inc. All rights reserved.
          </p>
        </div>

        {/* Right columns: Navigation & Socials */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:grid-cols-5 lg:gap-12 xl:gap-16">
          {footerColumns.map((column) => (
            <div className="flex flex-col gap-3.5" key={column.title}>
              <p className="marketing-footer-heading">{column.title}</p>
              <div className="flex flex-col gap-2.5 text-[13px]">
                {column.links.map((link) => {
                  const Icon = link.icon;
                  const content = (
                    <>
                      {Icon ? (
                        <Icon className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
                      ) : null}
                      <span className="marketing-footer-link-label">
                        {link.label}
                      </span>
                    </>
                  );

                  if (link.external) {
                    return (
                      <a
                        className="marketing-footer-link group inline-flex w-fit items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
                        href={link.href}
                        key={link.label}
                        rel="noopener noreferrer"
                        target="_blank"
                      >
                        {content}
                      </a>
                    );
                  }

                  return (
                    <Link
                      className="marketing-footer-link w-fit text-muted-foreground transition-colors hover:text-foreground"
                      href={link.href}
                      key={link.label}
                    >
                      {content}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Mobile Copyright */}
        <p className="text-xs leading-5 text-muted-foreground lg:hidden">
          © 2026 Requo, Inc. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
