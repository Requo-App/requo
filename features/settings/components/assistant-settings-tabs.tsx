"use client";

import type { ReactNode } from "react";
import { RiBookLine, RiSparklingLine } from "@remixicon/react";

import { Tab, TabList, TabPanel, Tabs } from "@/components/shared/tabs";
import { useHashTab } from "@/hooks/use-hash-tab";

const ASSISTANT_TAB_KEYS = ["assistant", "knowledge"] as const;

type AssistantTabKey = (typeof ASSISTANT_TAB_KEYS)[number];

type AssistantSettingsTabsProps = {
  /** Public chat + business instructions ("Customer agent" tab, selected by default). */
  assistant: ReactNode;
  /** Business knowledge base ("Knowledge base" tab). */
  knowledge: ReactNode;
};

/**
 * Tabbed shell for the customer agent settings surface.
 *
 * Mirrors QuoteSettingsTabs: Customer agent defaults and Knowledge base
 * without a route change; the knowledge manager used to live at
 * /settings/knowledge-base. Both tab bodies are server-rendered and passed
 * in, so each keeps its own Suspense boundary from the page. Selection syncs
 * to the URL hash (#assistant, #knowledge) so tabs are deep-linkable.
 */
export function AssistantSettingsTabs({
  assistant,
  knowledge,
}: AssistantSettingsTabsProps) {
  const { selected, handleSelectionChange } = useHashTab<AssistantTabKey>(
    ASSISTANT_TAB_KEYS,
    "assistant",
  );

  return (
    <Tabs
      className="gap-0"
      data-settings-subnav=""
      onSelectionChange={(key) =>
        handleSelectionChange(key as AssistantTabKey)
      }
      selectedKey={selected}
    >
      <div className="sticky top-0 z-20 bg-muted">
        <TabList
          aria-label="Customer agent settings sections"
          className="justify-center"
        >
          <Tab id="assistant" icon={RiSparklingLine}>
            Customer agent
          </Tab>
          <Tab id="knowledge" icon={RiBookLine}>
            Knowledge base
          </Tab>
        </TabList>
      </div>

      <TabPanel
        className="px-3 pt-4 sm:px-5 sm:pt-5 xl:px-6 xl:pt-6"
        id="assistant"
      >
        {assistant}
      </TabPanel>
      <TabPanel
        className="px-3 pt-4 sm:px-5 sm:pt-5 xl:px-6 xl:pt-6"
        id="knowledge"
      >
        {knowledge}
      </TabPanel>
    </Tabs>
  );
}
