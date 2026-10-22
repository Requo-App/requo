import { sanitizeStorageFileName } from "@/lib/files";
import {
  normalizePublicSlugInput,
  publicSlugMaxLength,
  publicSlugPattern,
  publicSlugRegex,
} from "@/lib/slugs";

export const businessLogoBucket = "business-assets";
export const businessLogoMaxSize = 2 * 1024 * 1024;
export const businessSlugMaxLength = publicSlugMaxLength;
export const businessSlugPattern = publicSlugPattern;
export const businessSlugRegex = publicSlugRegex;
export const businessLogoAllowedExtensions = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
] as const;
export const businessLogoAllowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const businessLogoExtensionToMimeType: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};
export const businessLogoAccept = [
  ...businessLogoAllowedExtensions,
  ...businessLogoAllowedMimeTypes,
].join(",");

export function normalizeBusinessSlug(value: string) {
  return normalizePublicSlugInput(value);
}

export function sanitizeBusinessLogoFileName(fileName: string) {
  return sanitizeStorageFileName(fileName, "business-logo");
}

export function getBusinessPublicInquiryUrl(slug: string, serviceSlug?: string) {
  return serviceSlug ? `/inquire/${slug}/${serviceSlug}` : `/inquire/${slug}`;
}
