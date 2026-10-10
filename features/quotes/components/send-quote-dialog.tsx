"use client";

import { useEffect, useRef, useState, useTransition, useOptimistic } from "react";
import {
  ArrowLeft,
  BellRing,
  Check,
  Copy,
  Eye,
  ExternalLink,
  Link2,
  Mail,
  SendHorizontal,
  ShieldCheck,
} from "lucide-react";
import { toast } from "@/components/shared/notify";

import { ProFeatureNoticeButton } from "@/components/shared/pro-feature-notice-button";
import { Button } from "@/components/ui/button";
import { mobileNavbarIconButtonClassName } from "@/components/shell/mobile-header-slot";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/ui/date-picker";
import {
  ResponsiveOverlay,
  ResponsiveOverlayBody,
  ResponsiveOverlayContent,
  ResponsiveOverlayDescription,
  ResponsiveOverlayFooter,
  ResponsiveOverlayHeader,
  ResponsiveOverlayTitle,
  ResponsiveOverlayTrigger,
} from "@/components/ui/responsive-overlay";
import { Spinner } from "@/components/ui/spinner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type {
  QuoteSendActionState,
  QuoteSendChannel,
  QuoteStatus,
} from "@/features/quotes/types";
import {
  type FollowUpCreateActionState,
} from "@/features/follow-ups/types";
import {
  getDefaultFollowUpChannel,
  getQuickFollowUpDueDate,
} from "@/features/follow-ups/utils";
import {
  buildMailtoUrl,
  formatQuoteMoney,
  generateQuoteEmailBody,
  generateQuoteEmailSubject,
  generateQuoteFollowUpMessage,
  getChannelMessage,
  getDefaultSendChannel,
  quoteSendChannelLabels,
} from "@/features/quotes/utils";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import { useDeferredRefresh } from "@/hooks/use-deferred-refresh";
import { useOptimisticMutation } from "@/hooks/use-optimistic-mutation";
import { QuotePreview } from "@/features/quotes/components/quote-preview";

/* -------------------------------------------------------------------------- */

type QuotePreviewItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
};

type QuoteSummaryForSend = {
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  totalInCents: number;
  currency: string;
  validUntil: string;
  status: QuoteStatus;
  publicViewedAt?: Date | null;
};

type SendQuoteDialogProps = {
  sendAction: (
    state: QuoteSendActionState,
    formData: FormData,
  ) => Promise<QuoteSendActionState>;
  logEventAction: (
    eventType: string,
    channel?: string,
  ) => Promise<{ error?: string }>;
  createFollowUpAction?: (
    state: FollowUpCreateActionState,
    formData: FormData,
  ) => Promise<FollowUpCreateActionState>;
  quote: QuoteSummaryForSend;
  customerQuoteUrl: string | null;
  businessName: string;
  isRequoEmailAvailable: boolean;
  pdfExportHref?: string;
  pdfExportLocked?: boolean;
  disabled?: boolean;
  /**
   * Whether auto follow-up is available (plan-gated and under the plan's
   * active-sequence cap). When false, the auto follow-up toggle is hidden.
   */
  canAutoFollowUp?: boolean;
  /**
   * Optional explanation shown in place of the auto follow-up toggle when it
   * is unavailable for a reason the owner can act on (e.g. cap reached).
   */
  autoFollowUpUnavailableNote?: string;
  /**
   * Number of line items that still need a price (unit price <= 0).
   * When > 0 the dialog shows a warning and blocks the send buttons.
   */
  unpricedItemCount?: number;
  /**
   * Whether the quote's AI readiness requires the owner to confirm
   * suggested/unconfirmed pricing before the quote can be sent.
   */
  needsAiConfirmation?: boolean;
  /**
   * Server action recording the owner's explicit pricing acknowledgement.
   * Unlocks sending when `needsAiConfirmation` is true.
   */
  acknowledgeAction?: (
    prevState: QuoteSendActionState,
    formData: FormData,
  ) => Promise<QuoteSendActionState>;
  /**
   * Data for the quote preview panel. When provided, a "Preview" toggle
   * is shown in the dialog header allowing the owner to see what the
   * customer will see before sending.
   */
  previewData?: {
    businessName: string;
    businessLogoStoragePath: string | null;
    businessSlug: string;
    quoteNumber: string;
    title: string;
    customerName: string;
    customerEmail: string | null;
    currency: string;
    validUntil: string;
    notes: string | null;
    terms: string | null;
    items: QuotePreviewItem[];
    subtotalInCents: number;
    discountInCents: number;
    taxInCents: number;
    taxLabel: string | null;
    totalInCents: number;
    version: number;
    showWatermark: boolean;
  };
  /**
   * Href to the full-page quote preview route. When provided, the "Preview"
   * button opens the full-page preview in a new tab instead of the inline panel.
   */
  previewHref?: string;
  /**
   * Collapse the trigger to an icon-only navbar button below `lg`
   * (list-page header treatment). Only set for header instances portaled
   * via `MobileHeaderSlot` — body instances keep their full label.
   */
  compactOnMobile?: boolean;
};

