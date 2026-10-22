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
vi.mock("@/features/settings/components/service-form", () => ({
  ServiceForm: () => null,
}));
vi.mock("@/features/settings/components/service-preview-overlay", () => ({
  ServicePreviewOverlay: () => null,
}));

import { ServiceEditorTabs } from "@/features/settings/components/service-editor-tabs";
import { createServicePreset } from "@/features/inquiries/service-presets";
import type { ServiceEditorView } from "@/features/settings/types";

afterEach(cleanup);

it("preserves unsaved page edits when publication changes, then refreshes saved page changes", async () => {
  const user = userEvent.setup();
  const preset = createServicePreset({
    businessName: "Acme",
    businessType: "general_project_services",
  });
  const settings: ServiceEditorView = {
    id: "business-1",
    name: "Acme",
    slug: "acme",
    plan: "pro",
    serviceId: "form-1",
    serviceName: "Original service",
    serviceSlug: "original-service",
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
  const { rerender } = render(<ServiceEditorTabs {...props} />);
  const name = screen.getByRole("textbox", { name: "Service name" });
  await user.clear(name);
  await user.type(name, "Unsaved service name");

  rerender(<ServiceEditorTabs {...props} settings={{ ...settings, publicInquiryEnabled: false }} />);

  expect(screen.getByRole("textbox", { name: "Service name" })).toHaveValue("Unsaved service name");

  rerender(<ServiceEditorTabs {...props} settings={{ ...settings, serviceName: "Saved service name" }} />);

  expect(screen.getByRole("textbox", { name: "Service name" })).toHaveValue("Saved service name");
});
