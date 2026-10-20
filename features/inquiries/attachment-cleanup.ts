import "server-only";

import { inArray } from "drizzle-orm";

import {
  publicInquiryAttachmentBucket,
  publicInquiryAttachmentUploadRoot,
} from "@/features/inquiries/attachments";
import { db } from "@/lib/db/client";
import { inquiryAttachments } from "@/lib/db/schema";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Removes inquiry attachment uploads that were never attached to an inquiry.
 *
 * The file is uploaded to storage before the inquiry is submitted, so a
 * visitor who uploads and then abandons the form leaves an object behind.
 * Without a sweeper those objects accumulate and cost storage.
 *
 * An object is kept when an `inquiry_attachments` row points at it, and
 * removed only once it is older than the cutoff — that gives a slow
 * submission time to attach the file it already uploaded.
 */

const orphanCutoffMs = 24 * 60 * 60 * 1000;

/** Upper bound on the folders examined in one run, so the sweep stays quick. */
const maxFoldersPerRun = 50;

export type InquiryAttachmentCleanupSummary = {
  scanned: number;
  removed: number;
  removedPaths: string[];
  errors?: string[];
};

export async function cleanupOrphanedInquiryAttachments(): Promise<InquiryAttachmentCleanupSummary> {
  const summary: InquiryAttachmentCleanupSummary = {
    scanned: 0,
    removed: 0,
    removedPaths: [],
  };
  const errors: string[] = [];

  try {
    const storage = createSupabaseAdminClient().storage.from(
      publicInquiryAttachmentBucket,
    );

    const { data: folders, error: listError } = await storage.list(
      publicInquiryAttachmentUploadRoot,
    );

    if (listError) {
      throw new Error(listError.message);
    }

    const cutoff = Date.now() - orphanCutoffMs;
    const candidatePaths: string[] = [];

    for (const folder of folders ?? []) {
      if (candidatePaths.length >= maxFoldersPerRun) {
        break;
      }

      const folderPath = `${publicInquiryAttachmentUploadRoot}/${folder.name}`;
      const { data: files, error: filesError } = await storage.list(folderPath);

      if (filesError) {
        errors.push(`${folderPath}: ${filesError.message}`);
        continue;
      }

      for (const file of files ?? []) {
        const createdAt = file.created_at
          ? new Date(file.created_at).getTime()
          : Number.POSITIVE_INFINITY;

        if (createdAt > cutoff) {
          continue;
        }

        candidatePaths.push(`${folderPath}/${file.name}`);
      }
    }

    if (!candidatePaths.length) {
      return summary;
    }

    const attachedRows = await db
      .select({ storagePath: inquiryAttachments.storagePath })
      .from(inquiryAttachments)
      .where(inArray(inquiryAttachments.storagePath, candidatePaths));

    const attachedPaths = new Set(
      attachedRows.map((row) => row.storagePath),
    );
    const orphanPaths = candidatePaths.filter(
      (path) => !attachedPaths.has(path),
    );

    summary.scanned = candidatePaths.length;

    if (!orphanPaths.length) {
      return summary;
    }

    const { error: removeError } = await storage.remove(orphanPaths);

    if (removeError) {
      throw new Error(removeError.message);
    }

    summary.removed = orphanPaths.length;
    summary.removedPaths = orphanPaths;

    return summary;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    summary.errors = errors;

    return summary;
  }
}
