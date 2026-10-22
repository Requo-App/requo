"use client";

import { useEffect } from "react";

import type { PublicAnalyticsEventInput } from "@/features/analytics/schemas";

const publicAnalyticsEndpoint = "/api/public/analytics";

function getTrackingMetadata() {
  const referrer = document.referrer || undefined;

  const params = new URLSearchParams(window.location.search);
  const utmSource = params.get("utm_source") || undefined;
  const utmMedium = params.get("utm_medium") || undefined;
  const utmCampaign = params.get("utm_campaign") || undefined;

  if (!referrer && !utmSource && !utmMedium && !utmCampaign) {
    return undefined;
  }

  return { referrer, utmSource, utmMedium, utmCampaign };
}

function trackPublicAnalyticsEvent(payload: PublicAnalyticsEventInput) {
  const body = JSON.stringify(payload);

  if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
    const didQueue = navigator.sendBeacon(
      publicAnalyticsEndpoint,
      new Blob([body], {
        type: "application/json",
      }),
    );

    if (didQueue) {
      return;
    }
  }

  void fetch(publicAnalyticsEndpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body,
    keepalive: true,
  }).catch(() => {
    // Best-effort analytics capture should never interrupt public flows.
  });
}

export function PublicInquiryFormViewTracker({
  businessId,
  serviceId,
}: {
  businessId: string;
  serviceId: string;
}) {
  useEffect(() => {
    trackPublicAnalyticsEvent({
      eventType: "inquiry_form_viewed",
      businessId,
      serviceId,
      metadata: getTrackingMetadata(),
    });
  }, [businessId, serviceId]);

  return null;
}

export function PublicQuoteViewTracker({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}) {
  useEffect(() => {
    trackPublicAnalyticsEvent({
      eventType: "quote_public_viewed",
      businessId,
      quoteId,
      metadata: getTrackingMetadata(),
    });
  }, [businessId, quoteId]);

  return null;
}
