import { legalConfig } from "@/features/legal/config";
import {
  LegalDocumentPage,
  type LegalDocumentSection,
  LegalList,
  LegalParagraph,
  LegalSubheading,
} from "@/features/legal/components/legal-document-page";

const refundSections: LegalDocumentSection[] = [
  {
    id: "overview",
    title: "1. Overview",
    content: (
      <>
        <LegalParagraph>
          This Refund Policy explains the terms and conditions under which{" "}
          {legalConfig.companyName} (&quot;{legalConfig.companyName},&quot;
          &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) provides refunds
          for subscriptions purchased through{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={legalConfig.domain}
          >
            {legalConfig.domain}
          </a>
          .
        </LegalParagraph>
        <LegalParagraph>
          Subscription payments are processed by {legalConfig.paymentProvider},
          the merchant of record for {legalConfig.companyName}. There is no
          in-app refund flow: subscription changes, cancellations, and refunds
          are handled through the {legalConfig.paymentProvider} customer
          portal linked from your billing settings. By subscribing to a paid
          plan, you agree to the terms outlined in this Refund Policy and our
          Terms of Service.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "eligibility",
    title: "2. Refund Eligibility",
    content: (
      <>
        <LegalParagraph>
          {legalConfig.companyName} does not offer a fixed money-back
          guarantee. Refund requests are handled through the{" "}
          {legalConfig.paymentProvider} customer portal and are subject to{" "}
          {legalConfig.paymentProvider}&rsquo;s review and standard processing
          times.
        </LegalParagraph>
        <LegalParagraph>
          When a refund is granted, it is issued through{" "}
          {legalConfig.paymentProvider} to the original payment method used for
          the purchase. The time it takes to appear in your account depends on
          your payment provider or card issuer.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "requesting-refund",
    title: "3. How To Request A Refund",
    content: (
      <>
        <LegalParagraph>
          Request a refund through the {legalConfig.paymentProvider} customer
          portal linked from your billing settings:
        </LegalParagraph>
        <LegalList
          items={[
            "Open your business billing settings.",
            "Choose View billing details or Manage to open the Polar customer portal.",
            "Follow the portal steps for the payment you want refunded.",
          ]}
        />
        <LegalParagraph>
          If you need help, email{" "}
          <a
            className="text-foreground underline-offset-4 hover:underline"
            href={`mailto:${legalConfig.supportEmail}`}
          >
            {legalConfig.supportEmail}
          </a>{" "}
          with the email address on your account and the date of the payment.
        </LegalParagraph>
        <LegalParagraph>
          {legalConfig.paymentProvider} reviews each request. Processing times
          vary by provider and card issuer, and we cannot guarantee a specific
          timeline for delays outside our control.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "cancellation",
    title: "4. Subscription Cancellation",
    content: (
      <>
        <LegalParagraph>
          You can cancel your subscription at any time through the{" "}
          {legalConfig.paymentProvider} customer portal linked from your
          billing settings. Cancellation is separate from a refund and does
          not, by itself, issue money back.
        </LegalParagraph>
        <LegalSubheading>Access After Cancellation</LegalSubheading>
        <LegalParagraph>
          When you cancel a subscription, you keep paid features until the end
          of the current billing period. At the end of that period your
          business reverts to the free plan. If you also want the payment
          refunded, request it through the portal using the steps above.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "payment-provider",
    title: "5. Payment Provider",
    content: (
      <>
        <LegalParagraph>
          {legalConfig.companyName} uses {legalConfig.paymentProvider} as its
          merchant of record. USD is the base billing currency;{" "}
          {legalConfig.paymentProvider} may display a local-currency amount at
          checkout for convenience. Refunds are issued through{" "}
          {legalConfig.paymentProvider} and are subject to the provider&apos;s
          review and standard processing times.
        </LegalParagraph>
        <LegalParagraph>
          We will help with {legalConfig.paymentProvider} refund questions as
          quickly as possible, but we cannot guarantee specific processing
          times for delays introduced by the provider or your card issuer.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "exceptions",
    title: "6. Exceptions And Limitations",
    content: (
      <>
        <LegalParagraph>
          Cancelling a subscription stops future charges but does not, by
          itself, refund past payments. Before opening a payment dispute or
          chargeback with your provider or card issuer, please contact us so
          we can help.
        </LegalParagraph>
        <LegalSubheading>Abuse Prevention</LegalSubheading>
        <LegalParagraph>
          Accounts that violate our Terms of Service, submit fraudulent refund
          requests, or show patterns of subscription abuse may have refund
          requests declined and accounts suspended or terminated.
        </LegalParagraph>
      </>
    ),
  },
  {
    id: "contact",
    title: "7. Questions And Contact",
    content: (
      <>
        <LegalParagraph>
          If you have questions about this Refund Policy or need help with a
          refund request, please contact us:
        </LegalParagraph>
        <LegalList
          items={[
            <>
              Email:{" "}
              <a
                className="text-foreground underline-offset-4 hover:underline"
                href={`mailto:${legalConfig.supportEmail}`}
              >
                {legalConfig.supportEmail}
              </a>
            </>,
            <>Address: {legalConfig.address}</>,
          ]}
        />
        <LegalParagraph>
          We aim to respond to refund-related questions within 2-3 business
          days. For general privacy inquiries, you may also contact{" "}
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
];

export function RefundPolicyPage() {
  return (
    <LegalDocumentPage
      content={refundSections}
      effectiveDate={legalConfig.effectiveDate}
      title="Refund Policy"
    />
  );
}
