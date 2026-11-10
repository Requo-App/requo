import "server-only";

import { env } from "@/lib/env";
import { LocalObjectStorage } from "./local";
import { S3ObjectStorage } from "./s3";
import { SupabaseObjectStorage } from "./supabase";
import type { ObjectStorage, StorageDriver } from "./types";

export type { ObjectStorage, StorageDriver } from "./types";
export { toArrayBuffer } from "./types";
export { storageBuckets } from "./buckets";
export type { LogicalStorageBucket } from "./buckets";

let resolved: ObjectStorage | null = null;

/**
 * Resolve the storage driver.
 *
 * Explicit `REQUO_STORAGE_DRIVER` wins. Otherwise keep the historical
 * Supabase behavior when credentials exist, and fall back to local disk so a
 * fresh community install boots without Supabase.
 */
export function getStorageDriver(): StorageDriver {
  if (env.REQUO_STORAGE_DRIVER) {
    return env.REQUO_STORAGE_DRIVER;
  }

  return env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
    ? "supabase"
    : "local";
}

export function getObjectStorage(): ObjectStorage {
  if (resolved) {
    return resolved;
  }

  const driver = getStorageDriver();

  switch (driver) {
    case "supabase":
      resolved = new SupabaseObjectStorage();
      break;
    case "s3":
      resolved = new S3ObjectStorage();
      break;
    case "local":
      resolved = new LocalObjectStorage();
      break;
  }

  return resolved;
}
