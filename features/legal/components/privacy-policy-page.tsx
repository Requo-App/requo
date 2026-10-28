import Link from "next/link";

import { legalConfig } from "@/features/legal/config";
import {
  LegalDocumentPage,
  type LegalDocumentSection,
  LegalList,
  LegalParagraph,
  LegalSubheading,
} from "@/features/legal/components/legal-document-page";

const privacySections: LegalDocumentSection[] = [
  {
    id: "introduction",
    legacyIds: ["scope"],
    title: "1. Overview",
    content: (
      <>
        <LegalParagraph>
          Requo (&quot;Requo,&quot; &quot;we,&quot; &quot;us,&quot; or
          &quot;our&quot;) provides inquiry, quote, follow-up, invoice, and
          payment-record software for service businesses at{" "}
          <a href={legalConfig.domain}>{legalConfig.domain}</a> (the
          &quot;Service&quot;).
        </LegalParagraph>
        <LegalParagraph>
          This Privacy Policy explains what personal information we collect,
          how we use it, and the choices you have. It applies to our website,
          application, public inquiry pages, public quote links, and related
          communications.
        </LegalParagraph>
        <LegalSubheading>Our role</LegalSubheading>
        <LegalParagraph>
          When a business uses Requo to collect and manage information about
          its customers, the business decides what to collect and why. We
          process that information on the business&apos;s instructions. For our
          own account, billing, support, website, and security data, we act as
          the controller. Businesses are responsible for their own privacy
          notices and for responding to their customers&apos; requests.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "information-we-collect",
    legacyIds: [
      "accounts-and-businesses",
      "billing-and-payments",
      "files-and-customer-content",
    ],
    title: "2. Information We Collect",
    content: (
      <>
        <LegalParagraph>
          We collect the following categories of information:
        </LegalParagraph>
        <LegalList
          items={[
            "Account and business details, such as your name, email address, login credentials, profile details, business name, logo, and team member email addresses.",
            "Content you create or manage in the Service, such as inquiries, notes, replies, quotes, quote line items, invoices, payment records, pricing, FAQs, follow-up tasks, notifications, and activity records.",
            "Information submitted through public inquiry forms, such as contact details, requested services, project details, custom field answers, and attachments.",
            "Quote responses, such as an accept or decline action, a message, and the time of the response.",
            "Technical and security information, such as IP address, device and browser details, login activity, page requests, timestamps, and diagnostic data.",
            "Billing records, such as your plan, billing interval, subscription status, transaction identifiers, and refund status. Payment card details are collected by our payment provider, not by us.",
          ]}
        />
        <LegalParagraph>
          We also use essential cookies and browser storage for session handling
          and preferences such as theme, active business, and sidebar state. See
          section 8 for details.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "how-we-use-information",
    legacyIds: ["lawful-basis"],
    title: "3. How We Use Information",
    content: (
      <>
        <LegalParagraph>
          We use personal information for the following purposes:
        </LegalParagraph>
        <LegalList
          items={[
            "Provide, operate, maintain, and secure the Service, including public inquiry pages and quote links.",
            "Authenticate users, manage sessions, administer business membership and invites, and show the correct business context.",
            "Receive, store, display, deliver, and follow up on inquiries, quotes, invoices, notifications, and transactional emails.",
            "Provide AI-assisted features when you choose to use them.",
            "Respond to support requests, troubleshoot issues, and investigate suspected abuse.",
            "Maintain audit, billing, and security records and enforce our agreements.",
            "Measure performance and improve the Service.",
            "Comply with applicable law and respond to lawful requests.",
          ]}
        />
      </>
    ),
  },
  {
    id: "public-inquiry-pages-and-forms",
    title: "4. Public Inquiry Pages And Quote Links",
    content: (
      <>
        <LegalParagraph>
          Businesses can publish inquiry pages and forms and share quote links
          without requiring customers to create a Requo account.
        </LegalParagraph>
        <LegalParagraph>
          Information submitted through a public inquiry form is made available
          to the receiving business and its authorized members. Anyone who has a
          public quote link may be able to view the quote and submit a response,
          so businesses should share links only with intended recipients.
        </LegalParagraph>
        <LegalParagraph>
          Businesses control these pages and are responsible for the notices,
          consents, and permissions that apply to their customers.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "ai-features",
    legacyIds: ["ai-provider-data-practices", "automated-decision-making"],
    title: "5. AI Features",
    content: (
      <>
        <LegalParagraph>
          Requo includes AI-assisted features, such as quote drafting and
          improvement, summaries and suggestions, a public customer-facing
          Agent, and an Assistant for authenticated business members.
        </LegalParagraph>
        <LegalParagraph>
          When you use an AI feature, we send the prompt and relevant content,
          such as inquiry details, notes, FAQs, pricing, or business information,
          to third-party AI providers that process it to generate a response.
          Provider retention and model-improvement practices vary, including on
          free or trial tiers. Do not submit sensitive personal, financial,
          health, or confidential information to AI features unless it is
          necessary and permitted for your use.
        </LegalParagraph>
        <LegalParagraph>
          AI output may be incomplete, inaccurate, or unsuitable. It is assistive
          only, and a person must review it before relying on it, sending it to a
          customer, or acting on it. We do not use AI to make automated decisions
          with legal or similarly significant effects about individuals.
        </LegalParagraph>
        <LegalParagraph>
          See our <Link href="/subprocessors">Subprocessors</Link> page for the
          providers that support AI features.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "sharing",
    title: "6. How We Share Information",
    content: (
      <>
        <LegalSubheading>Within a business</LegalSubheading>
        <LegalParagraph>
          Authorized members of a business can access information in that
          business according to their role.
        </LegalParagraph>
        <LegalSubheading>Service providers</LegalSubheading>
        <LegalParagraph>
          We share information with companies that provide hosting, database and
          file storage, email delivery, payment processing, AI processing,
          security and rate limiting, background jobs, support chat, analytics,
          and optional sign-in. They access information only as needed to provide
          those services and are subject to contractual obligations.
        </LegalParagraph>
        <LegalSubheading>Public pages and links</LegalSubheading>
        <LegalParagraph>
          Information made available through a public inquiry page or quote link
          can be accessed by the intended recipients and by anyone else who
          receives or accesses the page or link.
        </LegalParagraph>
        <LegalSubheading>Legal, security, and business transfers</LegalSubheading>
        <LegalParagraph>
          We may disclose information when we believe it is reasonably necessary
          to comply with law, respond to lawful requests, protect the Service or
          the rights and safety of others, investigate misuse, or enforce our
          agreements. We may also disclose information in connection with a
          merger, acquisition, financing, reorganization, or sale of assets,
          subject to appropriate confidentiality protections.
        </LegalParagraph>
        <LegalParagraph>
          We do not sell personal information or share it for cross-context
          behavioral advertising.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "service-providers",
    title: "7. Service Providers And Subprocessors",
    content: (
      <>
        <LegalParagraph>
          We use third-party service providers and subprocessors to operate
          Requo. They are contractually required to process personal information
          only for the services they provide to us and to protect it.
        </LegalParagraph>
        <LegalParagraph>
          Our current list of subprocessors, including their purposes and data
          locations, is available on the{" "}
          <Link href="/subprocessors">Subprocessors</Link> page. We may update
          the list as our providers change and will provide notice where required
          by applicable law.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "cookies-and-analytics",
    legacyIds: ["do-not-track-and-gpc"],
    title: "8. Cookies And Analytics",
    content: (
      <>
        <LegalParagraph>
          We use essential cookies and similar technologies to keep you signed
          in, protect your session, remember preferences, and operate the
          Service. Disabling them may prevent parts of the Service from working.
        </LegalParagraph>
        <LegalParagraph>
          We also use browser storage for settings such as theme, active
          business, and sidebar state, and we use aggregated product analytics
          and performance measurement to understand how the Service is used and
          to improve it.
        </LegalParagraph>
        <LegalParagraph>
          We do not use third-party advertising cookies or track you across other
          websites. We honor Global Privacy Control signals where applicable.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "retention-and-security",
    legacyIds: ["data-retention-schedule", "breach-notification"],
    title: "9. Data Retention And Security",
    content: (
      <>
        <LegalParagraph>
          We retain personal information for as long as needed to provide the
          Service, maintain business records, comply with legal obligations,
          resolve disputes, and enforce our agreements.
        </LegalParagraph>
        <LegalParagraph>
          Account and business content is retained while the account or business
          exists. Deleting an account removes the account and associated data
          through cascading deletes. Deleting a business moves it to trash, where
          it can be restored, or permanently deletes it on hard delete. We do not
          promise a grace period after deletion. AI token usage logs are purged
          after 90 days. Billing, audit, and security records may be retained
          longer where required.
        </LegalParagraph>
        <LegalParagraph>
          We use reasonable administrative, technical, and organizational
          measures designed to protect information. No method of transmission or
          storage is completely secure, and we cannot guarantee absolute
          security. If a confirmed personal data breach poses a risk to your
          rights and freedoms, we will notify affected account holders without
          undue delay and within the time required by applicable law.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "international-data-transfers",
    legacyIds: ["transfers-and-rights"],
    title: "10. International Transfers",
    content: (
      <>
        <LegalParagraph>
          Requo operates from the Philippines, and our service providers may
          process information in other countries, including the United States.
          Privacy laws in those countries may differ from those in your
          jurisdiction.
        </LegalParagraph>
        <LegalParagraph>
          Where required, we use appropriate safeguards for international
          transfers, such as Standard Contractual Clauses approved by the
          European Commission. You can contact us for more information about the
          safeguards that apply to your information.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "your-rights",
    title: "11. Your Privacy Rights",
    content: (
      <>
        <LegalParagraph>
          Depending on where you live, you may have the right to access, correct,
          delete, export, restrict, or object to the processing of your personal
          information, and to withdraw consent where processing is based on
          consent. You may also have the right not to be discriminated against
          for exercising these rights.
        </LegalParagraph>
        <LegalParagraph>
          California residents may request to know, delete, or correct personal
          information and to opt out of the sale or sharing of personal
          information. We do not sell personal information or share it for
          cross-context behavioral advertising.
        </LegalParagraph>
        <LegalParagraph>
          Philippine residents have the rights provided by the Data Privacy Act
          of 2012, including the rights to be informed, access, correct, erase or
          block, object, data portability, and damages.
        </LegalParagraph>
        <LegalParagraph>
          To exercise a right, email{" "}
          <a href={`mailto:${legalConfig.privacyEmail}`}>
            {legalConfig.privacyEmail}
          </a>
          . We may need to verify your identity and will respond within 30 days
          or the period required by applicable law. If your request concerns
          information a business collected through Requo, please contact that
          business first; we will assist as needed. You may also complain to your
          local data protection authority.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "children-and-changes",
    title: "12. Children, Changes, And Contact",
    content: (
      <>
        <LegalParagraph>
          The Service is intended for businesses and is not directed to children
          under 13. We do not knowingly collect personal information from
          children under 13. If you believe a child has provided information
          through the Service, contact us at{" "}
          <a href={`mailto:${legalConfig.privacyEmail}`}>
            {legalConfig.privacyEmail}
          </a>
          .
        </LegalParagraph>
        <LegalParagraph>
          We may update this Privacy Policy from time to time. We will post the
          updated version on this page and update the effective date. If we make
          material changes, we will provide notice by email, in-product notice,
          or another reasonable method where required.
        </LegalParagraph>
        <LegalParagraph>
          Questions or requests:{" "}
          <a href={`mailto:${legalConfig.privacyEmail}`}>
            {legalConfig.privacyEmail}
          </a>
          . General support:{" "}
          <a href={`mailto:${legalConfig.supportEmail}`}>
            {legalConfig.supportEmail}
          </a>
          . Mailing address: {legalConfig.address}.
        </LegalParagraph>
      </>
    ),
  },
];

export function PrivacyPolicyPage() {
  return (
    <LegalDocumentPage
      content={privacySections}
      effectiveDate={legalConfig.effectiveDate}
      title="Privacy Policy"
    />
  );
}
