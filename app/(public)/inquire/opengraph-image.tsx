import { SocialPreviewImage } from "@/components/seo/social-preview-image";
import { renderSocialImage } from "@/lib/seo/social-image-response";

export {
  socialImageAlt as alt,
  socialImageContentType as contentType,
  socialImageSize as size,
} from "@/components/seo/social-preview-image";

export default async function OpengraphImage() {
  return renderSocialImage(
    <SocialPreviewImage
      title="Submit an inquiry"
      subtitle="Tell the team what you need"
      body="Share the details of your project and get a quote fast."
    />,
  );
}
