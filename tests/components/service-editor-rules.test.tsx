import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

/**
 * Component tests for the service editor's server-enforced rules.
 *
 * The editor surfaces the server's rules before the owner submits anything:
 * a manager cannot publish, an unpublished service cannot become the default,
 * and the danger zone disables the actions the server would refuse.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { BusinessInquiryFormDangerZone } from "@/features/settings/components/business-inquiry-form-danger-zone";
import { BusinessInquiryFormManageCard } from "@/features/settings/components/business-inquiry-form-manage-card";
import type { BusinessInquiryFormDangerActionState } from "@/features/settings/types";

const noopAction = async (
  state: BusinessInquiryFormDangerActionState,
): Promise<BusinessInquiryFormDangerActionState> => state;

const noopFormsAction = async (state: {
  error?: string;
  success?: string;
}): Promise<{ error?: string; success?: string }> => state;

describe("service danger zone", () => {
  it("enables archive and delete for a normal service", () => {
    render(
      <BusinessInquiryFormDangerZone
        activeFormCount={3}
        archiveAction={noopAction}
        deleteAction={noopAction}
        formId="form-1"
        inquiryListHref="/acme/services"
        isDefault={false}
        submittedInquiryCount={0}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Archive service" }),
    ).toBeEnabled();
    expect(screen.getByRole("button", { name: "Delete service" })).toBeEnabled();
  });

  it("disables archive for the default service and explains why", () => {
    render(
      <BusinessInquiryFormDangerZone
        activeFormCount={3}
        archiveAction={noopAction}
        deleteAction={noopAction}
        formId="form-1"
        inquiryListHref="/acme/services"
        isDefault
        submittedInquiryCount={0}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Archive service" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Set another service as default before archiving this one.",
      ),
    ).toBeInTheDocument();
  });

  it("disables archive for the last active service", () => {
    render(
      <BusinessInquiryFormDangerZone
        activeFormCount={1}
        archiveAction={noopAction}
        deleteAction={noopAction}
        formId="form-1"
        inquiryListHref="/acme/services"
        isDefault={false}
        submittedInquiryCount={0}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Archive service" }),
    ).toBeDisabled();
    expect(
      screen.getByText("Keep at least one active service."),
    ).toBeInTheDocument();
  });

  it("disables delete for a service that still has inquiries", () => {
    render(
      <BusinessInquiryFormDangerZone
        activeFormCount={3}
        archiveAction={noopAction}
        deleteAction={noopAction}
        formId="form-1"
        inquiryListHref="/acme/services"
        isDefault={false}
        submittedInquiryCount={4}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete service" })).toBeDisabled();
    expect(
      screen.getByText("This service still has inquiries. Archive it instead."),
    ).toBeInTheDocument();
  });

  it("disables delete for the last active service", () => {
    render(
      <BusinessInquiryFormDangerZone
        activeFormCount={1}
        archiveAction={noopAction}
        deleteAction={noopAction}
        formId="form-1"
        inquiryListHref="/acme/services"
        isDefault={false}
        submittedInquiryCount={0}
      />,
    );

    expect(screen.getByRole("button", { name: "Delete service" })).toBeDisabled();
    expect(
      screen.getByText(
        "Create another service before deleting this one.",
      ),
    ).toBeInTheDocument();
  });
});

describe("service publishing card", () => {
  it("tells a non-owner that only the owner can publish", () => {
    render(
      <BusinessInquiryFormManageCard
        canPublish={false}
        duplicateAction={noopFormsAction}
        formId="form-1"
        isDefault={false}
        isPublicInquiryEnabled={false}
        setDefaultAction={noopFormsAction}
        togglePublicAction={noopFormsAction}
      />,
    );

    expect(
      screen.getByText("Only the business owner can publish a service."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish service" }),
    ).not.toBeInTheDocument();
  });

  it("offers publish to an owner", () => {
    render(
      <BusinessInquiryFormManageCard
        canPublish
        duplicateAction={noopFormsAction}
        formId="form-1"
        isDefault={false}
        isPublicInquiryEnabled={false}
        setDefaultAction={noopFormsAction}
        togglePublicAction={noopFormsAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Publish service" }),
    ).toBeInTheDocument();
  });

  it("refuses to offer set-as-default for an unpublished service", () => {
    render(
      <BusinessInquiryFormManageCard
        canPublish
        duplicateAction={noopFormsAction}
        formId="form-1"
        isDefault={false}
        isPublicInquiryEnabled={false}
        setDefaultAction={noopFormsAction}
        togglePublicAction={noopFormsAction}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Set as default" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Publish this service before making it the default."),
    ).toBeInTheDocument();
  });

  it("offers set-as-default for a published service", () => {
    render(
      <BusinessInquiryFormManageCard
        canPublish
        duplicateAction={noopFormsAction}
        formId="form-1"
        isDefault={false}
        isPublicInquiryEnabled
        setDefaultAction={noopFormsAction}
        togglePublicAction={noopFormsAction}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Set as default" }),
    ).toBeInTheDocument();
  });
});
