"use client";

import type * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";

type UpgradeNoticeButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  "asChild" | "disabled" | "onClick"
> & {
  noticeTitle?: string;
  noticeDescription?: string;
};

/**
 * Lightweight upgrade notice for client components that do not have the
 * business plan or checkout context needed by `FeatureGate`.
 *
 * Prefer `FeatureGate variant="action"` when plan data is available; it
 * renders the canonical locked-action popover with a checkout CTA.
 */
export function UpgradeNoticeButton({
  children,
  noticeTitle = "Upgrade required.",
  noticeDescription = "Upgrade your plan to use this feature.",
  type = "button",
  ...props
}: UpgradeNoticeButtonProps) {
  return (
    <Popover modal={false}>
      <PopoverTrigger asChild>
        <Button type={type} {...props}>
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-64 motion-reduce:!animate-none motion-reduce:!duration-0"
      >
        <PopoverHeader>
          <PopoverTitle>{noticeTitle}</PopoverTitle>
          <PopoverDescription>{noticeDescription}</PopoverDescription>
        </PopoverHeader>
      </PopoverContent>
    </Popover>
  );
}
