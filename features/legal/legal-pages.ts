export type LegalPageLink = {
  title: string;
  footerLabel: string;
  href: string;
};

/**
 * Canonical legal-page list. The footer reads from here so navigation cannot
 * drift from the routes themselves.
 */
export const legalPages = [
  { title: "Security", footerLabel: "Security", href: "/security" },
  {
    title: "Terms of Service",
    footerLabel: "Terms of use",
    href: "/terms",
  },
  {
    title: "Privacy Policy",
    footerLabel: "Privacy policy",
    href: "/privacy",
  },
  {
    title: "Refund Policy",
    footerLabel: "Refund policy",
    href: "/refund-policy",
  },
  {
    title: "Data Processing Agreement",
    footerLabel: "DPA",
    href: "/legal/dpa",
  },
  { title: "Subprocessors", footerLabel: "Subprocessors", href: "/subprocessors" },
] as const;
