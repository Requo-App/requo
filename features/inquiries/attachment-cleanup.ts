import "server-only";

import { inArray } from "drizzle-orm";

import {
  publicInquiryAttachmentBucket,
  publicInquiryAttachmentUploadRoot,
} from "@/features/inquiries/attachments";
import { db } from "@/lib/db/client";
import { inquiryAttachments } from "@/lib/db/schema";
import { getObjectStorage } from "@/lib/storage";

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

/** Upper bound on objects examined in one run, so the sweep stays quick. */
const maxObjectsPerRun = 1000;

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
    const storage = getObjectStorage();
    const cutoff = Date.now() - orphanCutoffMs;

    // Every adapter returns a flat list for a prefix. Supabase walks nested
    // folders; S3 and local return the flattened keys. The sweeper therefore
    // does not need provider-specific folder pagination.
    const objects = await storage.list({
      bucket: publicInquiryAttachmentBucket,
      prefix: `${publicInquiryAttachmentUploadRoot}/`,
      recursive: true,
      limit: maxObjectsPerRun,
    });

    const candidatePaths = objects
      .filter((object) => {
        if (!object.createdAt) {
          return false;
        }

        return object.createdAt.getTime() <= cutoff;
      })
      .map((object) => object.path);

    if (!candidatePaths.length) {
      return summary;
    }

    const attachedRows = await db
      .select({ storagePath: inquiryAttachments.storagePath })
      .from(inquiryAttachments)
      .where(inArray(inquiryAttachments.storagePath, candidatePaths));

    const attachedPaths = new Set(attachedRows.map((row) => row.storagePath));
    const orphanPaths = candidatePaths.filter(
      (path) => !attachedPaths.has(path),
    );

    summary.scanned = candidatePaths.length;

    if (!orphanPaths.length) {
      return summary;
    }

    await storage.deleteMany({
      bucket: publicInquiryAttachmentBucket,
      paths: orphanPaths,
    });

    summary.removed = orphanPaths.length;
    summary.removedPaths = orphanPaths;

    return summary;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
    summary.errors = errors;

    return summary;
  }
}
