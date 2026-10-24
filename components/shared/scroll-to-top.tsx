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
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
