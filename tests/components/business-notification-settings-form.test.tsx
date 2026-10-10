import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getExistingPushSubscriptionMock,
  getPushPermissionMock,
  isPushConfiguredForClientMock,
  isPushSupportedMock,
  removePushSubscriptionMock,
  savePushSubscriptionMock,
  subscribeToPushMock,
  toastErrorMock,
  toastSuccessMock,
} = vi.hoisted(() => ({
  getExistingPushSubscriptionMock: vi.fn(),
  getPushPermissionMock: vi.fn(),
  isPushConfiguredForClientMock: vi.fn(),
  isPushSupportedMock: vi.fn(),
  removePushSubscriptionMock: vi.fn(),
  savePushSubscriptionMock: vi.fn(),
  subscribeToPushMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/components/shared/notify", () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}));

vi.mock("@/features/notifications/push-client", () => ({
  getExistingPushSubscription: getExistingPushSubscriptionMock,
  getPushPermission: getPushPermissionMock,
  isPushConfiguredForClient: isPushConfiguredForClientMock,
  isPushSupported: isPushSupportedMock,
  removePushSubscription: removePushSubscriptionMock,
  savePushSubscription: savePushSubscriptionMock,
  subscribeToPush: subscribeToPushMock,
}));

import { BusinessNotificationSettingsForm } from "@/features/settings/components/business-notification-settings-form";

const pushSubscription = {
  endpoint: "https://push.example/subscription-1",
  toJSON: () => ({
    endpoint: "https://push.example/subscription-1",
    keys: {
      auth: "auth-secret",
      p256dh: "p256dh-key",
    },
  }),
} as unknown as PushSubscription;

const baseSettings = {
  notifyInAppOnNewInquiry: false,
  notifyInAppOnQuoteSent: false,
  notifyInAppOnQuoteResponse: false,
  notifyInAppOnMemberInviteResponse: false,
  notifyPushOnNewInquiry: false,
  notifyPushOnQuoteSent: false,
  notifyPushOnQuoteResponse: false,
  notifyPushOnMemberInviteResponse: false,
  notifyInAppOnFollowUpReminder: false,
  notifyInAppOnQuoteExpiring: false,
};

function renderForm(options?: { settings?: Partial<typeof baseSettings> }) {
  const submitted = {
    current: null as Record<string, FormDataEntryValue> | null,
  };
  const action = vi.fn(async (_state: unknown, formData: FormData) => {
    submitted.current = Object.fromEntries(formData.entries());
    return { success: "Notification settings saved." };
  });

  render(
    <BusinessNotificationSettingsForm
      action={action}
      businessId="biz_123"
      settings={{ ...baseSettings, ...options?.settings }}
    />,
  );

  return { action, submitted };
}

describe("BusinessNotificationSettingsForm", () => {
  beforeEach(() => {
    getExistingPushSubscriptionMock.mockReset();
    getPushPermissionMock.mockReset();
    isPushConfiguredForClientMock.mockReset();
    isPushSupportedMock.mockReset();
    removePushSubscriptionMock.mockReset();
    savePushSubscriptionMock.mockReset();
    subscribeToPushMock.mockReset();
    toastErrorMock.mockReset();
    toastSuccessMock.mockReset();

    getExistingPushSubscriptionMock.mockResolvedValue(null);
    getPushPermissionMock.mockReturnValue("granted");
    isPushConfiguredForClientMock.mockReturnValue(true);
    isPushSupportedMock.mockReturnValue(true);
    removePushSubscriptionMock.mockResolvedValue(true);
    savePushSubscriptionMock.mockResolvedValue(true);
    subscribeToPushMock.mockResolvedValue(pushSubscription);
  });

  it("subscribes this browser and auto-saves when enabling a push toggle", async () => {
    const user = userEvent.setup();
    const { action, submitted } = renderForm();

    // Push toggles render directly (same Field-row pattern as quote settings)
    const pushSwitch = screen.getByRole("switch", {
      name: "New inquiry received push",
    });
    await user.click(pushSwitch);

    await waitFor(() =>
      expect(subscribeToPushMock).toHaveBeenCalledTimes(1),
    );
    expect(savePushSubscriptionMock).toHaveBeenCalledWith(
      pushSubscription,
      "biz_123",
    );

    // Auto-save fires without clicking a save button
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(submitted.current?.notifyPushOnNewInquiry).toBe("on");
  });

  it("does not enable a push channel when browser registration fails", async () => {
    const user = userEvent.setup();
    renderForm();

    subscribeToPushMock.mockResolvedValue(null);

    const pushSwitch = screen.getByRole("switch", {
      name: "New inquiry received push",
    });
    await user.click(pushSwitch);

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        "Could not create a push subscription. Try refreshing the page.",
      ),
    );

    // Switch should remain unchecked since registration failed
    expect(pushSwitch).not.toBeChecked();
  });

  it("removes this browser subscription when the last push channel is disabled", async () => {
    const user = userEvent.setup();

    getExistingPushSubscriptionMock.mockResolvedValue(pushSubscription);

    const { action } = renderForm({
      settings: {
        notifyPushOnNewInquiry: true,
      },
    });

    // The push switch renders checked since push is enabled
    const pushSwitch = screen.getByRole("switch", {
      name: "New inquiry received push",
    });
    expect(pushSwitch).toBeChecked();
    await user.click(pushSwitch);

    // Auto-save fires
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));

    // Push subscription should be removed since no push channels remain
    await waitFor(() =>
      expect(removePushSubscriptionMock).toHaveBeenCalledWith(
        pushSubscription.endpoint,
        "biz_123",
      ),
    );
  });
});
