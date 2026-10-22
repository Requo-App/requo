import { describe, expect, it } from "vitest";

import {
  normalizeLegacyPublicAnalyticsEventPayload,
  publicAnalyticsEventSchema,
} from "@/features/analytics/schemas";

describe("public analytics event compatibility", () => {
  it("maps the legacy businessInquiryFormId field onto serviceId", () => {
    const parsed = publicAnalyticsEventSchema.safeParse(
      normalizeLegacyPublicAnalyticsEventPayload({
        eventType: "inquiry_form_viewed",
        businessId: "business-1",
        businessInquiryFormId: "service-1",
      }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(
        expect.objectContaining({
          eventType: "inquiry_form_viewed",
          businessId: "business-1",
          serviceId: "service-1",
        }),
      );
    }
  });

  it("prefers the current serviceId when both field names are present", () => {
    const parsed = publicAnalyticsEventSchema.safeParse(
      normalizeLegacyPublicAnalyticsEventPayload({
        eventType: "inquiry_form_viewed",
        businessId: "business-1",
        serviceId: "service-current",
        businessInquiryFormId: "service-legacy",
      }),
    );

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(
        expect.objectContaining({ serviceId: "service-current" }),
      );
    }
  });

  it("still rejects an inquiry view without either service id", () => {
    const parsed = publicAnalyticsEventSchema.safeParse(
      normalizeLegacyPublicAnalyticsEventPayload({
        eventType: "inquiry_form_viewed",
        businessId: "business-1",
      }),
    );

    expect(parsed.success).toBe(false);
  });
});
