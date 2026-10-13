import { getAccountProfileForUser } from "@/features/account/queries";
import { profileAvatarBucket } from "@/features/account/utils";
import { serveStorageAsset } from "@/lib/files";
import { getOptionalSession } from "@/lib/auth/session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  const session = await getOptionalSession();

  if (!session) {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const profile = await getAccountProfileForUser(session.user.id);
  const storageClient = createSupabaseAdminClient();

  return serveStorageAsset({
    request,
    bucket: profileAvatarBucket,
    storagePath: profile?.avatarStoragePath,
    contentType: profile?.avatarContentType,
    fallbackFileName: "profile-avatar",
    download: (bucket, path) =>
      storageClient.storage.from(bucket).download(path),
  });
}
