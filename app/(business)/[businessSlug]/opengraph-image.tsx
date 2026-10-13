import { SocialPreviewImage } from "@/components/seo/social-preview-image";
import { getPublicBusinessProfileBySlug } from "@/features/businesses/queries";
import { renderSocialImage } from "@/lib/seo/social-image-response";
import { siteDescription } from "@/lib/seo/site";

export {
  socialImageAlt as alt,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@/components/seo/social-preview-image";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const business = await getPublicBusinessProfileBySlug(businessSlug);

  return renderSocialImage(
    business && business.isPublic ? (
      <SocialPreviewImage
        title={business.name}
        subtitle="Service inquiries and quotes"
        body={business.description ?? business.shortDescription ?? siteDescription}
      />
    ) : (
      <SocialPreviewImage />
    ),
  );
}
