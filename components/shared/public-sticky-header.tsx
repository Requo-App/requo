"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

export function PublicStickyHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setIsScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full [transition:background-color_var(--motion-duration-base)_var(--motion-ease-standard),border-color_var(--motion-duration-base)_var(--motion-ease-standard),box-shadow_var(--motion-duration-base)_var(--motion-ease-standard)]",
        isScrolled
          ? "border-b border-border bg-background"
          : "border-b-transparent bg-transparent",
        className
      )}
    >
      {children}
    </header>
  );
}
