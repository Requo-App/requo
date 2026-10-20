import "server-only";

import { detectCfbf } from "@file-type/cfbf";
import { FileTypeParser } from "file-type";

import {
  publicInquiryAllowedMimeTypes,
  publicInquiryExtensionToMimeType,
} from "@/features/inquiries/attachments";
import { getFileExtension } from "@/lib/files";

/** Checks object bytes against the allowed type for the signed filename. */
export async function resolveInquiryAttachmentContentType(
  bytes: Uint8Array,
  fileName: string,
): Promise<string> {
  const detected = await new FileTypeParser({
    customDetectors: [detectCfbf],
  }).fromBuffer(bytes);
  let contentType = detected?.mime;

  // Plain text has no magic bytes. Require valid UTF-8 without binary
  // control characters, and only consider it when no binary type matched.
  if (!contentType && bytes.length > 0) {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!/[\u0000-\u0008\u000e-\u001f\u007f]/.test(text)) {
      contentType = "text/plain";
    }
  }

  const expectedType = publicInquiryExtensionToMimeType[getFileExtension(fileName)];
  if (
    !contentType ||
    contentType !== expectedType ||
    !publicInquiryAllowedMimeTypes.some((allowed) => allowed === contentType)
  ) {
    throw new Error("The uploaded inquiry attachment failed validation.");
  }

  return contentType;
}
