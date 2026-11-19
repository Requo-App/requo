import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PublicQuotePageRenderer } from "@/features/quotes/components/public-quote-page-renderer";
import { QuotePreview } from "@/features/quotes/components/quote-preview";
import { QuotePrintDocument } from "@/features/quotes/components/quote-print-document";
import { QuoteScopeList } from "@/features/quotes/components/quote-scope-list";
import type {
  DashboardQuoteDetail,
  PublicQuotePaymentSchedule,
  PublicQuoteView,
} from "@/features/quotes/types";

const scopeBlocks: PublicQuoteView["scopeBlocks"] = [
  {
    kind: "deliverables",
    content: { items: [{ label: "Design and install" }] },
  },
  {
    kind: "exclusions",
    content: { items: [{ label: "Electrical work" }] },
  },
  {
    kind: "assumptions",
    content: { items: [{ label: "Site access provided" }] },
  },
  {
    kind: "allowances",
    content: {
      items: [{ label: "Tile", brand: "Daltile", amountCents: 50_000 }],
    },
  },
  {
    kind: "revision_cap",
    content: {
      rounds: 2,
      overageCents: 7_500,
      consolidationRule: "One consolidated round",
      deemedApprovalDays: 5,
    },
  },
  {
    kind: "acceptance_criteria",
    content: {
      items: [
        {
          criterion: "Sign off on the proof",
          reviewer: "Alex Kim",
          responseDays: 5,
        },
      ],
    },
  },
  {
    kind: "usage_rights",
    content: {
      matrix: [{ media: "Web", term: "1 year", territory: "US" }],
      carveouts: ["Print"],
    },
  },
  {
    kind: "client_responsibilities",
    content: {
      items: [{ label: "Provide site access", due: "Before start" }],
    },
  },
  {
    kind: "timeline",
    content: {
      milestones: [{ label: "Kickoff", date: "May 1" }],
      note: "Weather permitting",
    },
  },
  {
    kind: "payment_schedule",
    content: { referenceSchedule: true },
  },
];

const paymentSchedule: PublicQuotePaymentSchedule = {
  version: 1,
  items: [
    {
      id: "item-1",
      label: "Deposit",
      category: "deposit",
      amountCents: 100_000,
      dueDate: null,
      dueCondition: "On acceptance",
    },
    {
      id: "item-2",
      label: "Balance",
      category: "balance",
      amountCents: 100_000,
      dueDate: "2099-06-01",
      dueCondition: null,
    },
  ],
};

function publicQuote(): PublicQuoteView {
  return {
    id: "quote-1",
    businessId: "business-1",
    token: "token-1",
    quoteNumber: "Q-1001",
    title: "Storefront refresh",
    businessName: "Foundry Labs",
    businessSlug: "foundry-labs",
    businessPlan: "pro",
    businessShortDescription: null,
    businessContactEmail: null,
    businessLogoStoragePath: null,
    customerName: "Taylor Nguyen",
    customerEmail: "taylor@example.com",
    customerContactMethod: "email",
    customerContactHandle: "taylor@example.com",
    currency: "USD",
    notes: null,
    terms: null,
    validUntil: "2099-12-31",
    version: 1,
    status: "sent",
    subtotalInCents: 200_000,
    discountInCents: 0,
    taxInCents: 0,
    taxLabel: null,
    totalInCents: 200_000,
    sentAt: new Date("2026-05-01T00:00:00.000Z"),
    acceptedAt: null,
    publicViewedAt: null,
    customerRespondedAt: null,
    customerResponseMessage: null,
    items: [
      {
        id: "line-1",
        description: "Window graphics",
        quantity: 1,
        unitPriceInCents: 200_000,
        lineTotalInCents: 200_000,
        position: 0,
      },
    ],
    scopeBlocks,
    paymentSchedule,
  };
}

function printQuote(): DashboardQuoteDetail {
  const quote = publicQuote();

  return {
    id: quote.id,
    businessId: quote.businessId,
    inquiryId: null,
    quoteNumber: quote.quoteNumber,
    publicToken: quote.token,
    title: quote.title,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    customerContactMethod: quote.customerContactMethod,
    customerContactHandle: quote.customerContactHandle,
    currency: quote.currency,
    notes: quote.notes,
    terms: quote.terms,
    subtotalInCents: quote.subtotalInCents,
    discountInCents: quote.discountInCents,
    taxInCents: quote.taxInCents,
    taxLabel: quote.taxLabel,
    totalInCents: quote.totalInCents,
    validUntil: quote.validUntil,
    version: quote.version,
    status: quote.status,
    archivedAt: null,
    voidedAt: null,
    sentAt: quote.sentAt,
    acceptedAt: null,
    publicViewedAt: null,
    customerRespondedAt: null,
    customerResponseMessage: null,
    autoFollowUpEnabled: false,
    autoFollowUpDelayDays: 0,
    autoFollowUpMaxAttempts: 0,
    autoFollowUpAttempts: 0,
    autoFollowUpLastSentAt: null,
    autoFollowUpStoppedAt: null,
    completedAt: null,
    canceledAt: null,
    cancellationReason: null,
    cancellationNote: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    items: quote.items,
    activities: [],
    linkedInquiry: null,
    reminders: [],
    aiReadiness: null,
    aiAcknowledgedAt: null,
  };
}

