import { z } from "zod";

const idSchema = z.string().trim().min(1);

const trackingMetadataSchema = z
  .object({
    referrer: z.string().optional(),
    utmSource: z.string().optional(),
    utmMedium: z.string().optional(),
    utmCampaign: z.string().optional(),
  })
  .optional();

export const publicAnalyticsEventSchema = z.discriminatedUnion("eventType", [
  z.object({
    eventType: z.literal("inquiry_form_viewed"),
    businessId: idSchema,
    serviceId: idSchema,
    metadata: trackingMetadataSchema,
  }),
  z.object({
    eventType: z.literal("quote_public_viewed"),
    businessId: idSchema,
    quoteId: idSchema,
    metadata: trackingMetadataSchema,
  }),
]);

export type PublicAnalyticsEventInput = z.infer<
  typeof publicAnalyticsEventSchema
>;

/**
 * Maps the pre-Service analytics field name onto `serviceId`.
 *
 * A public page loaded before the rename can still send its view event after
 * deployment. Accepting the legacy name keeps that view instead of rejecting
 * the whole payload with a 400.
 */
export function normalizeLegacyPublicAnalyticsEventPayload(
  value: unknown,
): unknown {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (record.eventType !== "inquiry_form_viewed") {
    return value;
  }

  if (typeof record.serviceId === "string" && record.serviceId.trim()) {
    return value;
  }

  if (
    typeof record.businessInquiryFormId !== "string" ||
    !record.businessInquiryFormId.trim()
  ) {
    return value;
  }

  return {
    ...record,
    serviceId: record.businessInquiryFormId,
  };
}
