"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  getExistingPushSubscription,
  getPushPermission,
  isPushConfiguredForClient,
  isPushSupported,
  removePushSubscription,
  savePushSubscription,
  subscribeToPush,
} from "@/features/notifications/push-client";
import { GeneralSettingsSection } from "@/features/settings/components/business-settings-form/section";
import type {
  BusinessNotificationSettingsActionState,
  BusinessSettingsView,
} from "@/features/settings/types";

/* ── Notification toggle config ─────────────────────────────────────────── */

type NotificationChannel = "inApp" | "push";

type NotificationToggleConfig = {
  id: string;
  label: string;
  description: string;
  channel: NotificationChannel;
  fieldKey: NotificationFieldKey;
};

const inAppToggles: NotificationToggleConfig[] = [
  {
    id: "newInquiry",
    label: "New inquiry received",
    description: "A customer submits an inquiry form.",
    channel: "inApp",
    fieldKey: "notifyInAppOnNewInquiry",
  },
  {
    id: "followUpReminder",
    label: "Follow-up reminder",
    description: "An inquiry hasn't had a response in a while.",
    channel: "inApp",
    fieldKey: "notifyInAppOnFollowUpReminder",
  },
  {
    id: "quoteSent",
    label: "Quote sent",
    description: "A quote is sent to a customer.",
    channel: "inApp",
    fieldKey: "notifyInAppOnQuoteSent",
  },
  {
    id: "quoteResponse",
    label: "Quote response",
    description: "A customer accepts or declines a quote.",
    channel: "inApp",
    fieldKey: "notifyInAppOnQuoteResponse",
  },
  {
    id: "quoteExpiring",
    label: "Quote expiring",
    description: "A sent quote is about to expire.",
    channel: "inApp",
    fieldKey: "notifyInAppOnQuoteExpiring",
  },
  {
    id: "memberInviteResponse",
    label: "Member invite response",
    description: "A team member accepts or declines an invite.",
    channel: "inApp",
    fieldKey: "notifyInAppOnMemberInviteResponse",
  },
];

const pushToggles: NotificationToggleConfig[] = [
  {
    id: "newInquiry",
    label: "New inquiry received",
    description: "A customer submits an inquiry form.",
    channel: "push",
    fieldKey: "notifyPushOnNewInquiry",
  },
  {
    id: "quoteSent",
    label: "Quote sent",
    description: "A quote is sent to a customer.",
    channel: "push",
    fieldKey: "notifyPushOnQuoteSent",
  },
  {
    id: "quoteResponse",
    label: "Quote response",
    description: "A customer accepts or declines a quote.",
    channel: "push",
    fieldKey: "notifyPushOnQuoteResponse",
  },
  {
    id: "memberInviteResponse",
    label: "Member invite response",
    description: "A team member accepts or declines an invite.",
    channel: "push",
    fieldKey: "notifyPushOnMemberInviteResponse",
  },
];

/* ── All field keys ──────────────────────────────────────────────────────── */

type NotificationFieldKey =
  | "notifyInAppOnNewInquiry"
  | "notifyInAppOnQuoteSent"
  | "notifyInAppOnQuoteResponse"
  | "notifyInAppOnMemberInviteResponse"
  | "notifyPushOnNewInquiry"
  | "notifyPushOnQuoteSent"
  | "notifyPushOnQuoteResponse"
  | "notifyPushOnMemberInviteResponse"
  | "notifyInAppOnFollowUpReminder"
  | "notifyInAppOnQuoteExpiring";

const allFieldKeys: NotificationFieldKey[] = [
  "notifyInAppOnNewInquiry",
  "notifyInAppOnQuoteSent",
  "notifyInAppOnQuoteResponse",
  "notifyInAppOnMemberInviteResponse",
  "notifyPushOnNewInquiry",
  "notifyPushOnQuoteSent",
  "notifyPushOnQuoteResponse",
  "notifyPushOnMemberInviteResponse",
  "notifyInAppOnFollowUpReminder",
  "notifyInAppOnQuoteExpiring",
];

const pushFieldKeys = [
  "notifyPushOnNewInquiry",
  "notifyPushOnQuoteSent",
  "notifyPushOnQuoteResponse",
  "notifyPushOnMemberInviteResponse",
] satisfies NotificationFieldKey[];

type PushSetupState =
  | "checking"
  | "ready"
  | "needs-enable"
  | "unsupported"
  | "blocked"
  | "not-configured";

function isPushFieldKey(
  fieldKey: NotificationFieldKey,
): fieldKey is (typeof pushFieldKeys)[number] {
  return (pushFieldKeys as readonly NotificationFieldKey[]).includes(fieldKey);
}

/* ── Props ───────────────────────────────────────────────────────────────── */

type BusinessNotificationSettingsFormProps = {
  action: (
    state: BusinessNotificationSettingsActionState,
    formData: FormData,
  ) => Promise<BusinessNotificationSettingsActionState>;
  sendTestPushAction?: () => Promise<{ success?: string; error?: string }>;
  businessId: string;
  settings: Pick<BusinessSettingsView, NotificationFieldKey>;
};

