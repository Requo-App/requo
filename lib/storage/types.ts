import type { LogicalStorageBucket } from "./buckets";

export const storageDrivers = ["supabase", "s3", "local"] as const;
export type StorageDriver = (typeof storageDrivers)[number];

export type StorageObject = {
  /** Full logical path inside the bucket (no bucket prefix). */
  path: string;
  name: string;
  size: number | null;
  contentType: string | null;
  createdAt: Date | null;
};

export type StorageHead = {
  size: number;
  contentType: string | null;
};

export type StorageReadResult = {
  body: Uint8Array;
  contentType: string | null;
  size: number;
};

/**
 * Copy storage bytes into a plain ArrayBuffer, which is a valid `BodyInit`.
 * A `Uint8Array` view is not accepted by the DOM `Response` types, and its
 * buffer may be a `SharedArrayBuffer`, so copy rather than cast.
 */
export function toArrayBuffer(body: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(body.byteLength);
  copy.set(body);
  return copy.buffer;
}

/**
 * A browser-facing upload target.
 *
 * Every adapter returns a URL and the request shape the browser must use.
 * Supabase and S3 return a presigned target; the local adapter returns an app
 * route guarded by a short-lived signed token.
 */
export type StorageUploadTarget = {
  url: string;
  method: "PUT" | "POST";
  headers?: Record<string, string>;
  /** Multipart form fields required by a presigned POST target. */
  fields?: Record<string, string>;
};

export type CreateStorageUploadTargetInput = {
  bucket: LogicalStorageBucket;
  path: string;
  contentType: string;
  maxBytes: number;
  expiresInSeconds: number;
};

export type PutStorageObjectInput = {
  bucket: LogicalStorageBucket;
  path: string;
  body: Uint8Array;
  contentType: string;
};

export type StorageObjectRef = {
  bucket: LogicalStorageBucket;
  path: string;
};

export type ListStorageObjectsInput = {
  bucket: LogicalStorageBucket;
  prefix?: string;
  /** Walk nested folders. Defaults to true. */
  recursive?: boolean;
  limit?: number;
};

/**
 * The storage boundary. Feature code owns authorization, validation, and
 * limits; adapters only read and write bytes.
 */
export interface ObjectStorage {
  readonly driver: StorageDriver;
  createUploadTarget(
    input: CreateStorageUploadTargetInput,
  ): Promise<StorageUploadTarget>;
  put(input: PutStorageObjectInput): Promise<void>;
  head(input: StorageObjectRef): Promise<StorageHead | null>;
  get(input: StorageObjectRef): Promise<StorageReadResult>;
  delete(input: StorageObjectRef): Promise<void>;
  deleteMany(input: {
    bucket: LogicalStorageBucket;
    paths: string[];
  }): Promise<void>;
  list(input: ListStorageObjectsInput): Promise<StorageObject[]>;
  /** Throws when the adapter cannot reach its backing store. */
  ping(): Promise<void>;
}
