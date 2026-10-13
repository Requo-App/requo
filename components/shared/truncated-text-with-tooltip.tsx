"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type TruncatedTextWithTooltipProps = {
  text: string;
  className?: string;
  href?: string;
  prefetch?: boolean;
  lines?: 1 | 2 | 3 | 4 | 5 | 6;
};

const lineClampClassNames = {
  1: "truncate",
  2: "[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] overflow-hidden",
  3: "[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden",
  4: "[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:4] overflow-hidden",
  5: "[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:5] overflow-hidden",
  6: "[display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:6] overflow-hidden",
} as const;

export function TruncatedTextWithTooltip({
  text,
  className,
  href,
  prefetch = true,
  lines = 1,
}: TruncatedTextWithTooltipProps) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isOverflowed, setIsOverflowed] = useState(false);
  const setTextRef = useCallback((node: HTMLElement | null) => {
    setElement(node);
  }, []);

  useEffect(() => {

    if (!element) {
      return;
    }

    let isMounted = true;
    const updateOverflow = () => {
      if (!isMounted) {
        return;
      }

      const hasHorizontalOverflow = element.scrollWidth > element.clientWidth + 1;
      const hasVerticalOverflow =
        lines > 1 && element.scrollHeight > element.clientHeight + 1;

      setIsOverflowed(hasHorizontalOverflow || hasVerticalOverflow);
    };

    updateOverflow();

    void document.fonts?.ready.then(updateOverflow);

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflow);

      return () => {
        isMounted = false;
        window.removeEventListener("resize", updateOverflow);
      };
    }

    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(element);

    return () => {
      isMounted = false;
      resizeObserver.disconnect();
    };
  }, [lines, text, element]);

  const textClassName = cn(
    "block max-w-full min-w-0 break-words",
    lineClampClassNames[lines],
    className,
  );

  const trigger = href ? (
    <Link
      className={textClassName}
      href={href}
      prefetch={prefetch}
      ref={setTextRef}
    >
      {text}
    </Link>
  ) : (
    <span
      className={textClassName}
      ref={setTextRef}
      tabIndex={isOverflowed ? 0 : undefined}
    >
      {text}
    </span>
  );

  if (!isOverflowed) {
    return trigger;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-wrap break-words leading-5">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
