"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  KNOWLEDGE_FILE_MAX_BYTES,
} from "@/features/memory/types";
import {
  knowledgeFileUploadSchema,
  memoryEntryInputSchema,
  memoryEntryUpdateSchema,
} from "@/features/memory/schemas";
import {
  createBusinessMemory,
  deleteBusinessMemory,
  updateBusinessMemory,
} from "@/features/memory/mutations";
import { processKnowledgeFile, deleteKnowledgeFileForBusiness, KNOWLEDGE_FILES_BUCKET } from "@/features/memory/processing";
import { countBusinessKnowledgeSources } from "@/features/memory/queries";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { hasFeatureAccess } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { sanitizeMemoryContent } from "@/lib/ai/input-sanitizer";
import { logAiSecurityEvent } from "@/lib/ai/security-events";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getFileExtension, resolveSafeContentType } from "@/lib/files";
import { KNOWLEDGE_FILE_ACCEPT } from "@/features/memory/types";
import { db } from "@/lib/db/client";
import { businessKnowledgeFiles } from "@/lib/db/schema";
import { getBusinessMemoryCacheTags, updateCacheTags } from "@/lib/cache/business-tags";
import { inngest } from "@/lib/inngest/client";
import { inngestEvents } from "@/lib/inngest/events";
import { newEntityId } from "@/lib/ids";
import { firstString } from "@/lib/zod-helpers";

// ---------------------------------------------------------------------------
// Action state types
// ---------------------------------------------------------------------------

export type MemoryEntryActionState = {
  error?: string;
  success?: string;
  fieldErrors?: {
    title?: string[];
    content?: string[];
    category?: string[];
  };
};

export type KnowledgeFileActionState = {
  error?: string;
  success?: string;
  fileId?: string;
  status?: string;
};

export type KnowledgeFileDeleteActionState = {
  error?: string;
  success?: boolean;
};

function invalidateKnowledgeCache(businessId: string) {
  updateCacheTags(getBusinessMemoryCacheTags(businessId));
}

// ---------------------------------------------------------------------------
// Manual memory entries
// ---------------------------------------------------------------------------

export async function createMemoryEntryAction(
  businessSlug: string,
  prevState: MemoryEntryActionState,
  formData: FormData,
): Promise<MemoryEntryActionState> {
  void prevState;

  const actionContext = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return { error: actionContext.error };
  }

  if (
    !hasFeatureAccess(
      actionContext.businessContext.business.plan,
      "knowledgeBase",
    )
  ) {
    return { error: "Your plan does not include a knowledge base." };
  }

  const parsed = memoryEntryInputSchema.safeParse({
    title: firstString(formData.get("title")),
    content: firstString(formData.get("content")),
    category: firstString(formData.get("category")) ?? undefined,
  });

  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as MemoryEntryActionState["fieldErrors"],
    };
  }

  // Sanitize memory content against prompt-injection before persistence.
  const sanitization = sanitizeMemoryContent(
    parsed.data.title,
    parsed.data.content,
  );

  if (sanitization.status === "rejected") {
    logAiSecurityEvent({
      eventType: "injection_rejected",
      patternMatched: sanitization.patterns.join(", "),
      userId: actionContext.user.id,
      businessId: actionContext.businessContext.business.id,
      rawInput: `${parsed.data.title}\n${parsed.data.content}`.slice(0, 200),
    });

    return {
      error: "That content could not be saved. Remove instruction-style text and try again.",
    };
  }

  const businessId = actionContext.businessContext.business.id;
  const plan = actionContext.businessContext.business.plan;
  const limit = getUsageLimit(plan, "knowledgeSourcesPerBusiness");

  if (limit !== null) {
    const current = await countBusinessKnowledgeSources(businessId);
    if (current >= limit) {
      return {
        error: `This plan supports ${limit} knowledge sources. Remove a source or upgrade to add another.`,
      };
    }
  }

  try {
    await createBusinessMemory({
      businessId,
      entry: {
        title: sanitization.output || parsed.data.title,
        content: sanitization.output || parsed.data.content,
        category: parsed.data.category,
      },
    });

    return { success: "Knowledge entry saved." };
  } catch (error) {
    console.error("Failed to create memory entry.", error);
    return { error: "We couldn't save that entry right now." };
  }
}

