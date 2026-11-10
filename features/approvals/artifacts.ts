import "server-only";

import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { approvalArtifacts } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { sanitizeStorageFileName, resolveSafeContentType } from "@/lib/files";
import { newEntityId } from "@/lib/ids";
import { getObjectStorage } from "@/lib/storage";
import { publicInquiryExtensionToMimeType } from "@/features/inquiries/schemas";
import { storageBuckets } from "@/lib/storage/buckets";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Approval artifacts live in the existing private bucket (no new bucket). */
export const approvalArtifactBucket = storageBuckets.businessAssets;

const maxArtifactSizeBytes = 25 * 1024 * 1024;

/**
 * Upload-then-attach flow (P1). The artifact row is immutable once created;
 * a re-upload creates a new row (new `artifactVersion`) and approvals move
 * via new versions — never an in-place edit.
 */
export async function uploadApprovalArtifactForBusiness(input: {
  businessId: string;
  uploaderUserId: string;
  file: File;
  /** Link the new row as superseding a prior artifact (navigation only). */
  supersedesArtifactId?: string | null;
  now?: Date;
}) {
  if (input.file.size <= 0 || input.file.size > maxArtifactSizeBytes) {
    throw new Error("Upload a file that is 25MB or smaller.");
  }

  // Content-type/size policy reuses the inquiry-attachment validator choke
  // point (spec §B4): same extension→MIME map, same safe fallback.
  const safeContentType = resolveSafeContentType(input.file, {
    extensionToMimeType: publicInquiryExtensionToMimeType,
    fallback: "application/octet-stream",
  });

  const now = input.now ?? new Date();
  const artifactId = newEntityId();
  const storagePath = `approvals/${input.businessId}/${artifactId}/${sanitizeStorageFileName(input.file.name, "artifact")}`;

  const buffer = Buffer.from(await input.file.arrayBuffer());
  const sha256 = createHash("sha256").update(buffer).digest("hex");

  await getObjectStorage().put({
    bucket: approvalArtifactBucket,
    path: storagePath,
    body: new Uint8Array(buffer),
    contentType: safeContentType,
  });

  let artifactVersion = 1;

  if (input.supersedesArtifactId) {
    const [prior] = await db
      .select({ artifactVersion: approvalArtifacts.artifactVersion })
      .from(approvalArtifacts)
      .where(
        and(
          eq(approvalArtifacts.id, input.supersedesArtifactId),
          eq(approvalArtifacts.businessId, input.businessId),
        ),
      )
      .limit(1);

    if (!prior) throw new Error("Prior artifact not found.");
    artifactVersion = prior.artifactVersion + 1;
  }

  const [row] = await db
    .insert(approvalArtifacts)
    .values({
      id: artifactId,
      businessId: input.businessId,
      uploaderUserId: input.uploaderUserId,
      storagePath,
      contentType: safeContentType,
      sizeBytes: input.file.size,
      artifactVersion,
      sha256,
      supersededByArtifactId: null,
      createdAt: now,
    })
    .returning();

  if (input.supersedesArtifactId) {
    // Navigation-only pointer on the old row; the old row itself is untouched
    // (no timestamp/content mutation) — history preserved.
    await db
      .update(approvalArtifacts)
      .set({ supersededByArtifactId: artifactId })
      .where(
        and(
          eq(approvalArtifacts.id, input.supersedesArtifactId),
          eq(approvalArtifacts.businessId, input.businessId),
        ),
      );
  }

  return row;
}

export async function getApprovalArtifactForBusiness(
  tx: DatabaseTransaction,
  input: { businessId: string; artifactId: string },
) {
  const [row] = await tx
    .select()
    .from(approvalArtifacts)
    .where(
      and(
        eq(approvalArtifacts.id, input.artifactId),
        eq(approvalArtifacts.businessId, input.businessId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Token-scoped artifact content for the customer page. Access is granted
 * through the approval token route only — never a public bucket URL. The
 * route streams the bytes, which keeps the behavior identical for Supabase,
 * S3, and local storage (local disk has no signed URL).
 */
export async function getApprovalArtifactContent(input: {
  storagePath: string;
}) {
  return getObjectStorage().get({
    bucket: approvalArtifactBucket,
    path: input.storagePath,
  });
}
