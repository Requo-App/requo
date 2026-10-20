/**
 * Public inquiry attachment contract.
 *
 * Attachments are uploaded **directly to storage** through a signed upload
 * URL, not through the inquiry server action. A Vercel Function rejects
 * any request body above 4.5 MB with `413 FUNCTION_PAYLOAD_TOO_LARGE`
 * before Next.js ever sees it, so a file inside the action's `FormData` can
 * never reach the advertised 25 MB / 50 MB plan limits. Sending the file
 * straight to storage also keeps large uploads out of the function's
 * memory.
 *
 * The flow is:
 *
 * 1. The client asks `POST /api/public/inquiry-upload` for a signed URL and
 *    a signed upload token.
 * 2. The client uploads the file to storage, bypassing the function body.
 * 3. The client submits the upload token with the inquiry.
 * 4. The server verifies the token, checks the file against the plan, and
 *    confirms the object really exists in storage.
 *
 * The token is what binds an upload to a business: the client never names
 * a storage path.
 *
 * This module is imported by both the client components and the server
 * code, so it must stay free of server-only imports.
 */

import {
  getFileExtension,
  isAcceptedFileType,
  sanitizeStorageFileName,
} from "@/lib/files";
import { getPublicInquiryAttachmentMaxBytes } from "@/features/inquiries/plan-rules";

export const publicInquiryAttachmentBucket = "inquiry-attachments";

export const publicInquiryAllowedExtensions = [
  ".pdf",
  ".doc",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".txt",
] as const;

export const publicInquiryAllowedMimeTypes = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

export const publicInquiryExtensionToMimeType: Record<string, string> = {
  ".pdf": "application/pdf",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

export const publicInquiryAttachmentAccept = [
  ...publicInquiryAllowedExtensions,
  ...publicInquiryAllowedMimeTypes,
].join(",");

export const publicInquiryMaxAttachmentSize =
  getPublicInquiryAttachmentMaxBytes("free");

/** Message shown when a file is not an accepted type. */
export const publicInquiryAttachmentTypeError =
  "Upload a PDF, common document file, or image.";

/** An attachment that has already been uploaded to storage. */
export type PublicInquiryAttachmentUpload = {
  /** Storage path of the uploaded object. */
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
};

/** Root folder for uploaded inquiry attachments. */
export const publicInquiryAttachmentUploadRoot = "uploads";

/**
 * Storage path for an uploaded file.
 *
 * The upload id is server-issued and unique, so two uploads never collide.
 * The business is not part of the path — the signed token carries it.
 */
export function buildPublicInquiryAttachmentUploadPath({
  uploadId,
  fileName,
}: {
  uploadId: string;
  fileName: string;
}) {
  return `${publicInquiryAttachmentUploadRoot}/${uploadId}/${sanitizeStorageFileName(
    fileName,
    "attachment",
  )}`;
}

/**
 * Validates an uploaded attachment against the plan.
 *
 * The size here is the one the client reported, and it is a fast pre-check
 * only — the authoritative size is the one storage reports for the object.
 */
export function validatePublicInquiryAttachmentUpload({
  fileName,
  fileSize,
  maxBytes,
}: {
  fileName: string;
  fileSize: number;
  maxBytes: number;
}):
  | { ok: true; attachment: PublicInquiryAttachmentUpload }
  | { ok: false; error: string } {
  if (
    !isAcceptedFileType(
      { name: fileName, type: null },
      {
        allowedExtensions: publicInquiryAllowedExtensions,
        allowedMimeTypes: publicInquiryAllowedMimeTypes,
      },
    )
  ) {
    return { ok: false, error: publicInquiryAttachmentTypeError };
  }

  if (!Number.isFinite(fileSize) || fileSize <= 0) {
    return { ok: false, error: "That file is empty. Choose a different one." };
  }

  if (fileSize > maxBytes) {
    return {
      ok: false,
      error: `Upload a file that is ${formatAttachmentBytes(maxBytes)} or smaller.`,
    };
  }

  const extension = getFileExtension(fileName);

  return {
    ok: true,
    attachment: {
      storagePath: "",
      fileName: fileName.slice(0, 255),
      fileSize,
      contentType:
        publicInquiryExtensionToMimeType[extension] ??
        "application/octet-stream",
    },
  };
}

export function formatAttachmentBytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
