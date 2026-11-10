/**
 * Logical storage buckets.
 *
 * These names are part of the product contract (database rows and upload
 * paths persist them), not provider configuration. Each adapter maps them to
 * its own physical namespace:
 *
 * - Supabase: a bucket with the same name.
 * - S3: `S3_PREFIX/<bucket>/...` inside the configured bucket.
 * - local: `<LOCAL_STORAGE_ROOT>/<bucket>/...`.
 */
export const storageBuckets = {
  businessAssets: "business-assets",
  inquiryAttachments: "inquiry-attachments",
  knowledgeFiles: "knowledge-files",
  profileAssets: "profile-assets",
} as const;

export type LogicalStorageBucket =
  (typeof storageBuckets)[keyof typeof storageBuckets];

/**
 * Per-bucket hard ceilings, in bytes. Feature paths validate the plan-specific
 * limit first; these values protect the backing store when a presigned URL is
 * used directly by a browser.
 */
export const storageBucketLimits: Record<LogicalStorageBucket, number> = {
  [storageBuckets.businessAssets]: 25 * 1024 * 1024,
  [storageBuckets.inquiryAttachments]: 50 * 1024 * 1024,
  [storageBuckets.knowledgeFiles]: 5 * 1024 * 1024,
  [storageBuckets.profileAssets]: 5 * 1024 * 1024,
};

export const logicalStorageBuckets = Object.values(
  storageBuckets,
) as LogicalStorageBucket[];

export function isLogicalStorageBucket(
  value: string,
): value is LogicalStorageBucket {
  return (logicalStorageBuckets as readonly string[]).includes(value);
}

export function assertLogicalStorageBucket(
  value: string,
): LogicalStorageBucket {
  if (!isLogicalStorageBucket(value)) {
    throw new Error(`Unknown storage bucket: ${value}`);
  }

  return value;
}
