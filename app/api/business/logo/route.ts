import { getBusinessLogoAssetForBusiness } from "@/features/settings/queries";
import { serveStorageAsset } from "@/lib/files";
import { getCurrentBusinessRequestContext } from "@/lib/db/business-access";
import { createStorageAssetDownloader } from "@/lib/storage/files";
import { businessLogoBucket } from "@/features/settings/utils";

export async function GET(request: Request) {
  const requestContext = await getCurrentBusinessRequestContext();

  if (!requestContext) {
    return new Response("Not found", {
      status: 404,
      headers: { "cache-control": "no-store" },
    });
  }

  const asset = await getBusinessLogoAssetForBusiness(
    requestContext.businessContext.business.id,
  );
  return serveStorageAsset({
    request,
    bucket: businessLogoBucket,
    storagePath: asset?.logoStoragePath,
    contentType: asset?.logoContentType,
    fallbackFileName: "business-logo",
    download: createStorageAssetDownloader(),
  });
}
