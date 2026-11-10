import "server-only";

import { assertLogicalStorageBucket } from "./buckets";
import { getObjectStorage } from ".";

/**
 * Adapts the storage port to `serveStorageAsset`'s download callback shape.
 * The callback stays provider-neutral so the logo/avatar routes do not know
 * which storage backend is configured.
 */
export function createStorageAssetDownloader() {
  const storage = getObjectStorage();

  return async (bucket: string, path: string) => {
    try {
      const result = await storage.get({
        bucket: assertLogicalStorageBucket(bucket),
        path,
      });

      return { data: result.body, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };
}
