"use client";

import { useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  publicInquiryAttachmentAccept,
  publicInquiryAttachmentTypeError,
} from "@/features/inquiries/attachments";

export type PublicInquiryAttachmentToken = {
  /** Signed capability that binds the upload to a business. */
  token: string;
  fileName: string;
  fileSize: number;
};

type InquiryAttachmentUploaderProps = {
  businessSlug: string;
  formSlug?: string;
  id: string;
  disabled?: boolean;
  helpText: string;
  /** The uploaded file, or null when nothing is attached. */
  value: PublicInquiryAttachmentToken | null;
  onChange: (upload: PublicInquiryAttachmentToken | null) => void;
  onError: (message: string | null) => void;
  /** Change this to force the file input back to empty. */
  resetKey?: string | number;
};

type UploadResponse = {
  signedUrl: string;
  token: string;
  fileName: string;
  size: number;
};

/**
 * Uploads an inquiry attachment straight to storage.
 *
 * The file never travels through the inquiry server action: a Vercel
 * Function rejects any request body above 4.5 MB before Next.js sees it,
 * so the action could not carry the 25 MB / 50 MB plan limits. The browser
 * uploads to a signed storage URL instead, and the form carries only the
 * resulting storage path.
 */
export function InquiryAttachmentUploader({
  businessSlug,
  formSlug,
  id,
  disabled = false,
  helpText,
  value,
  onChange,
  onError,
  resetKey,
}: InquiryAttachmentUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(
    value?.fileName ?? null,
  );

  async function handleFileChange(file: File | null) {
    onError(null);

    if (!file) {
      setSelectedFileName(null);
      onChange(null);
      return;
    }

    setSelectedFileName(file.name);
    setIsUploading(true);

    try {
      const requestResponse = await fetch("/api/public/inquiry-upload", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          businessSlug,
          formSlug,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        }),
      });

      const payload = (await requestResponse.json()) as
        | UploadResponse
        | { error?: string };

      if (!requestResponse.ok || !("signedUrl" in payload)) {
        const message =
          "error" in payload && payload.error
            ? payload.error
            : publicInquiryAttachmentTypeError;

        onError(message);
        setSelectedFileName(null);
        onChange(null);
        resetInput();
        return;
      }

      const uploadResponse = await fetch(payload.signedUrl, {
        method: "PUT",
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        onError("That file could not be uploaded. Try again.");
        setSelectedFileName(null);
        onChange(null);
        resetInput();
        return;
      }

      onChange({
        token: payload.token,
        fileName: payload.fileName,
        fileSize: payload.size,
      });
    } catch {
      onError("That file could not be uploaded. Try again.");
      setSelectedFileName(null);
      onChange(null);
      resetInput();
    } finally {
      setIsUploading(false);
    }
  }

  function resetInput() {
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  function handleRemove() {
    onError(null);
    setSelectedFileName(null);
    onChange(null);
    resetInput();
  }

  return (
    <>
      <Input
        accept={publicInquiryAttachmentAccept}
        disabled={disabled || isUploading}
        id={id}
        key={resetKey}
        onChange={(event) => {
          void handleFileChange(event.currentTarget.files?.[0] ?? null);
        }}
        ref={inputRef}
        type="file"
      />
      <p className="text-xs text-muted-foreground">{helpText}</p>
      {isUploading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner />
          Uploading…
        </p>
      ) : selectedFileName ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          Selected: {selectedFileName}
          <button
            className="rounded-sm px-1 py-0.5 text-sm font-medium text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground"
            onClick={handleRemove}
            type="button"
          >
            Remove
          </button>
        </p>
      ) : null}
      {/* The form carries the signed upload token, never the file. */}
      <input name="attachment" type="hidden" value={value?.token ?? ""} />
    </>
  );
}
