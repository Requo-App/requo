"use client";

import type { ReactNode } from "react";
import { RiFileTextLine, RiPriceTag3Line } from "@remixicon/react";

import { Tab, TabList, TabPanel, Tabs } from "@/components/shared/tabs";
import { useHashTab } from "@/hooks/use-hash-tab";

const QUOTE_TAB_KEYS = ["quote", "templates"] as const;

type QuoteTabKey = (typeof QUOTE_TAB_KEYS)[number];

type QuoteSettingsTabsProps = {
  /** Quote defaults ("Quote" tab, selected by default). */
  quote: ReactNode;
  /** Reusable quote templates ("Templates" tab). */
  templates: ReactNode;
};

/**
 * Tabbed shell for the quotes settings surface.
 *
 * Splits the page into Quote defaults and Templates without a route change;
 * the templates manager used to live at /settings/quote-templates. Both tab
 * bodies are server-rendered and passed in, so each keeps its own Suspense
 * boundary from the page. Selection syncs to the URL hash (#quote,
 * #templates) so tabs are deep-linkable.
 */
export function QuoteSettingsTabs({ quote, templates }: QuoteSettingsTabsProps) {
  const { selected, handleSelectionChange } = useHashTab<QuoteTabKey>(
    QUOTE_TAB_KEYS,
    "quote",
  );

  return (
    <Tabs
      className="gap-0"
      data-settings-subnav=""
      onSelectionChange={(key) =>
        handleSelectionChange(key as QuoteTabKey)
      }
      selectedKey={selected}
    >
      <div className="sticky top-0 z-20 bg-muted">
        <TabList aria-label="Quote settings sections" className="justify-center">
          <Tab id="quote" icon={RiFileTextLine}>
            Quote
          </Tab>
          <Tab id="templates" icon={RiPriceTag3Line}>
            Templates
          </Tab>
        </TabList>
      </div>

      <TabPanel className="px-3 pt-4 sm:px-5 sm:pt-5 xl:px-6 xl:pt-6" id="quote">
        {quote}
      </TabPanel>
      <TabPanel className="px-3 pt-4 sm:px-5 sm:pt-5 xl:px-6 xl:pt-6" id="templates">
        {templates}
      </TabPanel>
    </Tabs>
  );
}
