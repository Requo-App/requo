import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  checkUsageAllowanceMock,
  getBusinessMessagingSettingsMock,
  getBusinessOwnerEmailsMock,
  getResendFromEmailConfigurationErrorMock,
} = vi.hoisted(() => ({
  checkUsageAllowanceMock: vi.fn(),
  getBusinessMessagingSettingsMock: vi.fn(),
  getBusinessOwnerEmailsMock: vi.fn(),
  getResendFromEmailConfigurationErrorMock: vi.fn(),
}));

const QUOTA_KEYS = {
  dailyKey: "requoQuoteEmailsPerDay",
  monthlyKey: "requoQuoteEmailsPerMonth",
} as const;

const BASE_INPUT = {
  businessId: "biz_1",
  plan: "pro",
  ...QUOTA_KEYS,
} as const;

const SETTINGS = {
  defaultEmailSignature: "Best",
  contactEmail: "owner@example.com",
};

async function loadHelpers(envOverrides: Record<string, unknown> = {}) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({
    isEmailConfigured: true,
    ...envOverrides,
  }));
  vi.doMock("@/lib/plans/usage", () => ({
    checkUsageAllowance: checkUsageAllowanceMock,
  }));
  vi.doMock("@/lib/db/business-access", () => ({
    getBusinessMessagingSettings: getBusinessMessagingSettingsMock,
    getBusinessOwnerEmails: getBusinessOwnerEmailsMock,
  }));
  vi.doMock("@/lib/resend/client", () => ({
    getResendFromEmailConfigurationError:
      getResendFromEmailConfigurationErrorMock,
  }));

  return import("@/lib/email/send-prerequisites");
}

describe("checkDocumentSendQuota", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkUsageAllowanceMock.mockResolvedValue({ allowed: true });
  });

  it("checks the daily and monthly keys together and allows when both pass", async () => {
    const { checkDocumentSendQuota } = await loadHelpers();

    await expect(
      checkDocumentSendQuota({ ...BASE_INPUT }),
    ).resolves.toBe(true);
    expect(checkUsageAllowanceMock).toHaveBeenCalledTimes(2);
    expect(checkUsageAllowanceMock).toHaveBeenCalledWith(
      "biz_1",
      "pro",
      "requoQuoteEmailsPerDay",
    );
    expect(checkUsageAllowanceMock).toHaveBeenCalledWith(
      "biz_1",
      "pro",
      "requoQuoteEmailsPerMonth",
    );
  });

  it("blocks when the daily allowance is exhausted", async () => {
    checkUsageAllowanceMock.mockImplementation(async (_bid, _plan, key) => ({
      allowed: key !== "requoQuoteEmailsPerDay",
    }));
    const { checkDocumentSendQuota } = await loadHelpers();

    await expect(checkDocumentSendQuota({ ...BASE_INPUT })).resolves.toBe(
      false,
    );
  });

  it("blocks when the monthly allowance is exhausted", async () => {
    checkUsageAllowanceMock.mockImplementation(async (_bid, _plan, key) => ({
      allowed: key !== "requoQuoteEmailsPerMonth",
    }));
    const { checkDocumentSendQuota } = await loadHelpers();

    await expect(checkDocumentSendQuota({ ...BASE_INPUT })).resolves.toBe(
      false,
    );
  });
});

describe("loadDocumentMessagingContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBusinessMessagingSettingsMock.mockResolvedValue(SETTINGS);
    getBusinessOwnerEmailsMock.mockResolvedValue(["owner@example.com"]);
  });

  it("returns settings and owner emails for a loaded business", async () => {
    const { loadDocumentMessagingContext } = await loadHelpers();

    await expect(loadDocumentMessagingContext("biz_1")).resolves.toEqual({
      settings: SETTINGS,
      ownerEmails: ["owner@example.com"],
    });
    expect(getBusinessMessagingSettingsMock).toHaveBeenCalledWith("biz_1");
    expect(getBusinessOwnerEmailsMock).toHaveBeenCalledWith("biz_1");
  });

  it("returns null when messaging settings are missing", async () => {
    getBusinessMessagingSettingsMock.mockResolvedValue(undefined);
    const { loadDocumentMessagingContext } = await loadHelpers();

    await expect(loadDocumentMessagingContext("biz_1")).resolves.toBeNull();
    expect(getBusinessOwnerEmailsMock).not.toHaveBeenCalled();
  });
});

describe("checkDocumentSendConfiguration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getResendFromEmailConfigurationErrorMock.mockReturnValue(null);
  });

  it("allows sending when email is configured", async () => {
    const { checkDocumentSendConfiguration } = await loadHelpers();

    expect(checkDocumentSendConfiguration("unconfigured!")).toBeNull();
  });

  it("returns the caller message when email is not configured", async () => {
    const { checkDocumentSendConfiguration } = await loadHelpers({
      isEmailConfigured: false,
    });

    expect(checkDocumentSendConfiguration("unconfigured!")).toBe(
      "unconfigured!",
    );
    expect(
      getResendFromEmailConfigurationErrorMock,
    ).not.toHaveBeenCalled();
  });

  it("returns the sender configuration error when present", async () => {
    getResendFromEmailConfigurationErrorMock.mockReturnValue("bad sender");
    const { checkDocumentSendConfiguration } = await loadHelpers();

    expect(checkDocumentSendConfiguration("unconfigured!")).toBe("bad sender");
  });
});