const initialSendState: QuoteSendActionState = {};

/* -------------------------------------------------------------------------- */

export function SendQuoteDialog({
  sendAction,
  logEventAction,
  createFollowUpAction,
  quote,
  customerQuoteUrl,
  businessName,
  isRequoEmailAvailable,
  pdfExportHref,
  pdfExportLocked = false,
  disabled = false,
  canAutoFollowUp = false,
  autoFollowUpUnavailableNote,
  unpricedItemCount = 0,
  needsAiConfirmation = false,
  acknowledgeAction,
  previewData,
  previewHref,
  compactOnMobile = false,
}: SendQuoteDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"ready" | "sent">("ready");
  const [optimisticStep, setOptimisticStep] = useOptimistic(
    step,
    (_current, nextStep: "ready" | "sent") => nextStep,
  );
  const [showPreview, setShowPreview] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const reqSubmitRef = useRef<HTMLButtonElement>(null);
  const manSubmitRef = useRef<HTMLButtonElement>(null);
  const { runMutation, isPendingKey } = useOptimisticMutation();
  const { scheduleRefresh } = useDeferredRefresh();
  const [sendSuccessMessage, setSendSuccessMessage] = useState<string | undefined>();
  const isPending = isPendingKey("send");
  const [, startLogging] = useTransition();

  const detectedChannel = getDefaultSendChannel(quote.customerContactMethod);
  const [selectedChannel, setSelectedChannel] =
    useState<QuoteSendChannel>(detectedChannel);
  const [aiAcknowledged, setAiAcknowledged] = useState(false);
  const [ackPending, setAckPending] = useState(false);
  const confirmationBlocked = needsAiConfirmation && !aiAcknowledged;
  const sendBlocked = unpricedItemCount > 0 || confirmationBlocked;
  const templateInput = {
    customerName: quote.customerName,
    businessName,
    quoteLink: customerQuoteUrl ?? "",
  };
  const primaryMessage = getChannelMessage(detectedChannel, templateInput);
  const [editedMessage, setEditedMessage] = useState(primaryMessage);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [autoFollowUp, setAutoFollowUp] = useState(false);
  const [autoFollowUpDelay, setAutoFollowUpDelay] = useState(3);
  const [autoFollowUpMax, setAutoFollowUpMax] = useState(2);

  const isEmailContact = detectedChannel === "email";
  const showRequoOption =
    isRequoEmailAvailable && isEmailContact && quote.customerEmail;

  function handleOpenChange(next: boolean) {
    if (next) {
      setStep("ready");
      setSendSuccessMessage(undefined);
      setShowPreview(false);
      setSelectedChannel(detectedChannel);
      setEditedMessage(getChannelMessage(detectedChannel, templateInput));
      setCopiedField(null);
      setAiAcknowledged(false);
    }
    setOpen(next);
  }

  const displayStep = optimisticStep;

  /* --- Copy helpers --- */

  async function copyText(text: string, label: string, eventType?: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied.`);
      setCopiedField(label);
      setTimeout(() => setCopiedField(null), 2000);
      if (eventType) {
        startLogging(async () => {
          await logEventAction(eventType, selectedChannel);
        });
      }
    } catch {
      toast.error(`Couldn't copy ${label.toLowerCase()}.`);
    }
  }

  function handleCopyLink() {
    if (!customerQuoteUrl) return;
    void copyText(customerQuoteUrl, "Link", "copied_link");
  }

  function handleCopyMessage() {
    void copyText(editedMessage, "Message", "copied_message");
  }

  function handleCopyFollowUp() {
    const followUpMsg = generateQuoteFollowUpMessage(templateInput);
    void copyText(followUpMsg, "Follow-up", "copied_followup");
  }

  function handleOpenEmailApp() {
    if (!quote.customerEmail || !customerQuoteUrl) return;
    startLogging(async () => {
      await logEventAction("opened_email_app", "email");
    });
  }

  const [clickedAction, setClickedAction] = useState<"requo" | "manual" | null>(null);

  function buildSendFormData(deliveryMethod: "requo" | "manual") {
    const formData = new FormData(formRef.current ?? undefined);
    formData.set("deliveryMethod", deliveryMethod);
    return formData;
  }

  function submitSend(deliveryMethod: "requo" | "manual") {
    runMutation({
      applyOptimistic: () => {
        setOptimisticStep("sent");
      },
      revertOptimistic: () => {
        setOptimisticStep("ready");
      },
      mutation: () => sendAction(initialSendState, buildSendFormData(deliveryMethod)),
      pendingKey: "send",
      refreshOnSuccess: false,
      onSuccess: (result) => {
        setSendSuccessMessage(result.success);
        setStep("sent");
        scheduleRefresh();
      },
    });
  }

  function handleSendWithRequo() {
    if (disabled || isPending) return;
    if (confirmationBlocked) {
      toast.error(
        "Review the suggested prices and confirm them before sending.",
      );
      return;
    }
    if (unpricedItemCount > 0) {
      toast.error(
        unpricedItemCount === 1
          ? "1 line item still needs pricing. Set a price before sending."
          : `${unpricedItemCount} line items still need pricing. Set prices before sending.`,
      );
      return;
    }
    setClickedAction("requo");
    submitSend("requo");
  }

  function handleMarkAsSent() {
    if (disabled || isPending) return;
    if (confirmationBlocked) {
      toast.error(
        "Review the suggested prices and confirm them before sending.",
      );
      return;
    }
    if (unpricedItemCount > 0) {
      toast.error(
        unpricedItemCount === 1
          ? "1 line item still needs pricing. Set a price before sending."
          : `${unpricedItemCount} line items still need pricing. Set prices before sending.`,
      );
      return;
    }
    setClickedAction("manual");
    submitSend("manual");
  }

  async function handleAcknowledgePricing() {
    if (!acknowledgeAction || ackPending) return;

    setAckPending(true);
    try {
      const result = await acknowledgeAction({}, new FormData());
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setAiAcknowledged(true);
      toast.success(result.success ?? "Pricing reviewed and confirmed.");
      scheduleRefresh();
    } finally {
      setAckPending(false);
    }
  }

  /* --- Mailto URL --- */

  const mailtoUrl =
    quote.customerEmail && customerQuoteUrl
      ? buildMailtoUrl({
          to: quote.customerEmail,
          subject: generateQuoteEmailSubject(businessName),
          body: generateQuoteEmailBody(templateInput),
        })
      : null;

  /* --- Render --- */

  if (!customerQuoteUrl) {
    return (
      <Alert>
        <AlertTitle>Customer link unavailable</AlertTitle>
        <AlertDescription>
          The secure customer link couldn&apos;t be recovered. Sending is
          temporarily unavailable.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <ResponsiveOverlay open={open} onOpenChange={handleOpenChange}>
      <ResponsiveOverlayTrigger asChild>
        <Button
          disabled={disabled}
          type="button"
          size={compactOnMobile ? "sm" : undefined}
          className={compactOnMobile ? cn(mobileNavbarIconButtonClassName) : undefined}
          aria-label={compactOnMobile ? "Send quote" : undefined}
          title={compactOnMobile ? "Send quote" : undefined}
        >
          <SendHorizontal data-icon="inline-start" />
          {compactOnMobile ? (
            <span className="hidden lg:inline">Send</span>
          ) : (
            "Send"
          )}
        </Button>
      </ResponsiveOverlayTrigger>

      <ResponsiveOverlayContent className="sm:max-w-md">
        {displayStep === "ready" && showPreview && previewData ? (
          <>
            <ResponsiveOverlayHeader>
              <ResponsiveOverlayTitle>Quote preview</ResponsiveOverlayTitle>
              <ResponsiveOverlayDescription>
                This is what {quote.customerName} will see.
              </ResponsiveOverlayDescription>
            </ResponsiveOverlayHeader>

            <ResponsiveOverlayBody className="flex flex-col gap-4 pt-1">
              <div className="relative max-h-[60vh] overflow-y-auto rounded-lg border border-border/60">
                <div className="pointer-events-none select-none">
                  <QuotePreview
                    businessName={previewData.businessName}
                    businessLogoStoragePath={previewData.businessLogoStoragePath}
                    businessSlug={previewData.businessSlug}
                    quoteNumber={previewData.quoteNumber}
                    title={
                      previewData.version > 1
                        ? `${previewData.title} (v${previewData.version})`
                        : previewData.title
                    }
                    customerName={previewData.customerName}
                    customerEmail={previewData.customerEmail}
                    currency={previewData.currency}
                    validUntil={previewData.validUntil}
                    notes={previewData.notes}
                    terms={previewData.terms}
                    items={previewData.items}
                    subtotalInCents={previewData.subtotalInCents}
                    discountInCents={previewData.discountInCents}
                    taxInCents={previewData.taxInCents}
                    taxLabel={previewData.taxLabel}
                    totalInCents={previewData.totalInCents}
                    variant="bare"
                  />
                  {previewData.showWatermark ? (
                    <div className="relative flex justify-end px-4 py-3">
                      <div className="flex items-center gap-2 rounded-full border border-border/70 bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground">
                        Made with Requo
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </ResponsiveOverlayBody>

            <ResponsiveOverlayFooter>
              <Button
                className="w-full"
                onClick={() => setShowPreview(false)}
                type="button"
                variant="outline"
              >
                <ArrowLeft data-icon="inline-start" />
                Back to send
              </Button>
            </ResponsiveOverlayFooter>
          </>
        ) : displayStep === "ready" ? (
          <>
            <ResponsiveOverlayHeader>
              <ResponsiveOverlayTitle>Send quote</ResponsiveOverlayTitle>
              <ResponsiveOverlayDescription>
                Deliver {quote.quoteNumber} to {quote.customerName}.
              </ResponsiveOverlayDescription>
            </ResponsiveOverlayHeader>

            <ResponsiveOverlayBody className="flex flex-col gap-5 pt-1">
              {unpricedItemCount > 0 ? (
                <Alert className="border-amber-500/30 bg-amber-500/10">
                  <AlertTitle>
                    {unpricedItemCount === 1
                      ? "1 line item still needs pricing review"
                      : `${unpricedItemCount} line items still need pricing review`}
                  </AlertTitle>
                  <AlertDescription>
                    Set a price for every line item before sending this quote.
                    The assistant won&apos;t pick a price for items it
                    can&apos;t match to your saved pricing.
                  </AlertDescription>
                </Alert>
              ) : null}

              {confirmationBlocked ? (
                <Alert className="border-amber-500/30 bg-amber-500/10">
                  <AlertTitle>Confirm suggested pricing</AlertTitle>
                  <AlertDescription>
                    Some line items were priced from suggested matches that
                    need your confirmation. Review the line items, then confirm
                    the pricing to send this quote.
                  </AlertDescription>
                </Alert>
              ) : null}

              {/* Quote summary row */}
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {quote.title}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {quoteSendChannelLabels[detectedChannel]} · {quote.customerContactHandle}
                  </p>
                </div>
                <p className="shrink-0 text-base font-semibold tracking-tight text-foreground">
                  {formatQuoteMoney(quote.totalInCents, quote.currency)}
                </p>
              </div>

              {/* Hidden form for submit */}
              <form ref={formRef} className="hidden">
                <button
                  aria-hidden="true"
                  disabled={disabled || isPending}
                  name="deliveryMethod"
                  ref={reqSubmitRef}
                  tabIndex={-1}
                  type="submit"
                  value="requo"
                />
                <button
                  aria-hidden="true"
                  disabled={disabled || isPending}
                  name="deliveryMethod"
                  ref={manSubmitRef}
                  tabIndex={-1}
                  type="submit"
                  value="manual"
                />
                {autoFollowUp && showRequoOption && canAutoFollowUp && (
                  <>
                    <input type="hidden" name="autoFollowUp" value="on" />
                    <input type="hidden" name="autoFollowUpDelay" value={String(autoFollowUpDelay)} />
                    <input type="hidden" name="autoFollowUpMax" value={String(autoFollowUpMax)} />
                  </>
                )}
              </form>

              {/* Message preview */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="meta-label">Message</p>
                  <Button
                    onClick={handleCopyMessage}
                    size="xs"
                    type="button"
                    variant="ghost"
                  >
                    {copiedField === "Message" ? (
                      <Check data-icon="inline-start" className="size-3" />
                    ) : (
                      <Copy data-icon="inline-start" className="size-3" />
                    )}
                    {copiedField === "Message" ? "Copied" : "Copy"}
                  </Button>
                </div>
                <textarea
                  className="w-full resize-none rounded-lg border border-input bg-muted/30 px-3.5 py-3 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  onChange={(e) => setEditedMessage(e.target.value)}
                  rows={3}
                  value={editedMessage}
                />
              </div>

              {/* Quick actions row */}
              <div className="flex items-center gap-2">
                {previewHref ? (
                  <Button asChild className="flex-1" size="sm" variant="outline">
                    <a href={previewHref} target="_blank" rel="noopener noreferrer">
                      <Eye data-icon="inline-start" className="size-3.5" />
                      Preview
                    </a>
                  </Button>
                ) : previewData ? (
                  <Button
                    className="flex-1"
                    onClick={() => setShowPreview(true)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    <Eye data-icon="inline-start" className="size-3.5" />
                    Preview
                  </Button>
                ) : null}

                <Button
                  className="flex-1"
                  onClick={handleCopyLink}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {copiedField === "Link" ? (
                    <Check data-icon="inline-start" className="size-3.5" />
                  ) : (
                    <Link2 data-icon="inline-start" className="size-3.5" />
                  )}
                  {copiedField === "Link" ? "Copied" : "Copy link"}
                </Button>

                {pdfExportHref ? (
                  <Button asChild className="flex-1" size="sm" variant="outline">
                    <a href={pdfExportHref} target="_blank" rel="noopener noreferrer">
                      <ExternalLink data-icon="inline-start" className="size-3.5" />
                      PDF
                    </a>
                  </Button>
                ) : pdfExportLocked ? (
                  <ProFeatureNoticeButton
                    className="flex-1"
                    noticeDescription="Upgrade to Pro to download quote PDFs."
                    noticeTitle="PDF is a Pro feature."
                    size="sm"
                    variant="outline"
                  >
                    <ExternalLink data-icon="inline-start" className="size-3.5" />
                    PDF
                  </ProFeatureNoticeButton>
                ) : null}
              </div>

              {/* Auto follow-up toggle (only for Requo email sends) */}
              {showRequoOption && canAutoFollowUp ? (
                <div className="rounded-lg border border-border/60 px-4 py-3">
                  <label className="flex items-center justify-between gap-3 cursor-pointer">
                    <div className="flex items-center gap-2">
                      <BellRing className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">
                        Auto follow-up
                      </span>
                    </div>
                    <Checkbox
                      checked={autoFollowUp}
                      onCheckedChange={(checked) => setAutoFollowUp(checked === true)}
                    />
                  </label>
                  {autoFollowUp ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      Send a reminder email after{" "}
                      <select
                        className="inline-block rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                        onChange={(e) => setAutoFollowUpDelay(Number(e.target.value))}
                        value={autoFollowUpDelay}
                      >
                        <option value={1}>1 day</option>
                        <option value={2}>2 days</option>
                        <option value={3}>3 days</option>
                        <option value={5}>5 days</option>
                        <option value={7}>7 days</option>
                      </select>
                      {" "}with no reply, up to{" "}
                      <select
                        className="inline-block rounded border border-input bg-background px-1.5 py-0.5 text-xs"
                        onChange={(e) => setAutoFollowUpMax(Number(e.target.value))}
                        value={autoFollowUpMax}
                      >
                        <option value={1}>1 time</option>
                        <option value={2}>2 times</option>
                        <option value={3}>3 times</option>
                      </select>
                      . Stops when the customer views or responds.
                    </p>
                  ) : null}
                </div>
              ) : showRequoOption && autoFollowUpUnavailableNote ? (
                <p className="text-xs text-muted-foreground">
                  {autoFollowUpUnavailableNote}
                </p>
              ) : null}
            </ResponsiveOverlayBody>

            <ResponsiveOverlayFooter className="flex-col gap-2 sm:flex-col">
              {confirmationBlocked && acknowledgeAction ? (
                <Button
                  className="w-full"
                  disabled={ackPending || isPending}
                  onClick={handleAcknowledgePricing}
                  type="button"
                  variant="secondary"
                >
                  {ackPending ? (
                    <Spinner data-icon="inline-start" aria-hidden="true" />
                  ) : (
                    <ShieldCheck data-icon="inline-start" />
                  )}
                  {ackPending
                    ? "Confirming..."
                    : "I've reviewed the suggested prices"}
                </Button>
              ) : null}
              {/* Primary send action */}
              {showRequoOption ? (
                <>
                  <Button
                    className="w-full"
                    disabled={disabled || isPending || sendBlocked}
                    onClick={handleSendWithRequo}
                    type="button"
                  >
                    {isPending && clickedAction === "requo" ? (
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <SendHorizontal data-icon="inline-start" />
                    )}
                    {isPending && clickedAction === "requo" ? "Sending..." : "Send now"}
                  </Button>
                  <div className="flex w-full items-center gap-2">
                    {isEmailContact && mailtoUrl ? (
                      <Button
                        asChild
                        className="flex-1"
                        onClick={handleOpenEmailApp}
                        variant="outline"
                      >
                        <a href={mailtoUrl} target="_blank" rel="noopener noreferrer">
                          <Mail data-icon="inline-start" />
                          Email app
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      className="flex-1"
                      disabled={disabled || isPending || sendBlocked}
                      onClick={handleMarkAsSent}
                      type="button"
                      variant="outline"
                    >
                      {isPending && clickedAction === "manual" ? (
                        <Spinner data-icon="inline-start" aria-hidden="true" />
                      ) : (
                        <Check data-icon="inline-start" />
                      )}
                      {isPending && clickedAction === "manual" ? "Sending..." : "I'll send it myself"}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex w-full items-center gap-2">
                  {isEmailContact && mailtoUrl ? (
                    <Button
                      asChild
                      className="flex-1"
                      onClick={handleOpenEmailApp}
                    >
                      <a href={mailtoUrl} target="_blank" rel="noopener noreferrer">
                        <Mail data-icon="inline-start" />
                        Open email app
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    className="flex-1"
                    disabled={disabled || isPending || sendBlocked}
                    onClick={handleMarkAsSent}
                    type="button"
                    variant={isEmailContact && mailtoUrl ? "outline" : "default"}
                  >
                    {isPending && clickedAction === "manual" ? (
                      <Spinner data-icon="inline-start" aria-hidden="true" />
                    ) : (
                      <Check data-icon="inline-start" />
                    )}
                    {isPending && clickedAction === "manual" ? "Sending..." : "I'll send it myself"}
                  </Button>
                </div>
              )}
            </ResponsiveOverlayFooter>
          </>
        ) : (
          /* --- Sent confirmation step --- */
          <>
            <ResponsiveOverlayHeader>
              <ResponsiveOverlayTitle>Quote sent</ResponsiveOverlayTitle>
              <ResponsiveOverlayDescription>
                {sendSuccessMessage ?? `${quote.quoteNumber} marked as sent.`}
              </ResponsiveOverlayDescription>
            </ResponsiveOverlayHeader>

            <ResponsiveOverlayBody className="flex flex-col gap-5">
              <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15">
                  <Check className="size-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    Tracking is active
                  </p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    Requo will notify you when the customer views, accepts, or
                    declines this quote.
                  </p>
                </div>
              </div>

              {createFollowUpAction ? (
                <QuoteFollowUpPrompt
                  action={createFollowUpAction}
                  onCopyFollowUp={handleCopyFollowUp}
                  quote={quote}
                  selectedChannel={selectedChannel}
                />
              ) : null}
            </ResponsiveOverlayBody>

            <ResponsiveOverlayFooter>
              <Button className="w-full" onClick={() => setOpen(false)} type="button">
                Done
              </Button>
            </ResponsiveOverlayFooter>
          </>
        )}
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

/* -------------------------------------------------------------------------- */

function QuoteFollowUpPrompt({
  action,
  onCopyFollowUp,
  quote,
  selectedChannel,
}: {
  action: (
    state: FollowUpCreateActionState,
    formData: FormData,
  ) => Promise<FollowUpCreateActionState>;
  onCopyFollowUp: () => void;
  quote: QuoteSummaryForSend;
  selectedChannel: QuoteSendChannel;
}) {
  const { scheduleRefresh } = useDeferredRefresh();
  const [customOpen, setCustomOpen] = useState(false);
  const [customDueDate, setCustomDueDate] = useState(
    getQuickFollowUpDueDate("3d"),
  );
  const [dismissed, setDismissed] = useState(false);
  const [state, formAction, isPending] = useActionStateWithSonner(
    action,
    {} as FollowUpCreateActionState,
  );
  const followUpChannel = getDefaultFollowUpChannel(selectedChannel);
  const followUpTitle = `Follow up on quote ${quote.quoteNumber}`;
  const followUpReason = quote.publicViewedAt
    ? "Follow up because the customer viewed this quote but has not responded."
    : "Follow up with the customer about this quote if they have not responded.";

  useEffect(() => {
    if (state.success) {
      scheduleRefresh();
    }
  }, [scheduleRefresh, state.success]);

  if (state.success) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-border/60 px-4 py-3.5">
        <BellRing className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">
            Follow-up reminder set
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            It will appear in your follow-ups list.
          </p>
        </div>
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  const hiddenFieldValues = { title: followUpTitle, reason: followUpReason, channel: followUpChannel };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-foreground">
          Set a follow-up reminder?
        </p>
        <Button
          onClick={() => setDismissed(true)}
          size="xs"
          type="button"
          variant="ghost"
        >
          Skip
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          ["tomorrow", "Tomorrow"],
          ["3d", "3 days"],
          ["7d", "7 days"],
        ].map(([value, label]) => (
          <form action={formAction} key={value}>
            <input name="title" type="hidden" value={hiddenFieldValues.title} />
            <input name="reason" type="hidden" value={hiddenFieldValues.reason} />
            <input name="channel" type="hidden" value={hiddenFieldValues.channel} />
            <input name="dueDate" type="hidden" value={getQuickFollowUpDueDate(value as "tomorrow" | "3d" | "7d")} />
            <Button disabled={isPending} size="sm" type="submit" variant="outline">
              {label}
            </Button>
          </form>
        ))}
        <Button
          onClick={() => setCustomOpen((v) => !v)}
          size="sm"
          type="button"
          variant="outline"
        >
          Custom
        </Button>
      </div>

      {customOpen ? (
        <form action={formAction} className="flex items-end gap-2 rounded-lg border border-border/60 p-3">
          <input name="title" type="hidden" value={hiddenFieldValues.title} />
          <input name="reason" type="hidden" value={hiddenFieldValues.reason} />
          <input name="channel" type="hidden" value={hiddenFieldValues.channel} />
          <input name="dueDate" type="hidden" value={customDueDate} />
          <div className="min-w-0 flex-1">
            <p className="meta-label mb-1.5">Due date</p>
            <DatePicker
              id="quote-follow-up-custom-date"
              name="dueDate"
              onChange={setCustomDueDate}
              required
              value={customDueDate}
            />
          </div>
          <Button disabled={isPending} size="sm" type="submit">
            {isPending ? (
              <Spinner data-icon="inline-start" aria-hidden="true" />
            ) : (
              <BellRing data-icon="inline-start" />
            )}
            Set
          </Button>
        </form>
      ) : null}

      <Button
        className="w-fit"
        onClick={onCopyFollowUp}
        size="xs"
        type="button"
        variant="ghost"
      >
        <Copy data-icon="inline-start" className="size-3" />
        Copy follow-up message
      </Button>
    </div>
  );
}
