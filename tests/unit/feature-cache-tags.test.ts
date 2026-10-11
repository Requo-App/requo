import { describe, expect, it, vi } from "vitest";

const { updateTagMock, revalidateTagMock } = vi.hoisted(() => ({
  updateTagMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  updateTag: updateTagMock,
  revalidateTag: revalidateTagMock,
}));

import {
  getBusinessFollowUpListCacheTags,
  getBusinessInquiryDetailCacheTags,
  getBusinessInquiryListCacheTags,
  getBusinessInvoiceDetailCacheTags,
  getBusinessInvoiceListCacheTags,
  getBusinessMemoryCacheTags,
  getBusinessOverviewCacheTags,
  getBusinessQuoteDetailCacheTags,
  getBusinessQuoteListCacheTags,
  uniqueCacheTags,
  updateCacheTags,
} from "@/lib/cache/business-tags";

describe("uniqueCacheTags", () => {
  it("dedupes while preserving first-seen order", () => {
    expect(uniqueCacheTags(["b", "a", "b", "c", "a"])).toEqual([
      "b",
      "a",
      "c",
    ]);
  });

  it("drops null, undefined, and empty strings", () => {
    expect(uniqueCacheTags(["a", null, undefined, "", "b"])).toEqual([
      "a",
      "b",
    ]);
  });
});

describe("business tag scoping", () => {
  it("scopes every tag to the business id", () => {
    expect(getBusinessInquiryListCacheTags("biz_1")).toEqual([
      "business:biz_1",
      "business:biz_1:dashboard",
      "business:biz_1:inquiries",
    ]);
    expect(getBusinessQuoteListCacheTags("biz_1")).toEqual([
      "business:biz_1",
      "business:biz_1:dashboard",
      "business:biz_1:quotes",
    ]);
    expect(getBusinessFollowUpListCacheTags("biz_1")).toEqual([
      "business:biz_1",
      "business:biz_1:dashboard",
      "business:biz_1:follow-ups",
    ]);
    expect(getBusinessInvoiceListCacheTags("biz_1")).toEqual([
      "business:biz_1",
      "business:biz_1:dashboard",
      "business:biz_1:invoices",
    ]);
  });

  it("supports ids with unusual but legal characters", () => {
    const tags = getBusinessInquiryListCacheTags("biz_1-TEST.2");
    expect(tags[0]).toBe("business:biz_1-TEST.2");
    expect(tags).toHaveLength(3);
  });

  it("detail builders append the record tag after list tags", () => {
    expect(getBusinessInquiryDetailCacheTags("biz_1", "inq_9")).toEqual([
      "business:biz_1",
      "business:biz_1:dashboard",
      "business:biz_1:inquiries",
      "business:biz_1:inquiry:inq_9",
      "business:biz_1:quotes",
    ]);
    expect(getBusinessQuoteDetailCacheTags("biz_1", "q_9")).toEqual([
      "business:biz_1",
      "business:biz_1:dashboard",
      "business:biz_1:quotes",
      "business:biz_1:quote:q_9",
      "business:biz_1:inquiries",
    ]);
    expect(getBusinessInvoiceDetailCacheTags("biz_1", "inv_9")).toContain(
      "business:biz_1:invoice:inv_9",
    );
  });

  it("memory and overview builders keep their own tag sets", () => {
    expect(getBusinessMemoryCacheTags("biz_1")).toEqual([
      "business:biz_1",
      "business:biz_1:settings",
      "business:biz_1:knowledge",
    ]);
    expect(getBusinessOverviewCacheTags("biz_1")).toContain(
      "business:biz_1:overview",
    );
  });
});

describe("updateCacheTags", () => {
  it("purges each tag once, in order, without revalidating", () => {
    updateTagMock.mockClear();
    revalidateTagMock.mockClear();

    updateCacheTags(["b", "a", "b"]);

    expect(updateTagMock.mock.calls).toEqual([["b"], ["a"]]);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("is a no-op for an empty tag list", () => {
    updateTagMock.mockClear();

    updateCacheTags([]);

    expect(updateTagMock).not.toHaveBeenCalled();
  });
});
