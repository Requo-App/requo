import { NextResponse } from "next/server";

import { getObjectStorage } from "@/lib/storage";
import { verifyStorageUploadToken } from "@/lib/storage/upload-token";

/**
 * Local-storage upload endpoint.
 *
 * The S3 and Supabase adapters hand the browser a presigned URL. Local disk
 * has no equivalent, so the local adapter signs a short-lived capability and
 * points the browser here. The token is the authorization: it names exactly
 * one bucket, path, content type, and size ceiling.
 */
export async function PUT(request: Request) {
  const token = new URL(request.url).searchParams.get("token");

  if (!token) {
    return NextResponse.json({ error: "Missing upload token." }, { status: 400 });
  }

  const payload = verifyStorageUploadToken(token);

  if (!payload) {
    return NextResponse.json(
      { error: "That upload link is invalid or has expired." },
      { status: 403 },
    );
  }

  const declaredLength = Number(
    request.headers.get("content-length") ?? "0",
  );

  if (Number.isFinite(declaredLength) && declaredLength > payload.maxBytes) {
    return NextResponse.json(
      { error: "That file is too large." },
      { status: 413 },
    );
  }

  if (!request.body) {
    return NextResponse.json(
      { error: "The upload body is empty." },
      { status: 400 },
    );
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    totalBytes += value.byteLength;

    if (totalBytes > payload.maxBytes) {
      await reader.cancel();
      return NextResponse.json(
        { error: "That file is too large." },
        { status: 413 },
      );
    }

    chunks.push(value);
  }

  if (totalBytes === 0) {
    return NextResponse.json(
      { error: "The upload body is empty." },
      { status: 400 },
    );
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const requestContentType = request.headers.get("content-type")?.split(";")[0];

  if (
    requestContentType &&
    requestContentType !== payload.contentType &&
    requestContentType !== "application/octet-stream"
  ) {
    return NextResponse.json(
      { error: "That file type does not match the upload request." },
      { status: 400 },
    );
  }

  try {
    await getObjectStorage().put({
      bucket: payload.bucket,
      path: payload.path,
      body,
      contentType: payload.contentType,
    });
  } catch (error) {
    console.error("Local storage upload failed.", error);

    return NextResponse.json(
      { error: "That file could not be stored." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
