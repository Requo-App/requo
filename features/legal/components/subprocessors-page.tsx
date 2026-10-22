import {
  LegalDocumentPage,
  type LegalDocumentSection,
  LegalParagraph,
  LegalSectionHeading,
} from "@/features/legal/components/legal-document-page";
import { legalConfig } from "@/features/legal/config";

type Subprocessor = {
  name: string;
  purpose: string;
  dataLocation: string;
  policyUrl: string;
  policyLabel: string;
};

const subprocessors: Subprocessor[] = [
  {
    name: "Groq",
    purpose: "AI inference",
    dataLocation: "United States",
    policyUrl: "https://groq.com/privacy-policy/",
    policyLabel: "Privacy Policy",
  },
  {
    name: "Google (Gemini)",
    purpose: "AI inference and OAuth",
    dataLocation: "United States",
    policyUrl: "https://policies.google.com/privacy",
    policyLabel: "Privacy Policy",
  },
  {
    name: "OpenRouter",
    purpose: "AI routing",
    dataLocation: "United States",
    policyUrl: "https://openrouter.ai/privacy",
    policyLabel: "Privacy Policy",
  },
  {
    name: "Cloudflare",
    purpose: "AI inference (edge)",
    dataLocation: "Global",
    policyUrl: "https://www.cloudflare.com/privacypolicy/",
    policyLabel: "Privacy Policy",
  },
  {
    name: "NVIDIA",
    purpose: "AI inference",
    dataLocation: "United States",
    policyUrl: "https://www.nvidia.com/en-us/about-nvidia/privacy-policy/",
    policyLabel: "Privacy Policy",
  },
  {
    name: "Polar",
    purpose: "Payment processing",
    dataLocation: "United States",
    policyUrl: "https://polar.sh/legal/privacy",
    policyLabel: "Privacy Policy",
  },
  {
    name: "Resend",
    purpose: "Transactional email",
    dataLocation: "United States",
    policyUrl: "https://resend.com/legal/privacy-policy",
    policyLabel: "Privacy Policy",
  },
  {
    name: "Supabase",
    purpose: "Database and storage",
    dataLocation: "Configured project region",
    policyUrl: "https://supabase.com/privacy",
    policyLabel: "Privacy Policy",
  },
  {
    name: "Vercel",
    purpose: "Hosting and deployment",
    dataLocation: "United States",
    policyUrl: "https://vercel.com/legal/privacy-policy",
    policyLabel: "Privacy Policy",
  },
];

const subprocessorsSections: LegalDocumentSection[] = [
  {
    id: "overview",
    title: "Overview",
    content: (
      <>
        <LegalSectionHeading>Overview</LegalSectionHeading>
        <LegalParagraph>
          {legalConfig.companyName} uses the following third-party subprocessors
          to operate the service. Each subprocessor processes personal data only
          as necessary to fulfill its stated purpose. We maintain Data
          Processing Agreements with each provider where applicable.
        </LegalParagraph>
        <LegalParagraph>
          If you have questions about our subprocessors or wish to request a
          copy of our Data Processing Agreement, please contact{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={`mailto:${legalConfig.privacyEmail}`}
          >
            {legalConfig.privacyEmail}
          </a>
          .
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "subprocessor-list",
    title: "Subprocessor List",
    content: (
      <>
        <LegalSectionHeading>Subprocessor List</LegalSectionHeading>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/70">
                <th className="pb-3 pr-4 text-left font-medium text-foreground">
                  Company
                </th>
                <th className="pb-3 pr-4 text-left font-medium text-foreground">
                  Purpose
                </th>
                <th className="pb-3 pr-4 text-left font-medium text-foreground">
                  Data Location
                </th>
                <th className="pb-3 text-left font-medium text-foreground">
                  Policy
                </th>
              </tr>
            </thead>
            <tbody>
              {subprocessors.map((sp) => (
                <tr
                  className="border-b border-border/40 last:border-b-0"
                  key={sp.name}
                >
                  <td className="py-3 pr-4 font-medium text-foreground">
                    {sp.name}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {sp.purpose}
                  </td>
                  <td className="py-3 pr-4 text-muted-foreground">
                    {sp.dataLocation}
                  </td>
                  <td className="py-3">
                    <a
                      className="text-foreground underline-offset-4 hover:underline"
                      href={sp.policyUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {sp.policyLabel}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    ),
  },
  {
    id: "updates",
    title: "Updates",
    content: (
      <>
        <LegalSectionHeading>Updates</LegalSectionHeading>
        <LegalParagraph>
          We may update this list from time to time as we add or change
          subprocessors. Material changes will be communicated via email to
          affected users in advance where required by applicable data protection
          law.
        </LegalParagraph>
      </>
    ),
  },
];

export function SubprocessorsPage() {
  return (
    <LegalDocumentPage title="Subprocessors" sections={subprocessorsSections} />
  );
}
