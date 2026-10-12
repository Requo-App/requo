type FileLike = {
  name: string;
  type?: string | null;
};

type AcceptedFileTypeOptions = {
  allowedExtensions: readonly string[];
  allowedMimeTypes?: readonly string[];
};

type ResolveSafeContentTypeOptions = {
  extensionToMimeType?: Readonly<Record<string, string>>;
  allowedMimeTypes?: readonly string[];
  fallback?: string;
};

function normalizeMimeType(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

export function getFileExtension(fileName: string) {
  const normalizedFileName = fileName.toLowerCase();
  const lastDotIndex = normalizedFileName.lastIndexOf(".");

  if (lastDotIndex === -1) {
    return "";
  }

  return normalizedFileName.slice(lastDotIndex);
}

export function sanitizeStorageFileName(fileName: string, fallback = "file") {
  const normalized = fileName
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return normalized.slice(0, 120) || fallback;
}

export function isAcceptedFileType(
  file: FileLike,
  { allowedExtensions, allowedMimeTypes = [] }: AcceptedFileTypeOptions,
) {
  const extension = getFileExtension(file.name);

  if (!allowedExtensions.some((allowedExtension) => allowedExtension === extension)) {
    return false;
  }

  const normalizedMimeType = normalizeMimeType(file.type);

  if (!normalizedMimeType || normalizedMimeType === "application/octet-stream") {
    return true;
  }

  return allowedMimeTypes.some(
    (allowedMimeType) => normalizeMimeType(allowedMimeType) === normalizedMimeType,
  );
}

export function resolveSafeContentType(
  file: FileLike,
  {
    extensionToMimeType = {},
    allowedMimeTypes = [],
    fallback = "application/octet-stream",
  }: ResolveSafeContentTypeOptions = {},
) {
  const extension = getFileExtension(file.name);
  const mappedContentType = extensionToMimeType[extension];

  if (mappedContentType) {
    return mappedContentType;
  }

  const normalizedMimeType = normalizeMimeType(file.type);

  if (
    normalizedMimeType &&
    allowedMimeTypes.some(
      (allowedMimeType) => normalizeMimeType(allowedMimeType) === normalizedMimeType,
    )
  ) {
    return normalizedMimeType;
  }

  return fallback;
}

export function buildContentDisposition(
  fileName: string,
  dispositionType: "attachment" | "inline" = "attachment",
) {
  const fallbackFileName = sanitizeStorageFileName(fileName, "download");
  const encodedFileName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${dispositionType}; filename="${fallbackFileName}"; filename*=UTF-8''${encodedFileName}`;
}


/**
 * Builds cache-control and ETag headers for private asset responses.
 *
 * When the request URL contains a cache-busting query param (e.g. `?v=...`),
 * the asset is treated as immutable for up to 1 year because a new version of
 * the asset gets a different URL. Without a cache buster we use a short cache
 * with stale-while-revalidate so updates propagate quickly.
 */
export function getAssetCacheHeaders(input: {
  request: Request;
  etagSeed: string;
}): { "cache-control": string; etag: string } {
  const url = new URL(input.request.url);
  const hasCacheBuster = url.searchParams.has("v");

  // Build a deterministic short etag without requiring node:crypto on the edge.
  let hash = 0;
  for (let i = 0; i < input.etagSeed.length; i++) {
    hash = (hash * 31 + input.etagSeed.charCodeAt(i)) | 0;
  }
  const etag = `"${Math.abs(hash).toString(36)}"`;

  return {
    "cache-control": hasCacheBuster
      ? "private, max-age=31536000, immutable"
      : "private, max-age=300, stale-while-revalidate=86400",
    etag,
  };
}

/**
 * Returns a 304 Not Modified response when the request's If-None-Match header
 * matches the resource's ETag. Returns null if a fresh response should be
 * returned.
 */
export function getNotModifiedResponse(
  request: Request,
  etag: string,
): Response | null {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, {
      status: 304,
      headers: { etag },
    });
  }
  return null;
}

export function notFoundResponse(message = "Not found"): Response {
  return new Response(message, {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export type ServeStorageAssetInput = {
  request: Request;
  bucket: string;
  storagePath: string | null | undefined;
  contentType?: string | null;
  download: (
    bucket: string,
    path: string,
  ) => Promise<{ data: Blob | null; error: unknown }>;
  fallbackFileName: string;
  notFoundMessage?: string;
};

/**
 * Single storage-download + 304 + inline-disposition helper (was copy-pasted
 * across business/logo, [slug]/logo, account/avatar, public logo).
 */
export async function serveStorageAsset(
  input: ServeStorageAssetInput,
): Promise<Response> {
  if (!input.storagePath) return notFoundResponse(input.notFoundMessage);

  const cacheHeaders = getAssetCacheHeaders({
    request: input.request,
    etagSeed: input.storagePath,
  });
  const notModified = getNotModifiedResponse(
    input.request,
    cacheHeaders.etag,
  );
  if (notModified) return notModified;

  const { data, error } = await input.download(
    input.bucket,
    input.storagePath,
  );
  if (error || !data) {
    console.error("Failed to download asset from storage.", error);
    return notFoundResponse(input.notFoundMessage);
  }

  return new Response(data, {
    headers: {
      ...cacheHeaders,
      "content-disposition": buildContentDisposition(
        input.storagePath.split("/").pop() ?? input.fallbackFileName,
        "inline",
      ),
      "content-type": input.contentType ?? "application/octet-stream",
      "x-content-type-options": "nosniff",
    },
  });
}
