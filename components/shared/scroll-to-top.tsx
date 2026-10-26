"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export function ScrollToTop() {
  const pathname = usePathname();
  const previousPathname = useRef(pathname);

  useEffect(() => {
    // Only react to real navigation. A late first mount (for example when the
    // Suspense boundary resolves after the page is interactive) must not yank
    // the reader back to the top.
    if (previousPathname.current === pathname) {
      return;
    }

    previousPathname.current = pathname;

    // Dashboard/settings keep the document fixed and scroll inside the shell
    // card. Fall back to the window for public and marketing routes.
    const shellScroller = document.querySelector<HTMLElement>(
      "[data-shell-scroll]",
    );

    if (shellScroller) {
      shellScroller.scrollTo({ top: 0, behavior: "instant" });
      return;
    }

    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
