import { describe, expect, it } from "vitest";

import { getSafeInternalRedirectPath } from "@/lib/actions/run-record-action";
import { getContactHandleUrl } from "@/features/inquiries/utils";

describe("post-action redirect targets", () => {
  it("accepts same-origin relative paths", () => {
    expect(getSafeInternalRedirectPath("/acme/inquiries")).toBe(
      "/acme/inquiries",
    );
    expect(getSafeInternalRedirectPath("  /acme/inquiries  ")).toBe(
      "/acme/inquiries",
    );
  });

  it("rejects absolute and protocol-relative targets", () => {
    expect(getSafeInternalRedirectPath("https://evil.example")).toBeUndefined();
    expect(getSafeInternalRedirectPath("//evil.example")).toBeUndefined();
    expect(getSafeInternalRedirectPath("javascript:alert(1)")).toBeUndefined();
    expect(getSafeInternalRedirectPath("acme/inquiries")).toBeUndefined();
  });

  it("ignores non-string values", () => {
    expect(getSafeInternalRedirectPath(null)).toBeUndefined();
    expect(getSafeInternalRedirectPath(undefined)).toBeUndefined();
  });

  it.each([
    "/\\evil.example",
    "/\t/evil.example",
    "/\n/evil.example",
    "/\r/evil.example",
    "\n/acme/inquiries",
    "/acme/inquiries\t",
    "/acme/\u0000inquiries",
    "/acme/\u007finquiries",
  ])("rejects parser-normalized redirect targets: %j", (target) => {
    expect(getSafeInternalRedirectPath(target)).toBeUndefined();
  });
});

describe("contact handle links", () => {
  it("does not prefix a social handle that is already a canonical URL", () => {
    expect(
      getContactHandleUrl("facebook", "https://facebook.com/acme.roofing"),
    ).toBe("https://facebook.com/acme.roofing");
    expect(
      getContactHandleUrl("instagram", "https://instagram.com/acme.roofing"),
    ).toBe("https://instagram.com/acme.roofing");
  });

  it("builds a canonical URL for a bare social handle", () => {
    expect(getContactHandleUrl("facebook", "acme.roofing")).toBe(
      "https://facebook.com/acme.roofing",
    );
    expect(getContactHandleUrl("instagram", "acme.roofing")).toBe(
      "https://instagram.com/acme.roofing",
    );
  });

  it("keeps WhatsApp numbers as digits", () => {
    expect(getContactHandleUrl("whatsapp", "+1 (555) 010-2030")).toBe(
      "https://wa.me/+15550102030",
    );
  });

  it("returns null for methods with no link", () => {
    expect(getContactHandleUrl("email", "taylor@example.com")).toBeNull();
    expect(getContactHandleUrl("phone", "5550102030")).toBeNull();
    expect(getContactHandleUrl("not-a-method", "value")).toBeNull();
  });
});
