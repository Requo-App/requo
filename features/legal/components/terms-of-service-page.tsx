import Link from "next/link";

import { legalConfig } from "@/features/legal/config";
import {
  LegalDocumentPage,
  type LegalDocumentSection,
  LegalList,
  LegalParagraph,
  LegalSectionHeading,
  LegalSubheading,
} from "@/features/legal/components/legal-document-page";

const termsSections: LegalDocumentSection[] = [
  {
    id: "acceptance",
    title: "1. Acceptance Of These Terms",
    content: (
      <>
        <LegalSectionHeading>1. Acceptance Of These Terms</LegalSectionHeading>
        <LegalParagraph>
          These Terms of Service (&quot;Terms&quot;) are a legally binding
          agreement between you and Requo (&quot;Requo,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;) governing your access to and use
          of Requo, including the website, application, public inquiry pages,
          public quote pages, and related communications made available at{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={legalConfig.domain}
          >
            {legalConfig.domain}
          </a>
          .
        </LegalParagraph>
        <LegalParagraph>
          By accessing or using the Service, you agree to these Terms. If you do
          not agree, do not use the Service.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "2. Eligibility And Authority",
    content: (
      <>
        <LegalSectionHeading>2. Eligibility And Authority</LegalSectionHeading>
        <LegalParagraph>
          You may use the Service only if you are legally capable of entering
          into a binding agreement and, if you use the Service on behalf of a
          business or other organization, you have authority to bind that entity
          to these Terms.
        </LegalParagraph>
        <LegalParagraph>
          If you use the Service on behalf of an organization, &quot;you&quot;
          includes both you and that organization.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "accounts",
    title: "3. Accounts, Authentication, And Security",
    content: (
      <>
        <LegalSectionHeading>
          3. Accounts, Authentication, And Security
        </LegalSectionHeading>
        <LegalParagraph>
          You may need an account to use certain parts of the Service. You agree
          to provide accurate information, keep your login credentials
          confidential, and promptly update your information if it changes.
        </LegalParagraph>
        <LegalParagraph>
          The Service currently supports email-and-password sign-in, optional
          email magic links (when transactional email is configured), password
          reset, session management, account deletion, and optional Google OAuth
          sign-in when enabled.
        </LegalParagraph>
        <LegalParagraph>
          You are responsible for all activity that occurs under your account to
          the extent caused by your actions or failure to safeguard access. If
          you believe your account has been compromised, contact us promptly at{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={`mailto:${legalConfig.supportEmail}`}
          >
            {legalConfig.supportEmail}
          </a>
          .
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "businesses",
    title: "4. Businesses, Multi-Business Access, And Invites",
    content: (
      <>
        <LegalSectionHeading>
          4. Businesses, Multi-Business Access, And Invites
        </LegalSectionHeading>
        <LegalParagraph>
          Requo supports businesses, member invites, role-based access,
          and multi-business switching. A user may belong to more than one
          business if invited or otherwise authorized.
        </LegalParagraph>
        <LegalParagraph>
          If you create or administer a business, you are responsible
          for managing the people you invite, the permissions you grant, and the
          content you or your team make available through that business.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "permitted-use",
    title: "5. Permitted Use",
    content: (
      <>
        <LegalSectionHeading>5. Permitted Use</LegalSectionHeading>
        <LegalParagraph>
          Subject to these Terms, Requo grants you a limited, non-exclusive,
          non-transferable, revocable right to access and use the Service for
          your internal business use in managing inquiries, quotes, and related
          customer communications.
        </LegalParagraph>
        <LegalParagraph>
          The Service is designed for service businesses and related
          workflows such as inquiry intake, lead qualification, quote delivery,
          follow-up scheduling, and internal drafting support.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "prohibited-use",
    title: "6. Prohibited Use",
    content: (
      <>
        <LegalSectionHeading>6. Prohibited Use</LegalSectionHeading>
        <LegalList
          items={[
            "Use the Service in violation of law, regulation, contractual restrictions, or the rights of others.",
            "Upload, submit, or transmit unlawful, infringing, abusive, fraudulent, defamatory, or harmful content.",
            "Attempt to gain unauthorized access to the Service, another user's account, or another business.",
            "Interfere with the operation, security, or integrity of the Service, including by introducing malware or abusive traffic.",
            "Use automated means to scrape, copy, or extract data from the Service except as expressly permitted by us.",
            "Use public inquiry pages or public quote links in a way that misrepresents identity, collects unrelated data, or circumvents the intended workflow of the Service.",
            "Use the Service in a way that could create material legal, security, or operational risk for Requo, our users, or others.",
          ]}
        />
      </>
    ),
  },
  {
    id: "user-content",
    title: "7. User Content, Uploaded Content, And Public Submissions",
    content: (
      <>
        <LegalSectionHeading>
          7. User Content, Uploaded Content, And Public Submissions
        </LegalSectionHeading>
        <LegalSubheading>A. What counts as user content</LegalSubheading>
        <LegalParagraph>
          &quot;User Content&quot; includes business information, inquiry forms,
          inquiry submissions, quotes, messages, uploaded files, notes, pricing
          entries, public quote responses, and other content
          you or your customers submit through the Service.
        </LegalParagraph>
        <LegalSubheading>B. Ownership</LegalSubheading>
        <LegalParagraph>
          As between you and Requo, you retain ownership of your User Content.
        </LegalParagraph>
        <LegalSubheading>
          C. License you grant to operate the Service
        </LegalSubheading>
        <LegalParagraph>
          You grant Requo a non-exclusive, worldwide, royalty-free license to
          host, store, reproduce, process, transmit, display, and otherwise use
          your User Content as necessary to operate, maintain, secure, and
          provide the Service and its features.
        </LegalParagraph>
        <LegalSubheading>D. Your responsibilities</LegalSubheading>
        <LegalList
          items={[
            "You are responsible for the legality, accuracy, and appropriateness of your User Content.",
            "You represent that you have all rights and permissions needed to submit User Content and allow us to process it as described in these Terms and the Privacy Policy.",
            "You are responsible for your relationship with your own customers, including the content of inquiries, quotes, offers, and underlying business commitments.",
          ]}
        />
      </>
    ),
  },
  {
    id: "public-pages",
    title: "8. Public Inquiry Pages And Public Quote Links",
    content: (
      <>
        <LegalSectionHeading>
          8. Public Inquiry Pages And Public Quote Links
        </LegalSectionHeading>
        <LegalSubheading>A. Public inquiry pages and forms</LegalSubheading>
        <LegalParagraph>
          Requo allows businesses to publish public inquiry pages and inquiry
          forms that can be accessed without a Requo login. You are responsible
          for the content, configuration, and collection practices of the public
          inquiry pages and forms you publish through the Service.
        </LegalParagraph>
        <LegalSubheading>B. Public quote links</LegalSubheading>
        <LegalParagraph>
          Public quote links are designed to let a recipient view and respond to
          a quote without a separate customer login. Anyone who has the link may
          be able to access the corresponding quote page while the link remains
          active, so you should treat public quote links as sensitive.
        </LegalParagraph>
        <LegalSubheading>C. Underlying business relationship</LegalSubheading>
        <LegalParagraph>
          Requo is not a party to the underlying transaction or service
          relationship between a business using Requo and that business&rsquo;s
          customer. We do not guarantee customer payment, service performance,
          legal enforceability of a quote, or compliance of a business&rsquo;s
          own documents or commitments.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "9. Third-Party Services And Integrations",
    content: (
      <>
        <LegalSectionHeading>
          9. Third-Party Services And Integrations
        </LegalSectionHeading>
        <LegalParagraph>
          The Service uses third-party services for hosting, data and file
          storage, payment processing, transactional email, AI request routing,
          and optional social sign-in. The providers supported in the current
          Service include:
        </LegalParagraph>
        <LegalList
          items={[
            `${legalConfig.hostingProvider}, for hosting and application delivery.`,
            `${legalConfig.storageProvider}, for database, storage, and related backend infrastructure.`,
            `${legalConfig.paymentProvider}, for subscription billing and payment processing as the merchant of record; subscription changes, cancellations, and refunds are handled through its customer portal.`,
            "Resend (with Mailtrap and Brevo as fallback providers), for transactional email delivery.",
            "Groq, Google Gemini, Cloudflare Workers AI, NVIDIA NIM, and OpenRouter, for AI request routing when AI features are used.",
            "Google, for optional OAuth sign-in when enabled; transactional email carries magic-link sign-in when configured.",
          ]}
        />
        <LegalParagraph>
          Your use of a third-party login or payment provider may also be
          subject to that provider&rsquo;s own terms and privacy practices.
          Requo is not responsible for third-party services we do not control.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "ai-features",
    title: "10. AI Features",
    content: (
      <>
        <LegalSectionHeading>10. AI Features</LegalSectionHeading>
        <LegalSubheading>A. Internal AI drafting</LegalSubheading>
        <LegalParagraph>
          Requo includes AI-assisted drafting features intended for internal use
          by authorized business users. These features may send
          prompts and related business content through our configured AI
          providers (Groq, Google Gemini, Cloudflare Workers AI, NVIDIA NIM,
          or routed via OpenRouter) and,
          depending on configuration, to the model provider used
          to generate drafts, summaries, and suggestions.
        </LegalParagraph>
        <LegalSubheading>B. AI outputs are for review</LegalSubheading>
        <LegalParagraph>
          AI outputs are provided for convenience only. They can be incomplete,
          inaccurate, or unsuitable for your use case, and you are responsible
          for reviewing and approving any output before you rely on it, send it,
          or act on it.
        </LegalParagraph>
        <LegalParagraph>
          Do not treat AI output as legal, financial, compliance, or
          professional advice, and do not rely on it without human review.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "fees",
    title: "11. Paid Plans, Fees, And Billing",
    content: (
      <>
        <LegalSectionHeading>11. Paid Plans, Fees, And Billing</LegalSectionHeading>
        <LegalParagraph>
          Requo offers a free plan with limited features and paid subscription
          plans (Pro and Business) with additional capabilities. Paid plans are
          available on monthly or yearly billing cycles. Current pricing is
          displayed on the pricing page and during checkout.
        </LegalParagraph>
        <LegalSubheading>A. Payment processing</LegalSubheading>
        <LegalParagraph>
          Subscription payments are processed by {legalConfig.paymentProvider},
          our merchant of record. USD is the base billing currency;{" "}
          {legalConfig.paymentProvider} may display a local-currency amount at
          checkout for convenience.
        </LegalParagraph>
        <LegalSubheading>B. Recurring billing</LegalSubheading>
        <LegalParagraph>
          Paid subscriptions renew automatically at the end of each billing
          period unless you cancel before the renewal date. You authorize{" "}
          {legalConfig.paymentProvider} to charge your payment method on file
          for each renewal.
        </LegalParagraph>
        <LegalSubheading>C. Cancellation</LegalSubheading>
        <LegalParagraph>
          You may cancel your subscription at any time through the{" "}
          {legalConfig.paymentProvider} customer portal linked from your
          billing settings. After cancellation, you retain access to paid
          features until the end of the current billing period, after which
          your business reverts to the free plan.
        </LegalParagraph>
        <LegalSubheading>D. Refunds</LegalSubheading>
        <LegalParagraph>
          Refund eligibility and procedures are described in our{" "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href="/refund-policy"
          >
            Refund Policy
          </Link>
          .
        </LegalParagraph>
        <LegalSubheading>E. Price changes</LegalSubheading>
        <LegalParagraph>
          We may change plan pricing from time to time. If we increase the price
          of a plan you are subscribed to, we will provide reasonable advance
          notice before the change takes effect on your next renewal.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "availability",
    title: "12. Service Availability And Changes",
    content: (
      <>
        <LegalSectionHeading>
          12. Service Availability And Changes
        </LegalSectionHeading>
        <LegalParagraph>
          We may modify, suspend, or discontinue all or part of the Service at
          any time, including features, integrations, access methods, or
          supported plans. We do not guarantee that the Service will always be
          available, uninterrupted, timely, or error-free.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "suspension",
    title: "13. Suspension And Termination",
    content: (
      <>
        <LegalSectionHeading>
          13. Suspension And Termination
        </LegalSectionHeading>
        <LegalParagraph>
          We may suspend or terminate your access to the Service if we believe,
          in good faith, that you have violated these Terms, your use creates
          security or legal risk, or suspension is needed to protect the Service,
          our users, or others.
        </LegalParagraph>
        <LegalParagraph>
          You may stop using the Service at any time. Account deletion and
          business deletion tools are available in the current Service, but
          deletion may not be immediate in all systems, including backups or
          operational logs.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "force-majeure",
    title: "14. Force Majeure",
    content: (
      <>
        <LegalSectionHeading>14. Force Majeure</LegalSectionHeading>
        <LegalParagraph>
          Neither party will be liable for any failure or delay in performing its
          obligations under these Terms where such failure or delay results from
          events beyond the affected party&rsquo;s reasonable control.
        </LegalParagraph>
        <LegalParagraph>
          Force majeure events include, but are not limited to:
        </LegalParagraph>
        <LegalList
          items={[
            "Natural disasters (earthquakes, floods, hurricanes, volcanic eruptions).",
            "Pandemics, epidemics, or widespread public health emergencies.",
            "Government actions, orders, embargoes, or sanctions.",
            "War, armed conflict, or terrorism.",
            "Infrastructure failures (power grid outages, internet backbone failures, telecommunications disruptions).",
            "Third-party service outages beyond Requo's operational control (cloud providers, payment processors, DNS providers).",
          ]}
        />
        <LegalParagraph>
          The affected party will use reasonable efforts to mitigate the impact
          of the force majeure event and resume performance as soon as
          practicable. If a force majeure event continues for more than 60
          consecutive days, either party may terminate these Terms upon written
          notice.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "data-export-commitment",
    title: "15. Data Export",
    content: (
      <>
        <LegalSectionHeading>15. Data Export</LegalSectionHeading>
        <LegalParagraph>
          While your account is active, you can export inquiries and quotes to
          CSV from within the Service. Export before deleting an account or
          business: deletion removes data through cascading deletes, and we do
          not promise a post-termination export window.
        </LegalParagraph>
        <LegalParagraph>
          If you need help exporting, contact us using the details in the{" "}
          <Link
            className="text-foreground underline-offset-4 hover:underline"
            href="/privacy"
          >
            Privacy Policy
          </Link>
          .
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "ownership",
    title: "16. Ownership Of The Service And Limited License",
    content: (
      <>
        <LegalSectionHeading>
          16. Ownership Of The Service And Limited License
        </LegalSectionHeading>
        <LegalParagraph>
          The Service, including its software, design, trademarks, and related
          materials, is owned by Requo or its licensors and is protected by
          applicable intellectual property and other laws.
        </LegalParagraph>
        <LegalParagraph>
          Except for the limited rights expressly granted in these Terms, Requo
          reserves all rights in and to the Service.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "feedback",
    title: "17. Feedback",
    content: (
      <>
        <LegalSectionHeading>17. Feedback</LegalSectionHeading>
        <LegalParagraph>
          If you provide suggestions, ideas, or feedback about the Service, you
          grant Requo a non-exclusive, royalty-free right to use that feedback
          to operate and improve the Service without compensation to you.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "18. Disclaimers",
    content: (
      <>
        <LegalSectionHeading>18. Disclaimers</LegalSectionHeading>
        <LegalParagraph>
          To the maximum extent permitted by applicable law, the Service is
          provided &quot;as is&quot; and &quot;as available.&quot; Requo
          disclaims all warranties of any kind, whether express, implied,
          statutory, or otherwise, including implied warranties of
          merchantability, fitness for a particular purpose, title, and
          non-infringement.
        </LegalParagraph>
        <LegalParagraph>
          Without limiting the foregoing, Requo does not warrant that the
          Service will meet your requirements, be uninterrupted, be secure, be
          error-free, or produce any particular business result.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "liability",
    title: "19. Limitation Of Liability",
    content: (
      <>
        <LegalSectionHeading>
          19. Limitation Of Liability
        </LegalSectionHeading>
        <LegalParagraph>
          To the maximum extent permitted by applicable law, Requo and its
          affiliates, officers, directors, employees, agents, suppliers, and
          licensors will not be liable for any indirect, incidental, special,
          consequential, exemplary, or punitive damages, or for any loss of
          profits, revenues, goodwill, data, or business opportunities, arising
          out of or relating to the Service or these Terms.
        </LegalParagraph>
        <LegalParagraph>
          To the maximum extent permitted by applicable law, Requo&rsquo;s
          aggregate liability arising out of or relating to the Service or these
          Terms will not exceed the greater of (a) the total amount you paid to
          Requo for the Service during the twelve (12) months preceding the
          event giving rise to the claim, or (b) one hundred U.S. dollars
          (US$100). If you have not paid any amounts to Requo, Requo&rsquo;s
          total liability will not exceed one hundred U.S. dollars (US$100).
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "20. Indemnity",
    content: (
      <>
        <LegalSectionHeading>20. Indemnity</LegalSectionHeading>
        <LegalParagraph>
          You agree to defend, indemnify, and hold harmless Requo, its
          affiliates, and their respective officers, directors, employees,
          agents, suppliers, and licensors from and against claims, losses,
          liabilities, damages, judgments, and expenses (including reasonable
          attorneys&rsquo; fees) arising out of or related to your use of the
          Service, your User Content, your violation of these Terms, or your
          violation of law or the rights of another person or entity.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "21. Governing Law And Venue",
    content: (
      <>
        <LegalSectionHeading>
          21. Governing Law And Venue
        </LegalSectionHeading>
        <LegalParagraph>
          These Terms and any dispute arising out of or relating to these Terms
          or the Service will be governed by and construed in accordance with{" "}
          {legalConfig.governingLaw}, without regard to conflict of law
          principles.
        </LegalParagraph>
        <LegalParagraph>
          Any dispute, claim, or controversy arising out of or relating to these
          Terms or the Service will be brought exclusively in {legalConfig.venue}
          , and you consent to the personal jurisdiction and venue of those
          courts.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "changes-and-contact",
    title: "22. Changes To These Terms And Contact Information",
    content: (
      <>
        <LegalSectionHeading>
          22. Changes To These Terms And Contact Information
        </LegalSectionHeading>
        <LegalParagraph>
          We may update these Terms from time to time. If we make material
          changes, we will post the updated version on this page and update the
          effective date above. By continuing to use the Service after the
          updated Terms take effect, you agree to the revised Terms.
        </LegalParagraph>
        <LegalParagraph>
          If you have questions about these Terms, you may contact us at{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={`mailto:${legalConfig.supportEmail}`}
          >
            {legalConfig.supportEmail}
          </a>{" "}
          or{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={`mailto:${legalConfig.privacyEmail}`}
          >
            {legalConfig.privacyEmail}
          </a>
          , or by mail at {legalConfig.address}.
        </LegalParagraph>
      </>
    ),
  },
];

export function TermsOfServicePage() {
  return <LegalDocumentPage title="Terms of Service" sections={termsSections} />;
}
