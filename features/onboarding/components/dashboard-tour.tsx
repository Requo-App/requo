"use client";

import { useCallback, useEffect, useState } from "react";

import { completeDashboardTourAction } from "@/features/onboarding/tour-actions";
import {
  AiDraftingPreview,
  AnalyticsPreview,
  AssistantPreview,
  FollowUpsPreview,
  HomeOverviewPreview,
  InquiriesPreview,
  MembersPreview,
  QuoteLibraryPreview,
  QuotesPreview,
  ServicesPreview,
  TourModal,
  type TourModalStep,
} from "@/features/onboarding/components/tour-modal";
import { MobileWelcomeCard } from "@/features/onboarding/components/mobile-welcome-card";
import {
  clearDashboardTourLocalStorage,
  DASHBOARD_TOUR_DEV_SHOW_EVENT,
  getDashboardTourStorageKey,
} from "@/features/onboarding/tour-keys";

const tourSteps: TourModalStep[] = [
  {
    title: "Your home base",
    description:
      "See what needs attention today — overdue follow-ups, expiring quotes, and wins — plus your key numbers close by.",
    preview: <HomeOverviewPreview />,
  },
  {
    title: "Capture every inquiry",
    description:
      "Public services, manual entry, and email intake land in one list — qualify and turn the best leads into quotes.",
    preview: <InquiriesPreview />,
  },
  {
    title: "Send professional quotes",
    description:
      "Build line-item quotes, share a customer link, and track viewed, accepted, and expired responses.",
    preview: <QuotesPreview />,
  },
  {
    title: "Draft with AI",
    description:
      "Turn an inquiry into a polished quote in seconds — Requo suggests line items from your quote library and business knowledge, and drafts follow-up messages too.",
    preview: <AiDraftingPreview />,
  },
  {
    title: "Stay on top of follow-ups",
    description:
      "Schedule reminders when quotes go quiet or inquiries need a reply so nothing slips after you send.",
    preview: <FollowUpsPreview />,
  },
  {
    title: "Ask your Assistant",
    description:
      "Chat with Requo to search your business, draft quotes and follow-ups, and run operations — all from the dashboard.",
    preview: <AssistantPreview />,
  },
  {
    title: "Publish your Services",
    description:
      "Create services with their own form and public page, then share one link for new leads.",
    preview: <ServicesPreview />,
  },
  {
    title: "Reuse your quote library",
    description:
      "Save reusable items and pricing in your quote library so every quote comes together faster.",
    preview: <QuoteLibraryPreview />,
  },
  {
    title: "Invite your team",
    description:
      "Add teammates with the right roles so they can help handle inquiries, quotes, and follow-ups.",
    preview: <MembersPreview />,
  },
  {
    title: "Track what works",
    description:
      "See inquiry-to-quote conversion, which quotes get viewed and accepted, and where leads go quiet.",
    preview: <AnalyticsPreview />,
  },
];

type DashboardTourProps = {
  businessId: string;
  completed: boolean;
};

/**
 * Product tour for the business home dashboard.
 * Shown once per business membership; completion is stored on `business_members`.
 */
export function DashboardTour({ businessId, completed }: DashboardTourProps) {
  const [replayToken, setReplayToken] = useState(0);
  const storageKey = getDashboardTourStorageKey(businessId);

  useEffect(() => {
    const handleDevShow = () => {
      clearDashboardTourLocalStorage(businessId);
      setReplayToken((value) => value + 1);
    };

    window.addEventListener(DASHBOARD_TOUR_DEV_SHOW_EVENT, handleDevShow);

    try {
      if (sessionStorage.getItem("requo:dev:pending-dashboard-tour") === businessId) {
        sessionStorage.removeItem("requo:dev:pending-dashboard-tour");
        handleDevShow();
      }
    } catch {
      // sessionStorage unavailable
    }

    return () => {
      window.removeEventListener(DASHBOARD_TOUR_DEV_SHOW_EVENT, handleDevShow);
    };
  }, [businessId]);

  const handleComplete = useCallback(async () => {
    await completeDashboardTourAction(businessId);
  }, [businessId]);

  return (
    <>
      <TourModal
        completed={completed}
        onComplete={handleComplete}
        replayToken={replayToken}
        show
        steps={tourSteps}
        storageKey={storageKey}
      />
      <MobileWelcomeCard
        businessId={businessId}
        completed={completed}
        onComplete={handleComplete}
      />
    </>
  );
}
