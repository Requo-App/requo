import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/shared/notify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => ({ scheduleRefresh: vi.fn() }),
}));
vi.mock("@/features/settings/components/business-inquiry-form-form", () => ({
  BusinessInquiryFormForm: () => null,
}));
vi.mock("@/features/settings/components/business-inquiry-preview-overlay", () => ({
  BusinessInquiryPreviewOverlay: () => null,
}));

import { BusinessInquiryFormEditorTabs } from "@/features/settings/components/business-inquiry-form-editor-tabs";
import { createInquiryFormPreset } from "@/features/inquiries/inquiry-forms";
import type { BusinessInquiryFormEditorView } from "@/features/settings/types";

afterEach(cleanup);

it("preserves unsaved page edits when publication changes, then refreshes saved page changes", async () => {
  const user = userEvent.setup();
  const preset = createInquiryFormPreset({
    businessName: "Acme",
    businessType: "general_project_services",
  });
  const settings: BusinessInquiryFormEditorView = {
    id: "business-1",
    name: "Acme",
    slug: "acme",
    plan: "pro",
    formId: "form-1",
    formName: "Original service",
    formSlug: "original-service",
    businessType: preset.businessType,
    publicInquiryEnabled: true,
    isDefault: false,
    inquiryFormConfig: preset.inquiryFormConfig,
    inquiryPageConfig: preset.inquiryPageConfig,
    shortDescription: null,
    logoStoragePath: null,
    activeFormCount: 2,
    submittedInquiryCount: 0,
    updatedAt: new Date("2026-01-01"),
  };
  const action = async () => ({});
  const props = {
    settings,
    logoPreviewUrl: null,
    generalSettingsHref: null,
    settingsHref: "/acme/settings",
    previewHref: "/acme/services/original-service/preview",
    publicInquiryHref: "/inquire/acme/original-service",
    inquiryListHref: "/acme/services",
    isPublicLive: true,
    applyPresetAction: action,
    saveFormAction: action,
    updatePageAction: action,
    duplicateAction: action,
    setDefaultAction: action,
    togglePublicAction: action,
    archiveAction: action,
    deleteAction: action,
  };
  const { rerender } = render(<BusinessInquiryFormEditorTabs {...props} />);
  const name = screen.getByRole("textbox", { name: "Service name" });
  await user.clear(name);
  await user.type(name, "Unsaved service name");

  rerender(<BusinessInquiryFormEditorTabs {...props} settings={{ ...settings, publicInquiryEnabled: false }} />);

  expect(screen.getByRole("textbox", { name: "Service name" })).toHaveValue("Unsaved service name");

  rerender(<BusinessInquiryFormEditorTabs {...props} settings={{ ...settings, formName: "Saved service name" }} />);

  expect(screen.getByRole("textbox", { name: "Service name" })).toHaveValue("Saved service name");
});
