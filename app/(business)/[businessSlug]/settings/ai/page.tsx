import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  BusinessAssistantStaticFallback,
  SettingsCollectionBodySkeleton,
} from "@/components/shell/settings-body-skeletons";
import { getBusinessPublicChatPath } from "@/features/businesses/routes";
import {
  createKnowledgeEntryAction,
  deleteKnowledgeFileAction,
  deleteKnowledgeEntryAction,
  retryKnowledgeFileAction,
  updateKnowledgeEntryAction,
  uploadKnowledgeFileAction,
} from "@/features/knowledge/actions";
import { KnowledgeManager } from "@/features/knowledge/components/knowledge-manager";
import { updateBusinessAgentSettingsAction } from "@/features/settings/actions";
import { AssistantSettingsTabs } from "@/features/settings/components/assistant-settings-tabs";
import { BusinessAgentSettingsForm } from "@/features/settings/components/business-agent-settings-form";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { getBusinessOperationalPageContext } from "../_lib/page-context";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Assistant",
  description:
    "Configure your public chat, its tone, business instructions, and the knowledge base both AI surfaces use.",
});

export const instant = true;

type AiSettingsPageProps = {
  params: Promise<{ businessSlug: string }>;
};

/**
 * Assistant settings page — tabbed, non-blocking structural shell.
 *
 * Matches the quote settings page (no visible page header) and splits the
 * surface into two tabs: Assistant (selected) and Knowledge base. The
 * knowledge manager used to live at /settings/knowledge-base. The tab bar
 * paints instantly; each tab body is an async server component inside its
 * own Suspense boundary. The assistant tab shows real static copy with
 * skeletons only on DB-backed controls. Selection syncs to the URL hash
 * (#assistant, #knowledge) so tabs are deep-linkable.
 */
export default function AiSettingsPage({ params }: AiSettingsPageProps) {
  return (
    <>
      <h1 className="sr-only">Assistant</h1>
      <AssistantSettingsTabs
        assistant={
          <Suspense fallback={<BusinessAssistantStaticFallback />}>
            <AssistantTab params={params} />
          </Suspense>
        }
        knowledge={
          <Suspense fallback={<SettingsCollectionBodySkeleton />}>
            <KnowledgeTab params={params} />
          </Suspense>
        }
      />
    </>
  );
}

async function AssistantTab({ params }: AiSettingsPageProps) {
  const { businessSlug } = await params;
  const { businessContext } =
    await getBusinessOperationalPageContext(businessSlug);
  const { business } = businessContext;
  const slug = business.slug;

  const settings = await getBusinessSettingsForBusiness(business.id);

  if (!settings) {
    notFound();
  }

  return (
    <BusinessAgentSettingsForm
      action={updateBusinessAgentSettingsAction.bind(null, slug)}
      chatPath={getBusinessPublicChatPath(slug)}
      key={`assistant-settings-${settings.updatedAt.getTime()}`}
      settings={settings}
    />
  );
}

async function KnowledgeTab({ params }: AiSettingsPageProps) {
  const { businessSlug } = await params;
  const { businessContext } =
    await getBusinessOperationalPageContext(businessSlug);
  const { business } = businessContext;
  const slug = business.slug;

  // Bind slug into server actions so components only receive (prevState, formData)
  const boundCreateEntry = createKnowledgeEntryAction.bind(null, slug);
  const boundUpdateEntry = updateKnowledgeEntryAction.bind(null, slug);
  const boundDeleteEntry = deleteKnowledgeEntryAction.bind(null, slug);
  const boundUploadFile = uploadKnowledgeFileAction.bind(null, slug);
  const boundDeleteFile = deleteKnowledgeFileAction.bind(null, slug);
  const boundRetryFile = retryKnowledgeFileAction.bind(null, slug);

  // The knowledge data is loaded by the tab itself when it is opened. It used
  // to be rendered with the rest of the page, so its three queries ran on
  // every visit — even for owners who only ever looked at the Assistant tab.
  return (
    <KnowledgeManager
      businessSlug={slug}
      createEntryAction={boundCreateEntry}
      deleteEntryAction={boundDeleteEntry}
      deleteFileAction={boundDeleteFile}
      retryFileAction={boundRetryFile}
      updateEntryAction={boundUpdateEntry}
      uploadFileAction={boundUploadFile}
    />
  );
}
