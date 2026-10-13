"use client";

import { CircleHelp, LifeBuoy } from "lucide-react";
import { toast } from "@/components/shared/notify";

import { Button } from "@/components/ui/button";
import {
  openCrispHelp,
  openCrispHelpdesk,
} from "@/components/integrations/crisp/crisp-chat-widget";

type SupportChatActionsProps = {
  crispEnabled: boolean;
};

export function SupportChatActions({ crispEnabled }: SupportChatActionsProps) {
  function handleOpenChat() {
    if (!crispEnabled) {
      toast.message("Live chat is not configured yet.");
      return;
    }
    const success = openCrispHelp();
    if (!success) {
      toast.message("Live chat is initializing. Please try again in a moment.");
    }
  }

  function handleOpenHelpdesk() {
    if (!crispEnabled) {
      toast.message("Live chat is not configured yet.");
      return;
    }
    const success = openCrispHelpdesk();
    if (!success) {
      toast.message("Help center is initializing. Please try again in a moment.");
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button
        type="button"
        onClick={handleOpenChat}
      >
        <LifeBuoy data-icon="inline-start" />
        Open support chat
      </Button>
      <Button
        type="button"
        variant="outline"
        onClick={handleOpenHelpdesk}
      >
        <CircleHelp data-icon="inline-start" />
        Open help center
      </Button>
    </div>
  );
}
