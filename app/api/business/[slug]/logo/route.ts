import { getBusinessLogoAssetForBusiness } from "@/features/settings/queries";
import { serveStorageAsset } from "@/lib/files";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { businessLogoBucket } from "@/features/settings/utils";
import { slugParamSchema } from "@/lib/api/params";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsed = slugParamSchema.safeParse(await context.params);
  if (!parsed.success) {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }
  const requestContext = await getBusinessRequestContextForSlug(parsed.data.slug);

  if (!requestContext) {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const asset = await getBusinessLogoAssetForBusiness(
    requestContext.businessContext.business.id,
  );
  const storageClient = createSupabaseAdminClient();

  return serveStorageAsset({
    request,
    bucket: businessLogoBucket,
    storagePath: asset?.logoStoragePath,
    contentType: asset?.logoContentType,
    fallbackFileName: "business-logo",
    download: (bucket, path) =>
      storageClient.storage.from(bucket).download(path),
  });
}
