import { buildContentDisposition } from "@/lib/files";
import { getObjectStorage, toArrayBuffer } from "@/lib/storage";
import { getPublicBusinessLogoAssetBySlug } from "@/features/inquiries/queries";
import { businessLogoBucket } from "@/features/settings/utils";
import { slugParamSchema } from "@/lib/api/params";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const parsed = slugParamSchema.safeParse(await params);
  if (!parsed.success) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  }
  const asset = await getPublicBusinessLogoAssetBySlug(parsed.data.slug);

  if (!asset?.logoStoragePath) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  }

  try {
    const object = await getObjectStorage().get({
      bucket: businessLogoBucket,
      path: asset.logoStoragePath,
    });

    return new Response(toArrayBuffer(object.body), {
      headers: {
        "cache-control": "public, max-age=86400, stale-while-revalidate=3600",
        "content-disposition": buildContentDisposition(
          asset.logoStoragePath.split("/").pop() ?? "business-logo",
          "inline",
        ),
        "content-type":
          asset.logoContentType ??
          object.contentType ??
          "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Failed to download public business logo from storage.", error);

    return new Response("Not found", {
      status: 404,
      headers: {
        "cache-control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  }
}
