import { SettingsCollectionBodySkeleton } from "@/components/shell/settings-body-skeletons";

/**
 * Mirrors BusinessWorkflowSettingsPage: the same fallback the page's
 * Suspense boundary uses, so the shell and the resolved page agree.
 */
export default function BusinessWorkflowSettingsLoading() {
  return <SettingsCollectionBodySkeleton />;
}