/**
 * The same block sections rendered by a surface, independent of its outer
 * page chrome. Each `QuoteScopeList` block is a `<section>` with an h3.
 */
function scopeSectionTexts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("section"))
    // Only the block sections themselves; outer quote/surface wrappers also
    // contain a descendant h3.
    .filter((section) => section.querySelector(":scope > h3"))
    .map((section) => section.textContent?.replace(/\s+/g, " ").trim());
}

afterEach(() => {
  cleanup();
});

describe("customer-visible scope rendering", () => {
  it("renders every scope kind with its customer-facing detail", () => {
    render(
      <QuoteScopeList
        blocks={scopeBlocks}
        currency="USD"
        paymentSchedule={paymentSchedule}
      />,
    );

    expect(screen.getByRole("heading", { name: "Included work" })).toBeInTheDocument();
    expect(screen.getByText("Design and install")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Not included" })).toBeInTheDocument();
    expect(screen.getByText("Electrical work")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assumptions" })).toBeInTheDocument();
    expect(screen.getByText("Site access provided")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Allowances" })).toBeInTheDocument();
    expect(screen.getByText(/Tile · Daltile/)).toBeInTheDocument();
    expect(screen.getByText("$500.00")).toBeInTheDocument();

    const revisions = screen.getByRole("heading", { name: "Revisions" }).parentElement!;
    expect(within(revisions).getByText("2 included revision rounds")).toBeInTheDocument();
    expect(within(revisions).getByText("Additional round: $75.00")).toBeInTheDocument();
    expect(within(revisions).getByText("One consolidated round")).toBeInTheDocument();
    expect(within(revisions).getByText("Approval response window: 5 days")).toBeInTheDocument();

    const acceptance = screen.getByRole("heading", {
      name: "Approval criteria",
    }).parentElement!;
    expect(
      within(acceptance).getByText(/reviewed by Alex Kim · 5 days to respond/),
    ).toBeInTheDocument();

    const usage = screen.getByRole("heading", { name: "Usage rights" }).parentElement!;
    expect(within(usage).getByText(/Web · 1 year · US/)).toBeInTheDocument();
    expect(within(usage).getByText("Exclusions: Print")).toBeInTheDocument();

    const responsibilities = screen.getByRole("heading", {
      name: "Customer responsibilities",
    }).parentElement!;
    expect(
      within(responsibilities).getByText(/Provide site access · Before start/),
    ).toBeInTheDocument();

    const timeline = screen.getByRole("heading", { name: "Timeline" }).parentElement!;
    expect(within(timeline).getByText(/Kickoff · May 1/)).toBeInTheDocument();
    expect(within(timeline).getByText("Weather permitting")).toBeInTheDocument();

    const schedule = screen.getByRole("heading", {
      name: "Payment schedule",
    }).parentElement!;
    expect(within(schedule).getByText(/Deposit · On acceptance/)).toBeInTheDocument();
    expect(within(schedule).getAllByText("$1,000.00")).toHaveLength(2);
    expect(within(schedule).getByText(/Balance · due 2099-06-01/)).toBeInTheDocument();
  });

  it("skips an empty timeline and a payment block with no schedule", () => {
    render(
      <QuoteScopeList
        blocks={[
          { kind: "timeline", content: { milestones: [], note: "" } },
          { kind: "payment_schedule", content: { referenceSchedule: true } },
        ]}
        currency="USD"
        paymentSchedule={null}
      />,
    );

    expect(screen.queryByText("Timeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Payment schedule")).not.toBeInTheDocument();
  });
});

describe("scope parity across customer surfaces", () => {
  it("renders identical scope content on the public page, preview, and print document", () => {
    const quote = publicQuote();

    const publicRender = render(
      <PublicQuotePageRenderer
        businessPlan="pro"
        hideHeader
        interactiveColumn={<div>Respond to this quote</div>}
        quote={quote}
      />,
    );
    const previewRender = render(
      <QuotePreview
        businessName={quote.businessName}
        customerEmail={quote.customerEmail}
        customerName={quote.customerName}
        discountInCents={quote.discountInCents}
        items={quote.items}
        paymentSchedule={quote.paymentSchedule}
        quoteNumber={quote.quoteNumber}
        scopeBlocks={quote.scopeBlocks}
        subtotalInCents={quote.subtotalInCents}
        taxInCents={quote.taxInCents}
        title={quote.title}
        totalInCents={quote.totalInCents}
        validUntil={quote.validUntil}
        currency={quote.currency}
      />,
    );
    const printRender = render(
      <QuotePrintDocument
        businessName={quote.businessName}
        paymentSchedule={quote.paymentSchedule}
        quote={printQuote()}
        scopeBlocks={quote.scopeBlocks}
      />,
    );

    const publicScope = scopeSectionTexts(publicRender.container);
    const previewScope = scopeSectionTexts(previewRender.container);
    const printScope = scopeSectionTexts(printRender.container);

    expect(publicScope).toHaveLength(scopeBlocks.length);
    expect(previewScope).toEqual(publicScope);
    expect(printScope).toEqual(publicScope);
  });
});
