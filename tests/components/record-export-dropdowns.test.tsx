import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-optimistic-mutation", () => ({
  useOptimisticMutation: () => ({
    runMutation: vi.fn(),
    isPendingKey: () => false,
  }),
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { InquiryManageDropdown } from "@/features/inquiries/components/inquiry-manage-dropdown";
import { InvoiceManageDropdown } from "@/features/invoices/components/invoice-manage-dropdown";
import { QuoteManageDropdown } from "@/features/quotes/components/quote-manage-dropdown";

const inquiryAction = async () => ({});
const quoteAction = async () => ({});
const invoiceAction = async () => ({});

const pdfHref = "/businesses/acme/inquiries/inquiry-1/export?format=pdf";
const pngHref = "/businesses/acme/inquiries/inquiry-1/export?format=png";

afterEach(cleanup);

async function expectExportLinks() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "More actions" }));

  expect(await screen.findByLabelText("Export PDF")).toHaveAttribute(
    "href",
    pdfHref,
  );
  expect(screen.getByLabelText("Export PNG")).toHaveAttribute("href", pngHref);
  expect(screen.queryByText("Export (Pro feature)")).not.toBeInTheDocument();
}

describe("record export dropdowns", () => {
  it("shows inquiry PDF and PNG exports without a plan gate", async () => {
    render(
      <InquiryManageDropdown
        workflowStatus="new"
        recordState="active"
        businessInquiryListHref="/businesses/acme/inquiries"
        statusAction={inquiryAction}
        archiveAction={inquiryAction}
        unarchiveAction={inquiryAction}
        deleteAction={inquiryAction}
        pdfHref={pdfHref}
        pngHref={pngHref}
      />,
    );

    await expectExportLinks();
  });

  it("shows quote PDF and PNG exports without a plan gate", async () => {
    render(
      <QuoteManageDropdown
        archiveAction={quoteAction}
        businessQuoteListHref="/businesses/acme/quotes"
        deleteDraftAction={quoteAction}
        isArchived={false}
        restoreArchivedAction={quoteAction}
        status="sent"
        voidAction={quoteAction}
        pdfHref={pdfHref}
        pngHref={pngHref}
      />,
    );

    await expectExportLinks();
  });

  it("shows invoice PDF and PNG exports without a plan gate", async () => {
    render(
      <InvoiceManageDropdown
        editHref={null}
        printHref={null}
        canVoid={false}
        voidAction={invoiceAction}
        pdfHref={pdfHref}
        pngHref={pngHref}
      />,
    );

    await expectExportLinks();
  });
});
