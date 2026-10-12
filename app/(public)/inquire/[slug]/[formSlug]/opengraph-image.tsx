import { SocialPreviewImage } from "@/components/seo/social-preview-image";
import { getPublicInquiryPageDescription } from "@/features/inquiries/metadata";
import { getPublicInquiryBusinessByFormSlug } from "@/features/inquiries/queries";
import { renderSocialImage } from "@/lib/seo/social-image-response";

export {
  socialImageAlt as alt,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@/components/seo/social-preview-image";

export default async function OpengraphImage({
  params,
}: {
  params: Promise<{ slug: string; formSlug: string }>;
}) {
  const { formSlug, slug } = await params;
  const business = await getPublicInquiryBusinessByFormSlug({
    businessSlug: slug,
    formSlug,
  });

  return renderSocialImage(
    business ? (
      <SocialPreviewImage
        title={business.form.name}
        subtitle={business.name}
        body={getPublicInquiryPageDescription(business)}
      />
    ) : (
      <SocialPreviewImage />
    ),
  );
}
