import {
  BusinessAssistantStaticFallback,
  SettingsCollectionBodySkeleton,
} from "@/components/shell/settings-body-skeletons";
import { AssistantSettingsTabs } from "@/features/settings/components/assistant-settings-tabs";

/**
 * Mirrors AiSettingsPage: the tab bar + sr-only title are static chrome
 * that paint instantly (like (main) PageHeader), the assistant tab shows
 * real static copy with skeletons only on DB-backed controls — no
 * full-page skeleton.
 */
export default function AiAssistantSettingsLoading() {
  return (
    <>
      <h1 className="sr-only">Customer agent</h1>
      <AssistantSettingsTabs
        assistant={<BusinessAssistantStaticFallback />}
        knowledge={<SettingsCollectionBodySkeleton />}
      />
    </>
  );
}