export async function updateMemoryEntryAction(
  businessSlug: string,
  memoryId: string,
  prevState: MemoryEntryActionState,
  formData: FormData,
): Promise<MemoryEntryActionState> {
  void prevState;

  const actionContext = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return { error: actionContext.error };
  }

  if (
    !hasFeatureAccess(
      actionContext.businessContext.business.plan,
      "knowledgeBase",
    )
  ) {
    return { error: "Your plan does not include a knowledge base." };
  }

  const parsed = memoryEntryInputSchema.safeParse({
    title: firstString(formData.get("title")),
    content: firstString(formData.get("content")),
    category: firstString(formData.get("category")) ?? undefined,
  });

  if (!parsed.success) {
    return {
      error: "Check the highlighted fields and try again.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as MemoryEntryActionState["fieldErrors"],
    };
  }

  const sanitization = sanitizeMemoryContent(
    parsed.data.title,
    parsed.data.content,
  );

  if (sanitization.status === "rejected") {
    logAiSecurityEvent({
      eventType: "injection_rejected",
      patternMatched: sanitization.patterns.join(", "),
      userId: actionContext.user.id,
      businessId: actionContext.businessContext.business.id,
      rawInput: `${parsed.data.title}\n${parsed.data.content}`.slice(0, 200),
    });

    return {
      error: "That content could not be saved. Remove instruction-style text and try again.",
    };
  }

  try {
    const result = await updateBusinessMemory({
      businessId: actionContext.businessContext.business.id,
      memoryId,
      update: {
        title: sanitization.output || parsed.data.title,
        content: sanitization.output || parsed.data.content,
        category: parsed.data.category,
      },
    });

    if (!result) {
      return { error: "That knowledge entry could not be found." };
    }

    return { success: "Knowledge entry updated." };
  } catch (error) {
    console.error("Failed to update memory entry.", error);
    return { error: "We couldn't save that entry right now." };
  }
}

export async function deleteMemoryEntryAction(
  businessSlug: string,
  memoryId: string,
): Promise<MemoryEntryActionState> {
  const actionContext = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return { error: actionContext.error };
  }

  try {
    const result = await deleteBusinessMemory({
      businessId: actionContext.businessContext.business.id,
      memoryId,
    });

    if (!result) {
      return { error: "That knowledge entry could not be found." };
    }

    return { success: "Knowledge entry deleted." };
  } catch (error) {
    console.error("Failed to delete memory entry.", error);
    return { error: "We couldn't delete that entry right now." };
  }
}

// ---------------------------------------------------------------------------
// Knowledge files
// ---------------------------------------------------------------------------

const KNOWLEDGE_EXTENSION_TO_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
};

const KNOWLEDGE_ALLOWED_MIME_TYPES: readonly string[] = KNOWLEDGE_FILE_ACCEPT;

function isPdfMagicBytes(content: ArrayBuffer | Uint8Array): boolean {
  const bytes =
    content instanceof Uint8Array
      ? content
      : new Uint8Array(content.slice(0, 5));
  const head = bytes.slice(0, 5);
  return (
    head.length >= 4 &&
    head[0] === 0x25 && // %
    head[1] === 0x50 && // P
    head[2] === 0x44 && // D
    head[3] === 0x46 // F
  );
}

function looksLikeHtmlOrSvg(content: ArrayBuffer | Uint8Array): boolean {
  const bytes =
    content instanceof Uint8Array ? content : new Uint8Array(content);
  const sample = Buffer.from(bytes.slice(0, 512)).toString("utf8").trimStart().toLowerCase();
  return (
    sample.startsWith("<!doctype html") ||
    sample.startsWith("<html") ||
    sample.startsWith("<script") ||
    sample.startsWith("<svg")
  );
}

