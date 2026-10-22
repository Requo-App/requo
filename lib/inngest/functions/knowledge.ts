import { processKnowledgeFile } from "@/features/knowledge/processing";
import { inngest } from "@/lib/inngest/client";
import {
  inngestEvents,
  type KnowledgeFileUploadedEventData,
} from "@/lib/inngest/events";

export const processKnowledgeFileUpload = inngest.createFunction(
  {
    id: "knowledge-file-uploaded",
    name: "Process uploaded knowledge file",
    triggers: [{ event: inngestEvents.knowledgeFileUploaded }],
    retries: 2,
    concurrency: {
      limit: 5,
      key: "event.data.businessId",
    },
  },
  async ({ event, step }) => {
    const data = event.data as KnowledgeFileUploadedEventData;

    return step.run("extract-chunk-embed-knowledge-file", async () => {
      const result = await processKnowledgeFile({
        businessId: data.businessId,
        fileId: data.fileId,
      });

      return result;
    });
  },
);