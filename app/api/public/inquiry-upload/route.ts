import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildPublicInquiryAttachmentUploadPath,
  publicInquiryAllowedExtensions,
  publicInquiryAllowedMimeTypes,
  publicInquiryAttachmentTypeError,
} from "@/features/inquiries/attachments";
import {
  signInquiryAttachmentUploadToken,
} from "@/features/inquiries/attachment-tokens";
import { getPublicInquiryAttachmentMaxBytes } from "@/features/inquiries/plan-rules";
import { publicInquiryRateLimit } from "@/features/inquiries/rate-limits";
import {
  getInquiryEditorFormForBusiness,
  getInquiryEditorFormsForBusiness,
  getPublicInquiryBusinessByFormSlug,
  getPublicInquiryBusinessBySlug,
} from "@/features/inquiries/queries";
import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { isAcceptedFileType } from "@/lib/files";
import { newEntityId } from "@/lib/ids";
import { assertPublicActionRateLimit } from "@/lib/rate-limit/redis-rate-limiter";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Issues a signed upload URL for a public inquiry attachment.
 *
 * The file itself goes straight to storage, so it never passes through a
 * function request body (Vercel caps those at 4.5 MB). The signed URL is
 * scoped to one path, and the returned token is what binds the upload to
 * this business when the inquiry is submitted.
 */

const requestSchema = z.object({
  businessSlug: z.string().trim().min(1).max(120),
  formSlug: z.string().trim().min(1).max(120).optional(),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().max(255).optional(),
  size: z.number().int().positive().max(100 * 1024 * 1024),
});

/** How long the signed upload URL and the upload token stay valid. */
const uploadTokenLifetimeSeconds = 60 * 60;

/**
 * Resolves the business an upload belongs to.
 *
 * A visitor uploads through a public inquiry form. A workspace member may
 * also attach a file to a manually created inquiry, and their business does
 * not need a public form — so a membership-scoped fallback is allowed.
 */
async function resolveUploadBusiness({
  businessSlug,
  formSlug,
}: {
  businessSlug: string;
  formSlug?: string;
}) {
  const publicBusiness = formSlug
    ? await getPublicInquiryBusinessByFormSlug({
        businessSlug,
        formSlug,
      })
    : await getPublicInquiryBusinessBySlug(businessSlug);

  if (publicBusiness) {
    return publicBusiness;
  }

  const memberContext = await getBusinessRequestContextForSlug(businessSlug);

  if (!memberContext) {
    return null;
  }

  const businessId = memberContext.businessContext.business.id;
  const form = formSlug
    ? await getInquiryEditorFormForBusiness({ businessId, formSlug })
    : (
        await getInquiryEditorFormsForBusiness(businessId)
      ).find((candidate) => candidate.isDefault);

  if (!form) {
    return null;
  }

  const business = memberContext.businessContext.business;

  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    form: {
      id: form.id,
      name: form.name,
      slug: form.slug,
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { businessSlug, formSlug, fileName, contentType, size } = parsed.data;

  const business = await resolveUploadBusiness({
    businessSlug,
    formSlug,
  });

  if (!business) {
    return NextResponse.json(
      { error: "This inquiry page is unavailable right now." },
      { status: 404 },
    );
  }

  const plan = await getEffectivePlanForBusiness(business.id);
  const maxBytes = getPublicInquiryAttachmentMaxBytes(plan);

  if (size > maxBytes) {
    return NextResponse.json(
      { error: `Upload a file that is ${formatBytes(maxBytes)} or smaller.` },
      { status: 400 },
    );
  }

  if (
    !isAcceptedFileType(
      { name: fileName, type: contentType ?? null },
      {
        allowedExtensions: publicInquiryAllowedExtensions,
        allowedMimeTypes: publicInquiryAllowedMimeTypes,
      },
    )
  ) {
    return NextResponse.json(
      { error: publicInquiryAttachmentTypeError },
      { status: 400 },
    );
  }

  // Shares the budget with the submission itself, so a caller cannot skip
  // the intake limit by uploading through this route.
  const allowed = await assertPublicActionRateLimit({
    action: "public-inquiry-submit",
    scope: `${business.id}:${business.form.id}`,
    ...publicInquiryRateLimit,
  });

  if (!allowed) {
    return NextResponse.json(
      {
        error:
          "Too many upload attempts. Please wait a few minutes and try again.",
      },
      { status: 429 },
    );
  }

  const uploadId = newEntityId();
  const storagePath = buildPublicInquiryAttachmentUploadPath({
    uploadId,
    fileName,
  });

  const supabaseAdminClient = createSupabaseAdminClient();
  const { data, error } = await supabaseAdminClient.storage
    .from("inquiry-attachments")
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    console.error("Failed to create a signed inquiry upload URL.", error);

    return NextResponse.json(
      { error: "That file could not be uploaded. Try again." },
      { status: 500 },
    );
  }

  const token = signInquiryAttachmentUploadToken({
    businessId: business.id,
    uploadId,
    storagePath,
    fileName,
    size,
    expiresAt: Math.floor(Date.now() / 1000) + uploadTokenLifetimeSeconds,
  });

  return NextResponse.json(
    {
      signedUrl: data.signedUrl,
      token,
      fileName,
      size,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

function formatBytes(bytes: number) {
  const megabytes = bytes / (1024 * 1024);

  return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
}
