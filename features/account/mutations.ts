import { eq } from "drizzle-orm";

import type { AccountProfileInput } from "@/features/account/schemas";
import { splitFullName } from "@/features/account/name";
import { prefixedId as createId } from "@/lib/ids";
import {
  profileAvatarBucket,
  profileAvatarExtensionToMimeType,
  sanitizeProfileAvatarFileName,
} from "@/features/account/utils";
import { ensureProfileForUser } from "@/lib/auth/business-bootstrap";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { resolveSafeContentType } from "@/lib/files";
import { getObjectStorage } from "@/lib/storage";
import type { LogicalStorageBucket } from "@/lib/storage/buckets";

type UpdateAccountProfileInput = {
  user: {
    id: string;
    email: string;
  };
  values: AccountProfileInput;
};

function chunkPaths(paths: string[], size = 100) {
  const chunks: string[][] = [];

  for (let index = 0; index < paths.length; index += size) {
    chunks.push(paths.slice(index, index + size));
  }

  return chunks;
}

async function removeStoragePaths(
  bucket: LogicalStorageBucket,
  paths: Array<string | null | undefined>,
) {
  const sanitizedPaths = paths.filter((path): path is string => Boolean(path));

  if (!sanitizedPaths.length) {
    return;
  }

  const storage = getObjectStorage();

  for (const chunk of chunkPaths(sanitizedPaths)) {
    try {
      await storage.deleteMany({ bucket, paths: chunk });
    } catch (error) {
      console.error(`Failed to remove storage objects from ${bucket}.`, error);
    }
  }
}

export async function cleanupDeletedAccountAssets(userId: string) {
  const [profile] = await db
    .select({
      avatarStoragePath: profiles.avatarStoragePath,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  await removeStoragePaths(profileAvatarBucket, [profile?.avatarStoragePath ?? null]);
}

export async function updateAccountProfile({
  user,
  values,
}: UpdateAccountProfileInput) {
  await ensureProfileForUser({
    id: user.id,
    name: values.fullName,
    email: user.email,
  });

  const [currentProfile] = await db
    .select({
      avatarStoragePath: profiles.avatarStoragePath,
      avatarContentType: profiles.avatarContentType,
    })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  const now = new Date();
  const avatarFile = values.avatar;
  const storage = avatarFile ? getObjectStorage() : null;
  const previousAvatarStoragePath = currentProfile?.avatarStoragePath ?? null;
  const nextAvatarContentType = avatarFile
    ? resolveSafeContentType(avatarFile, {
        extensionToMimeType: profileAvatarExtensionToMimeType,
        fallback: "application/octet-stream",
      })
    : null;
  const nextAvatarStoragePath =
    avatarFile && storage
      ? `${user.id}/avatar/${createId("asset")}-${sanitizeProfileAvatarFileName(
          avatarFile.name,
        )}`
      : null;

  if (nextAvatarStoragePath && storage && avatarFile) {
    try {
      await storage.put({
        bucket: profileAvatarBucket,
        path: nextAvatarStoragePath,
        body: new Uint8Array(await avatarFile.arrayBuffer()),
        contentType: nextAvatarContentType ?? "application/octet-stream",
      });
    } catch (error) {
      throw new Error(
        `Failed to upload profile avatar: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  const split = splitFullName(values.fullName);

  // `jobTitle` and `phone` are onboarding/deferred profile fields with no
  // input on the profile settings page — they are intentionally not written
  // here so saving a name never clobbers them.
  try {
    await db
      .update(profiles)
      .set({
        fullName: values.fullName,
        firstName: split.firstName || null,
        lastName: split.lastName || null,
        avatarStoragePath: values.removeAvatar
          ? nextAvatarStoragePath
          : nextAvatarStoragePath ?? previousAvatarStoragePath ?? null,
        avatarContentType: values.removeAvatar
          ? nextAvatarContentType
          : nextAvatarContentType ?? currentProfile?.avatarContentType ?? null,
        updatedAt: now,
      })
      .where(eq(profiles.userId, user.id));
  } catch (error) {
    if (nextAvatarStoragePath && storage) {
      try {
        await storage.delete({
          bucket: profileAvatarBucket,
          path: nextAvatarStoragePath,
        });
      } catch (cleanupError) {
        console.error(
          "Failed to clean up uploaded profile avatar after a database error.",
          cleanupError,
        );
      }
    }

    throw error;
  }

  const shouldRemovePreviousAvatar =
    previousAvatarStoragePath &&
    ((Boolean(nextAvatarStoragePath) &&
      nextAvatarStoragePath !== previousAvatarStoragePath) ||
      (values.removeAvatar && !nextAvatarStoragePath));

  if (shouldRemovePreviousAvatar && previousAvatarStoragePath) {
    try {
      await getObjectStorage().delete({
        bucket: profileAvatarBucket,
        path: previousAvatarStoragePath,
      });
    } catch (error) {
      console.error("Failed to clean up the previous profile avatar.", error);
    }
  }
}
