import { SocialPreviewImage } from "@/components/seo/social-preview-image";
import { renderSocialImage } from "@/lib/seo/social-image-response";

export {
  socialImageAlt as alt,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@/components/seo/social-preview-image";

export default async function TwitterImage() {
  return renderSocialImage(
    <SocialPreviewImage
      title="Pricing"
      subtitle="Plans that scale with your service business"
      body="Simple plans for service businesses managing inquiries and quotes."
    />,
  );
}