/* ── Component ───────────────────────────────────────────────────────────── */

export function BusinessNotificationSettingsForm({
  action,
  sendTestPushAction,
  businessId,
  settings,
}: BusinessNotificationSettingsFormProps) {
  const [values, setValues] = useState<Record<NotificationFieldKey, boolean>>(
    () => {
      const initial = {} as Record<NotificationFieldKey, boolean>;
      for (const key of allFieldKeys) {
        initial[key] = settings[key];
      }
      return initial;
    },
  );
  const [pushSetupState, setPushSetupState] =
    useState<PushSetupState>("checking");
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null);
  const [isEnablingBrowserPush, setIsEnablingBrowserPush] = useState(false);
  const [isSendingTestPush, setIsSendingTestPush] = useState(false);
  const [_isSaving, startTransition] = useTransition();
  const valuesRef = useRef(values);
  valuesRef.current = values;

  const selectedPushCount = pushFieldKeys.filter((key) => values[key]).length;

  const removePushForBusiness = useCallback(
    async (endpoint?: string | null) => {
      const existingEndpoint =
        endpoint ??
        pushEndpoint ??
        (await getExistingPushSubscription())?.endpoint;

      if (!existingEndpoint) {
        return;
      }

      await removePushSubscription(existingEndpoint, businessId);
    },
    [businessId, pushEndpoint],
  );

  const refreshPushSetupState = useCallback(async () => {
    if (!isPushConfiguredForClient()) {
      setPushSetupState("not-configured");
      setPushEndpoint(null);
      return;
    }

    if (!isPushSupported()) {
      setPushSetupState("unsupported");
      setPushEndpoint(null);
      return;
    }

    const permission = getPushPermission();

    if (permission === "denied") {
      setPushSetupState("blocked");
      setPushEndpoint(null);
      return;
    }

    if (permission !== "granted") {
      setPushSetupState("needs-enable");
      setPushEndpoint(null);
      return;
    }

    const subscription = await getExistingPushSubscription();

    if (!subscription) {
      setPushSetupState("needs-enable");
      setPushEndpoint(null);
      return;
    }

    if (selectedPushCount > 0) {
      const saved = await savePushSubscription(subscription, businessId);

      if (!saved) {
        setPushSetupState("needs-enable");
        setPushEndpoint(null);
        return;
      }
    }

    setPushEndpoint(subscription.endpoint);
    setPushSetupState("ready");
  }, [businessId, selectedPushCount]);

  useEffect(() => {
    let isCancelled = false;

    async function refresh() {
      await refreshPushSetupState();
      if (isCancelled) return;
    }

    void refresh();
    return () => { isCancelled = true; };
  }, [refreshPushSetupState]);

  // Auto-save: submit current values to server action
  function saveValues(nextValues: Record<NotificationFieldKey, boolean>) {
    startTransition(async () => {
      const formData = new FormData();
      for (const key of allFieldKeys) {
        formData.set(key, nextValues[key] ? "on" : "off");
      }

      const result = await action({}, formData);

      if (result.error) {
        toast.error(result.error);
      }

      // If all push disabled, clean up subscription
      const nextPushCount = pushFieldKeys.filter((k) => nextValues[k]).length;
      if (nextPushCount === 0) {
        void removePushForBusiness();
      }
    });
  }

  async function enablePushForBrowser(): Promise<boolean> {
    if (!isPushConfiguredForClient()) {
      setPushSetupState("not-configured");
      toast.error("Push notifications are not configured for this environment.");
      return false;
    }

    if (!isPushSupported()) {
      setPushSetupState("unsupported");
      toast.error("This browser does not support push notifications.");
      return false;
    }

    const currentPermission = getPushPermission();

    if (currentPermission === "denied") {
      setPushSetupState("blocked");
      toast.error("Browser notifications are blocked. Allow them in browser settings first.");
      return false;
    }

    setIsEnablingBrowserPush(true);

    try {
      const subscription = await subscribeToPush();

      if (!subscription) {
        setPushSetupState("needs-enable");
        toast.error(
          currentPermission === "default"
            ? "Notification permission was not granted."
            : "Could not create a push subscription. Try refreshing the page.",
        );
        return false;
      }

      const saved = await savePushSubscription(subscription, businessId);

      if (!saved) {
        setPushSetupState("needs-enable");
        toast.error("We could not save this browser for push notifications.");
        return false;
      }

      setPushEndpoint(subscription.endpoint);
      setPushSetupState("ready");
      if (currentPermission === "default") {
        toast.success("Push notifications enabled for this browser.");
      }
      return true;
    } finally {
      setIsEnablingBrowserPush(false);
    }
  }

  async function handleToggle(
    fieldKey: NotificationFieldKey,
    nextValue: boolean,
  ) {
    // For push fields being enabled, always ensure a fresh subscription
    if (isPushFieldKey(fieldKey) && nextValue) {
      const enabled = await enablePushForBrowser();
      if (!enabled) return;
    }

    const nextValues = { ...valuesRef.current, [fieldKey]: nextValue };
    setValues(nextValues);
    saveValues(nextValues);
  }

  async function handleSendTestPush() {
    if (!sendTestPushAction) return;

    setIsSendingTestPush(true);

    try {
      const result = await sendTestPushAction();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      if (result.success) {
        toast.success(result.success);
      }
    } catch {
      toast.error("We couldn't send the test notification right now.");
    } finally {
      setIsSendingTestPush(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-10">
      <GeneralSettingsSection
        title="In-app notifications"
        description="Shown in the notification bell on your dashboard."
      >
        <div className="flex flex-col gap-5">
          {inAppToggles.map((toggle) => (
            <NotificationToggleRow
              key={toggle.fieldKey}
              toggle={toggle}
              checked={values[toggle.fieldKey]}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </GeneralSettingsSection>

      <GeneralSettingsSection
        title="Push notifications"
        description="Sent to browsers where you've enabled push notifications."
      >
        <div className="flex flex-col gap-5">
          <PushBrowserStatus
            busy={isEnablingBrowserPush}
            isSendingTest={isSendingTestPush}
            selectedPushCount={selectedPushCount}
            setupState={pushSetupState}
            onEnable={() => { void enablePushForBrowser(); }}
            onSendTest={() => { void handleSendTestPush(); }}
          />
          {pushToggles.map((toggle) => (
            <NotificationToggleRow
              key={toggle.fieldKey}
              toggle={toggle}
              checked={values[toggle.fieldKey]}
              onToggle={handleToggle}
            />
          ))}
        </div>
      </GeneralSettingsSection>
    </div>
  );
}

/* ── Toggle Row ───────────────────────────────────────────────────────────── */

function NotificationToggleRow({
  toggle,
  checked,
  onToggle,
}: {
  toggle: NotificationToggleConfig;
  checked: boolean;
  onToggle: (key: NotificationFieldKey, value: boolean) => void | Promise<void>;
}) {
  const switchId = `notification-${toggle.fieldKey}`;

  return (
    <Field>
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor={switchId}>{toggle.label}</FieldLabel>
          <FieldDescription>{toggle.description}</FieldDescription>
        </div>
        <Switch
          id={switchId}
          checked={checked}
          onCheckedChange={(next) => onToggle(toggle.fieldKey, next)}
          aria-label={`${toggle.label} ${toggle.channel === "push" ? "push" : "in-app"}`}
        />
      </div>
    </Field>
  );
}

/* ── Push Status Banner ──────────────────────────────────────────────────── */

function PushBrowserStatus({
  busy,
  isSendingTest,
  selectedPushCount,
  setupState,
  onEnable,
  onSendTest,
}: {
  busy: boolean;
  isSendingTest: boolean;
  selectedPushCount: number;
  setupState: PushSetupState;
  onEnable: () => void;
  onSendTest: () => void;
}) {
  if (selectedPushCount === 0) {
    return null;
  }

  if (setupState === "ready") {
    return (
      <Alert role="status">
        <Smartphone />
        <AlertTitle>Push is enabled on this browser</AlertTitle>
        <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Send a test notification to confirm this browser receives pushes.
          </span>
          <Button
            className="w-fit"
            disabled={isSendingTest}
            onClick={onSendTest}
            size="sm"
            type="button"
            variant="outline"
          >
            {isSendingTest ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                Sending...
              </>
            ) : (
              "Send test notification"
            )}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const statusContent = getPushStatusContent(setupState);
  const canEnable = setupState === "needs-enable";

  return (
    <Alert role="status">
      <Smartphone />
      <AlertTitle>{statusContent.title}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>{statusContent.description}</span>
        {canEnable ? (
          <Button
            className="w-fit"
            disabled={busy}
            onClick={onEnable}
            size="sm"
            type="button"
            variant="outline"
          >
            {busy ? (
              <>
                <Spinner data-icon="inline-start" aria-hidden="true" />
                Enabling...
              </>
            ) : (
              "Enable this browser"
            )}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function getPushStatusContent(setupState: PushSetupState) {
  switch (setupState) {
    case "blocked":
      return {
        title: "Push is blocked in this browser",
        description:
          "Allow notifications in your browser settings before enabling push here.",
      };
    case "not-configured":
      return {
        title: "Push delivery is not configured",
        description:
          "Add VAPID keys to this environment before saving push channels.",
      };
    case "unsupported":
      return {
        title: "Push is unavailable in this browser",
        description:
          "Use a browser with service worker and notification support for push alerts.",
      };
    case "checking":
      return {
        title: "Checking browser push",
        description: "Confirming this browser can receive push notifications.",
      };
    case "needs-enable":
    case "ready":
      return {
        title: "Enable push on this browser",
        description:
          "This browser needs notification permission before it can receive push alerts.",
      };
  }
}