export async function uploadKnowledgeFileAction(
  businessSlug: string,
  prevState: KnowledgeFileActionState,
  formData: FormData,
): Promise<KnowledgeFileActionState> {
  void prevState;

  const actionContext = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return { error: actionContext.error };
  }

  if (
    !hasFeatureAccess(
      actionContext.businessContext.business.plan,
      "knowledgeBase",
    )
  ) {
    return { error: "Your plan does not include a knowledge base." };
  }

  const file = firstString(formData.get("file"));

  if (!(file instanceof File)) {
    return { error: "Choose a file to upload." };
  }

  if (file.size > KNOWLEDGE_FILE_MAX_BYTES) {
    return { error: "Files must be 5 MB or smaller." };
  }

  const parsed = knowledgeFileUploadSchema.safeParse({
    fileName: file.name,
    mimeType: file.type,
    byteSize: file.size,
    content: await file.arrayBuffer(),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return { error: firstIssue?.message ?? "Check the file and try again." };
  }

  // Validate by final extension only (anchored, case-insensitive).
  // Rejects double extensions like `evil.pdf.exe` because the final
  // extension `.exe` is not allowlisted.
  const finalExtension = getFileExtension(parsed.data.fileName);

  if (!finalExtension || !(finalExtension in KNOWLEDGE_EXTENSION_TO_MIME)) {
    return {
      error: "This file type is not supported. Use PDF, CSV, TXT, or Markdown.",
    };
  }

  // Derive storage content type from the extension, never from client MIME.
  const safeContentType = resolveSafeContentType(
    { name: parsed.data.fileName, type: parsed.data.mimeType },
    {
      extensionToMimeType: KNOWLEDGE_EXTENSION_TO_MIME,
      allowedMimeTypes: KNOWLEDGE_ALLOWED_MIME_TYPES,
      fallback: "application/octet-stream",
    },
  );

  // Magic-byte / content sniffing: PDFs must start with %PDF; text types
  // must not be disguised HTML/SVG/script payloads.
  if (finalExtension === ".pdf") {
    if (!isPdfMagicBytes(parsed.data.content)) {
      return {
        error: "That file does not look like a valid PDF.",
      };
    }
  } else if (looksLikeHtmlOrSvg(parsed.data.content)) {
    return {
      error: "HTML files are not supported. Use PDF, CSV, TXT, or Markdown.",
    };
  }

  const businessId = actionContext.businessContext.business.id;
  const plan = actionContext.businessContext.business.plan;
  const limit = getUsageLimit(plan, "knowledgeSourcesPerBusiness");

  if (limit !== null) {
    const current = await countBusinessKnowledgeSources(businessId);
    if (current >= limit) {
      return {
        error: `This plan supports ${limit} knowledge sources. Remove a source or upgrade to add another.`,
      };
    }
  }

  const fileId = newEntityId();
  const extension = finalExtension;
  const storagePath = `${businessId}/${fileId}${extension.toLowerCase()}`;

  try {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage
      .from(KNOWLEDGE_FILES_BUCKET)
      .upload(storagePath, parsed.data.content, {
        contentType: safeContentType,
        upsert: false,
      });

    if (error) {
      console.error("Failed to upload knowledge file to storage.", error);
      return { error: "We couldn't upload that file right now." };
    }

    await db.insert(businessKnowledgeFiles).values({
      id: fileId,
      businessId,
      originalFileName: parsed.data.fileName,
      storagePath,
      mimeType: safeContentType,
      byteSize: parsed.data.byteSize,
      status: "pending",
    });

    invalidateKnowledgeCache(businessId);

    // Fire-and-forget processing; failures surface as file status.
    await inngest.send({
      name: inngestEvents.knowledgeFileUploaded,
      data: { businessId, fileId },
    });
  } catch (error) {
    console.error("Failed to create knowledge file row.", error);

    // Best-effort cleanup of the uploaded object.
    try {
      const supabase = createSupabaseAdminClient();
      await supabase.storage.from(KNOWLEDGE_FILES_BUCKET).remove([storagePath]);
    } catch {
      // Ignore cleanup failures.
    }

    return { error: "We couldn't upload that file right now." };
  }

  return {
    success: "File uploaded and processing will start shortly.",
    fileId,
    status: "pending",
  };
}

export async function deleteKnowledgeFileAction(
  businessSlug: string,
  fileId: string,
): Promise<KnowledgeFileDeleteActionState> {
  const actionContext = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return { error: actionContext.error };
  }

  try {
    const result = await deleteKnowledgeFileForBusiness({
      businessId: actionContext.businessContext.business.id,
      fileId,
    });

    if (!result) {
      return { error: "That file could not be found." };
    }

    return { success: true };
  } catch (error) {
    console.error("Failed to delete knowledge file.", error);
    return { error: "We couldn't delete that file right now." };
  }
}

export async function retryKnowledgeFileAction(
  businessSlug: string,
  fileId: string,
): Promise<KnowledgeFileActionState> {
  const actionContext = await getBusinessActionContext({
    businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return { error: actionContext.error };
  }

  const businessId = actionContext.businessContext.business.id;

  const [fileRow] = await db
    .select({ id: businessKnowledgeFiles.id })
    .from(businessKnowledgeFiles)
    .where(
      and(
        eq(businessKnowledgeFiles.id, fileId),
        eq(businessKnowledgeFiles.businessId, businessId),
      ),
    )
    .limit(1);

  if (!fileRow) {
    return { error: "That file could not be found." };
  }

  try {
    const result = await processKnowledgeFile({ businessId, fileId });

    if (!result.ok) {
      return { error: result.failureReason };
    }

    invalidateKnowledgeCache(businessId);

    return { success: "File processed successfully.", fileId, status: "ready" };
  } catch (error) {
    console.error("Failed to retry knowledge file processing.", error);
    return { error: "We couldn't process that file right now." };
  }
}