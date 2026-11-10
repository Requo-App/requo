import { sanitizeStorageFileName } from "@/lib/files";
import { storageBuckets } from "@/lib/storage/buckets";

export const profileAvatarBucket = storageBuckets.profileAssets;
export const profileAvatarMaxSize = 2 * 1024 * 1024;
export const profileAvatarAllowedExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;
export const profileAvatarAllowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const profileAvatarExtensionToMimeType: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
export const profileAvatarAccept = [
  ...profileAvatarAllowedExtensions,
  ...profileAvatarAllowedMimeTypes,
].join(",");

export function sanitizeProfileAvatarFileName(fileName: string) {
  return sanitizeStorageFileName(fileName, "profile-avatar");
}

export function getProfileAvatarUrl(updatedAt?: Date | null) {
  if (!updatedAt) {
    return "/api/account/avatar";
  }

  return `/api/account/avatar?v=${updatedAt.getTime()}`;
}

export function resolveUserAvatarSrc({
  avatarStoragePath,
  profileUpdatedAt,
  oauthImage,
}: {
  avatarStoragePath?: string | null;
  profileUpdatedAt?: Date | null;
  oauthImage?: string | null;
}) {
  if (avatarStoragePath) {
    return getProfileAvatarUrl(profileUpdatedAt);
  }

  if (!oauthImage) {
    return null;
  }

  // OAuth provider avatars (e.g. Google) can intermittently fail client-side due to
  // third-party restrictions. Proxy through our origin for reliability.
  if (oauthImage.startsWith("http://") || oauthImage.startsWith("https://")) {
    return "/api/account/oauth-avatar";
  }

  return oauthImage;
}
