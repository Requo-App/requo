/**
 * scripts/setup-storage.ts
 *
 * Idempotent storage setup for the selected driver.
 *
 * Supabase-hosted projects historically created their buckets through
 * migrations. New installs (and forks using S3 or local disk) can provision
 * their storage explicitly instead:
 *
 *   npm run storage:setup
 *
 * The command does not copy existing objects. Logical paths are already
 * provider-neutral, so a backend switch only needs a one-time object copy.
 */
import "./load-env";

import { createClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { getObjectStorage, getStorageDriver } from "@/lib/storage";
import {
  logicalStorageBuckets,
  storageBucketLimits,
} from "@/lib/storage/buckets";

async function setupSupabase() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase Storage requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const client = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data, error } = await client.storage.listBuckets();

  if (error) {
    throw new Error(`Could not list Supabase buckets: ${error.message}`);
  }

  const existing = new Set((data ?? []).map((bucket) => bucket.id));

  for (const bucket of logicalStorageBuckets) {
    const fileSizeLimit = storageBucketLimits[bucket];

    if (existing.has(bucket)) {
      const { error: updateError } = await client.storage.updateBucket(bucket, {
        public: false,
        fileSizeLimit,
      });

      if (updateError) {
        throw new Error(
          `Could not update Supabase bucket ${bucket}: ${updateError.message}`,
        );
      }

      console.log(`✓ ${bucket} (${fileSizeLimit} byte limit)`);
      continue;
    }

    const { error: createError } = await client.storage.createBucket(bucket, {
      public: false,
      fileSizeLimit,
    });

    if (createError) {
      throw new Error(
        `Could not create Supabase bucket ${bucket}: ${createError.message}`,
      );
    }

    console.log(`+ ${bucket} (${fileSizeLimit} byte limit)`);
  }
}

async function main() {
  const driver = getStorageDriver();

  console.log(`Setting up ${driver} storage.`);

  if (driver === "supabase") {
    await setupSupabase();
    return;
  }

  if (driver === "s3") {
    await getObjectStorage().ping();
    console.log(
      `✓ S3 bucket ${env.S3_BUCKET} is reachable. Logical buckets use S3_PREFIX.`,
    );
    return;
  }

  await getObjectStorage().ping();
  console.log(
    `✓ Local storage root is ready (${env.LOCAL_STORAGE_ROOT ?? ".data/storage"}).`,
  );
}

main().catch((error) => {
  console.error("❌ Storage setup failed.");
  console.error(error);
  process.exitCode = 1;
});
