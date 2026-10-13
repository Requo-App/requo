"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

// Extend navigator type for WebMCP
declare global {
  interface Navigator {
    modelContext?: {
      provideContext: (context: unknown) => void;
    };
  }
}

export function WebMCPProvider() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.modelContext) {
      try {
        navigator.modelContext.provideContext({
          tools: [
            {
              name: "get_page_context",
              description: "Get the current page context and URL path.",
              inputSchema: {
                type: "object",
                properties: {},
                required: [],
              },
              execute: async () => {
                return {
                  pathname,
                  timestamp: new Date().toISOString(),
                };
              },
            },
          ],
        });
      } catch (error) {
        console.error("Failed to initialize WebMCP context", error);
      }
    }
  }, [pathname]);

  return null;
}
