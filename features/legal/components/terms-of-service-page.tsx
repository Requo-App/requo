import Link from "next/link";

import { legalConfig } from "@/features/legal/config";
import {
  LegalDocumentPage,
  type LegalDocumentSection,
  LegalList,
  LegalParagraph,
} from "@/features/legal/components/legal-document-page";

const termsSections: LegalDocumentSection[] = [
  {
    id: "acceptance",
    legacyIds: ["eligibility"],
    title: "1. Agreement And Eligibility",
    content: (
      <>
        <LegalParagraph>
          These Terms of Service (&quot;Terms&quot;) are a binding agreement
          between you and Requo (&quot;Requo,&quot; &quot;we,&quot;
          &quot;us,&quot; or &quot;our&quot;) governing your access to and use
          of the Requo website, application, public inquiry pages, public quote
          links, and related communications at{" "}
          <a href={legalConfig.domain}>{legalConfig.domain}</a> (the
          &quot;Service&quot;).
        </LegalParagraph>
        <LegalParagraph>
          By creating an account, using the Service, or accepting these Terms,
          you agree to these Terms. If you use Requo on behalf of a business or
          other organization, you represent that you have authority to bind that
          entity, and &quot;you&quot; includes that entity.
        </LegalParagraph>
        <LegalParagraph>
          You may use the Service only if you are legally capable of entering
          into a binding agreement. If you do not agree to these Terms, do not
          use the Service. If you access a public inquiry page or quote link,
          these Terms apply to your use of that page or link, along with any
          terms provided by the business operating it.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "accounts",
    legacyIds: ["businesses"],
    title: "2. Accounts And Businesses",
    content: (
      <>
        <LegalParagraph>
          You must provide accurate account information, keep your login
          credentials secure, and promptly notify us of unauthorized access. You
          are responsible for activity under your account.
        </LegalParagraph>
        <LegalParagraph>
          A business owner controls its Requo workspace, including membership,
          roles, and access to business data. Members may access and use business
          data according to the permissions the owner grants. The business is
          responsible for its members and for obtaining any notices, consents,
          and permissions required for its use of Requo and its customer
          communications.
        </LegalParagraph>
        <LegalParagraph>
          We may suspend or limit access to an account or business if we believe
          it presents a security, legal, or abuse risk, or if these Terms are
          violated.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "the-service",
    legacyIds: ["permitted-use"],
    title: "3. The Service",
    content: (
      <>
        <LegalParagraph>
          Requo helps service businesses receive and manage inquiries, prepare
          and share quotes, follow up with customers, issue invoices, and record
          payments received outside Requo.
        </LegalParagraph>
        <LegalParagraph>
          <strong>Requo does not process payments.</strong> We do not hold funds,
          act as a payment processor or merchant of record for your customer
          payments, or guarantee payment. Payment records are owner-entered
          records of funds received elsewhere, and invoices are requests for
          payment.
        </LegalParagraph>
        <LegalParagraph>
          Businesses remain responsible for their services, pricing, quotes,
          invoices, taxes, customer communications, and compliance with the laws
          that apply to them. Templates, analytics, and AI suggestions are tools,
          not professional advice.
        </LegalParagraph>
        <LegalParagraph>
          We offer a free plan and paid plans. Current features, limits, and
          pricing are described on our pricing page and at checkout.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "prohibited-use",
    title: "4. Acceptable Use",
    content: (
      <>
        <LegalParagraph>You agree not to:</LegalParagraph>
        <LegalList
          items={[
            "Use the Service in violation of applicable law or to infringe the rights of others.",
            "Submit or send unlawful, harmful, fraudulent, misleading, or abusive content, or send spam or unsolicited communications.",
            "Collect or submit personal information without the notices, consents, and permissions required by law.",
            "Upload malware or interfere with the security, integrity, or availability of the Service.",
            "Attempt to access another account, business, or system without authorization, or probe, scan, or test the Service for vulnerabilities.",
            "Reverse engineer, copy, scrape, resell, rent, or time-share the Service, or evade usage limits.",
            "Use AI features to create unlawful, deceptive, or harmful content, or to make decisions that require human judgment.",
            "Impersonate another person or misrepresent your affiliation with a business.",
          ]}
        />
        <LegalParagraph>
          We may investigate suspected violations and suspend or terminate access
          as described in section 9.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "user-content",
    legacyIds: ["public-pages"],
    title: "5. Your Content And Public Pages",
    content: (
      <>
        <LegalParagraph>
          You retain ownership of the content you submit to the Service,
          including business information, inquiries, quotes, invoices, files, and
          other materials (&quot;Your Content&quot;). You grant Requo a limited,
          non-exclusive, worldwide, royalty-free license to host, store, process,
          transmit, display, and deliver Your Content as needed to provide the
          Service to you and your customers.
        </LegalParagraph>
        <LegalParagraph>
          You represent that you have the rights, notices, consents, and
          permissions needed to submit Your Content and to send communications
          through the Service, and that Your Content and communications are
          accurate and lawful.
        </LegalParagraph>
        <LegalParagraph>
          Public inquiry pages, forms, and quote links are accessible to anyone
          who has the link. You control what you publish and who you share links
          with. Do not publish confidential information or collect sensitive
          personal information through public pages without appropriate
          safeguards and notices.
        </LegalParagraph>
        <LegalParagraph>
          We may remove content that violates these Terms or applicable law, or
          that creates a security or legal risk.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "ai-features",
    title: "6. AI Features",
    content: (
      <>
        <LegalParagraph>
          AI features are assistive tools. Outputs may be incomplete, inaccurate,
          or unsuitable for your use case, and you are responsible for reviewing
          them before you rely on them, send them, or act on them. Do not treat
          AI output as legal, financial, compliance, or other professional
          advice.
        </LegalParagraph>
        <LegalParagraph>
          Do not submit sensitive personal, financial, health, or confidential
          information to AI features unless it is necessary and permitted for
          your use. Some AI actions require confirmation before they create or
          change records or send customer-facing content; do not bypass those
          controls.
        </LegalParagraph>
        <LegalParagraph>
          We may process AI inputs through third-party providers. See our{" "}
          <Link href="/privacy">Privacy Policy</Link> and{" "}
          <Link href="/subprocessors">Subprocessors</Link> page for more
          information.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "fees",
    title: "7. Plans, Billing, And Refunds",
    content: (
      <>
        <LegalParagraph>
          Paid plans are billed monthly or yearly at the prices shown at
          checkout. Subscriptions renew automatically at the end of each billing
          period unless you cancel before the renewal date, and you authorize our
          payment provider to charge your payment method for each renewal.
        </LegalParagraph>
        <LegalParagraph>
          Payments are processed by {legalConfig.paymentProvider}, our merchant
          of record. USD is the base billing currency;{" "}
          {legalConfig.paymentProvider} may display a local-currency amount at
          checkout for convenience. We do not collect or store full payment card
          details.
        </LegalParagraph>
        <LegalParagraph>
          You may cancel at any time through the {legalConfig.paymentProvider}{" "}
          customer portal linked from your billing settings. After cancellation,
          you retain access to paid features until the end of the current billing
          period, after which the business reverts to the free plan. Refunds are
          handled through that portal and are subject to our{" "}
          <Link href="/refund-policy">Refund Policy</Link>. Cancellation does not
          by itself entitle you to a refund.
        </LegalParagraph>
        <LegalParagraph>
          We may change plan pricing. If we increase the price of a plan you are
          subscribed to, we will provide reasonable advance notice before the
          change takes effect on your next renewal. If a payment fails or remains
          overdue, we may suspend paid features or downgrade the business.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "third-party-services",
    title: "8. Third-Party Services",
    content: (
      <>
        <LegalParagraph>
          The Service may link to or work with third-party services, such as
          payment processing, email delivery, optional sign-in, AI providers, and
          customer support tools. Their terms and privacy policies apply to your
          use of them, and we are not responsible for their acts or omissions.
        </LegalParagraph>
        <LegalParagraph>
          When you connect or use a third-party service, you authorize us to
          share the information needed for that integration. Disconnecting the
          integration stops future sharing but does not delete information the
          third party already holds.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "availability",
    legacyIds: ["suspension", "force-majeure", "data-export-commitment"],
    title: "9. Availability, Suspension, And Termination",
    content: (
      <>
        <LegalParagraph>
          We may modify, suspend, or discontinue all or part of the Service,
          including features, integrations, and plans. We do not guarantee that
          the Service will be uninterrupted, timely, secure, or error-free.
        </LegalParagraph>
        <LegalParagraph>
          We may suspend or terminate your access if you violate these Terms,
          fail to pay applicable fees, create a security or legal risk, or if
          suspension is needed to protect the Service or others. Where
          reasonable, we will provide notice and an opportunity to remedy the
          issue.
        </LegalParagraph>
        <LegalParagraph>
          You may stop using the Service at any time and delete your account or
          business using the available tools. Deletion may not be immediate in
          backups and operational logs. Export inquiries and quotes to CSV before
          deleting an account or business; we do not promise a post-termination
          export window.
        </LegalParagraph>
        <LegalParagraph>
          When these Terms end, your right to use the Service ends. Provisions
          that by their nature should survive, including intellectual property,
          disclaimers, limitation of liability, indemnity, and governing law,
          will survive.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "ownership",
    legacyIds: ["feedback"],
    title: "10. Intellectual Property",
    content: (
      <>
        <LegalParagraph>
          The Service, including its software, design, trademarks, documentation,
          and other materials provided by Requo, is owned by Requo or its
          licensors and is protected by intellectual property laws. Except for
          the limited rights granted in these Terms, we reserve all rights.
        </LegalParagraph>
        <LegalParagraph>
          Subject to these Terms, we grant you a limited, non-exclusive,
          non-transferable, revocable right to access and use the Service for
          your internal business purposes during your subscription. You may not
          sublicense, resell, or make the Service available to third parties
          except as permitted by these Terms.
        </LegalParagraph>
        <LegalParagraph>
          If you provide suggestions or feedback, you grant us a royalty-free
          right to use it to improve the Service without compensation or
          obligation to you. We will not identify you as the source without your
          permission.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "disclaimers",
    title: "11. Disclaimers",
    content: (
      <>
        <LegalParagraph>
          To the maximum extent permitted by law, the Service is provided
          &quot;as is&quot; and &quot;as available.&quot; Requo disclaims all
          warranties of any kind, whether express, implied, statutory, or
          otherwise, including implied warranties of merchantability, fitness for
          a particular purpose, title, and non-infringement.
        </LegalParagraph>
        <LegalParagraph>
          We do not warrant that the Service will meet your requirements, be
          uninterrupted, secure, or error-free, or produce any particular
          business result. Some jurisdictions do not allow the exclusion of
          certain warranties, so some of these exclusions may not apply to you.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "liability",
    title: "12. Limitation Of Liability",
    content: (
      <>
        <LegalParagraph>
          To the maximum extent permitted by law, Requo and its affiliates,
          officers, directors, employees, agents, suppliers, and licensors will
          not be liable for indirect, incidental, special, consequential,
          exemplary, or punitive damages, or for loss of profits, revenues,
          goodwill, data, or business opportunities, arising out of or relating
          to the Service or these Terms.
        </LegalParagraph>
        <LegalParagraph>
          To the maximum extent permitted by law, Requo&apos;s aggregate
          liability arising out of or relating to the Service or these Terms will
          not exceed the greater of (a) the total amount you paid to Requo for
          the Service during the twelve months preceding the event giving rise to
          the claim, or (b) one hundred U.S. dollars (US$100). If you have not
          paid any amounts to Requo, our total liability will not exceed US$100.
        </LegalParagraph>
        <LegalParagraph>
          Nothing in these Terms limits liability that cannot be limited by
          applicable law.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "indemnity",
    title: "13. Indemnity",
    content: (
      <>
        <LegalParagraph>
          You agree to defend, indemnify, and hold harmless Requo, its affiliates,
          and their respective officers, directors, employees, agents, suppliers,
          and licensors from claims, losses, liabilities, damages, judgments, and
          expenses (including reasonable attorneys&apos; fees) arising out of or
          related to your use of the Service, Your Content, your violation of
          these Terms, or your violation of law or the rights of another person
          or entity.
        </LegalParagraph>
        <LegalParagraph>
          We will notify you of a covered claim and may participate in the
          defense. You may not settle a claim in a way that admits our fault or
          imposes obligations on us without our prior written consent.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "governing-law",
    title: "14. Governing Law",
    content: (
      <>
        <LegalParagraph>
          These Terms and any dispute arising out of or relating to them or the
          Service will be governed by {legalConfig.governingLaw}, without regard
          to conflict of law principles.
        </LegalParagraph>
        <LegalParagraph>
          Any dispute, claim, or controversy arising out of or relating to these
          Terms or the Service will be brought exclusively in{" "}
          {legalConfig.venue}, and you consent to the personal jurisdiction and
          venue of those courts.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "changes-and-contact",
    title: "15. Changes And Contact",
    content: (
      <>
        <LegalParagraph>
          We may update these Terms from time to time. We will post the updated
          version on this page and update the effective date. If we make material
          changes, we will provide reasonable notice by email, in-product notice,
          or another reasonable method where required. By continuing to use the
          Service after the updated Terms take effect, you agree to the revised
          Terms. If you do not agree, stop using the Service and cancel your
          subscription.
        </LegalParagraph>
        <LegalParagraph>
          These Terms, together with the Privacy Policy, Refund Policy, and other
          policies referenced here, form the entire agreement between you and
          Requo regarding the Service, unless you have a separate written
          agreement with us. If any provision is found unenforceable, the
          remaining provisions will remain in effect. Our failure to enforce a
          provision is not a waiver.
        </LegalParagraph>
        <LegalParagraph>
          Questions about these Terms:{" "}
          <a href={`mailto:${legalConfig.supportEmail}`}>
            {legalConfig.supportEmail}
          </a>{" "}
          or{" "}
          <a href={`mailto:${legalConfig.privacyEmail}`}>
            {legalConfig.privacyEmail}
          </a>
          , or by mail at {legalConfig.address}.
        </LegalParagraph>
      </>
    ),
  },
];

export function TermsOfServicePage() {
  return (
    <LegalDocumentPage
      content={termsSections}
      effectiveDate={legalConfig.effectiveDate}
      title="Terms of Service"
    />
  );
}
