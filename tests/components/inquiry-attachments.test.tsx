import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/notify", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { toast } from "@/components/shared/notify";
import { PublicInquiryForm } from "@/features/inquiries/components/public-inquiry-form";
import { ManualInquiryEditor } from "@/features/inquiries/components/manual-inquiry-editor";
import { createInquiryFormConfigDefaults } from "@/features/inquiries/form-config";
import { createInquiryPageConfigDefaults } from "@/features/inquiries/page-config";
import type { PublicInquiryBusiness } from "@/features/inquiries/types";

const business: PublicInquiryBusiness = {
  id: "business-1", name: "Test business", slug: "test-business", plan: "free",
  businessType: "general_project_services", shortDescription: null, logoUrl: null,
  form: { id: "form-1", name: "General", slug: "general", businessType: "general_project_services", isDefault: true, publicInquiryEnabled: true },
  inquiryFormConfig: createInquiryFormConfigDefaults(),
  inquiryPageConfig: createInquiryPageConfigDefaults({ businessName: "Test business" }),
};

const signedUpload = { signedUrl: "http://localhost/upload", token: "signed-token", fileName: "plan.pdf", size: 15 };
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn<typeof fetch>();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderForm(kind: "public" | "manual") {
  const action = vi.fn().mockResolvedValue({});
  const user = userEvent.setup({ applyAccept: false });
  const { container } = render(kind === "public" ? <PublicInquiryForm action={action} business={business} /> : (
    <ManualInquiryEditor action={action} businessName={business.name} businessSlug={business.slug}
      services={[{ ...business.form, inquiryFormConfig: business.inquiryFormConfig }]}
      initialServiceSlug={business.form.slug} uploadHelpText="Upload a file" />
  ));
  await user.type(container.querySelector<HTMLInputElement>('[name="customerName"]')!, "Taylor Nguyen");
  await user.type(container.querySelector<HTMLInputElement>('[name="customerEmail"]')!, "taylor@example.com");
  await user.type(container.querySelector<HTMLTextAreaElement>('[name="details"]')!, "Need a new roof with a detailed quote.");
  const submit = screen.getByRole("button", { name: kind === "public" ? "Send" : "Create" });
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  return { user, container, action, submit, input };
}

describe.each(["public", "manual"] as const)("%s inquiry attachment flow", (kind) => {
  it("blocks submission until both upload steps finish and the token is populated", async () => {
    let finishRequest!: (response: Response) => void;
    let finishUpload!: (response: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((resolve) => { finishRequest = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { finishUpload = resolve; }));
    const { user, input, submit, container, action } = await renderForm(kind);
    expect(submit).toBeEnabled();
    await user.upload(input, new File(["%PDF-1.7 sample"], "plan.pdf", { type: "application/pdf" }));
    expect(submit).toBeDisabled();
    fireEvent.submit(container.querySelector("form")!);
    expect(action).not.toHaveBeenCalled();
    await act(async () => finishRequest(Response.json(signedUpload)));
    expect(submit).toBeDisabled();
    expect(container.querySelector<HTMLInputElement>('[name="attachment"]')!.value).toBe("");
    await act(async () => finishUpload(new Response(null, { status: 200 })));
    expect(submit).toBeEnabled();
    expect(container.querySelector<HTMLInputElement>('[name="attachment"]')!.value).toBe("signed-token");
  });

  it.each(["request", "storage", "network"])("shows %s failures and lets the user remove the rejected upload", async (failure) => {
    if (failure === "request") fetchMock.mockResolvedValueOnce(Response.json({ error: "Upload a PDF, common document file, or image." }, { status: 400 }));
    if (failure === "storage") fetchMock.mockResolvedValueOnce(Response.json(signedUpload)).mockResolvedValueOnce(new Response(null, { status: 500 }));
    if (failure === "network") fetchMock.mockRejectedValueOnce(new Error("offline"));
    const { user, input, submit } = await renderForm(kind);
    await user.upload(input, new File(["sample"], "plan.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Upload failed")).toBeVisible();
    expect(toast.error).toHaveBeenCalledWith(failure === "request" ? "Upload a PDF, common document file, or image." : "That file could not be uploaded. Try again.");
    expect(submit).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByText("Upload failed")).not.toBeInTheDocument();
    expect(submit).toBeEnabled();
    expect(input.value).toBe("");
  });
});
