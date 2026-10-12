import type { ReactElement } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import {
  socialImageContentType,
  socialImageSize,
} from "@/components/seo/social-preview-image";

let fallbackBytes: Buffer | null = null;
try {
  fallbackBytes = readFileSync(join(process.cwd(), "public/og/fallback.png"));
} catch {
  fallbackBytes = null;
}

/** Render an OG image with file fallback. Shared by all `opengraph-image.tsx` routes. */
export async function renderSocialImage(element: ReactElement) {
  try {
    return new ImageResponse(element, { ...socialImageSize });
  } catch {
    if (fallbackBytes) {
      return new Response(new Uint8Array(fallbackBytes), {
        headers: { "content-type": socialImageContentType },
      });
    }
    throw new Error(
      "Failed to render social preview and no fallback image available",
    );
  }
}
