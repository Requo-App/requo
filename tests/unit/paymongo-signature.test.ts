import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyPaymongoSignature } from "@/lib/billing/paymongo-signature";

const secret = "whsec_test_secret";
const body = JSON.stringify({ data: { id: "evt_test", type: "event" } });
const timestamp = "1793500000";

function hmac(payload: string, key = secret): string {
  return createHmac("sha256", key).update(payload).digest("hex");
}

describe("verifyPaymongoSignature", () => {
  it("accepts the keyed test signature in test mode", () => {
    const header = `t=${timestamp},te=${hmac(`${timestamp}.${body}`)},li=${hmac(`${timestamp}.${body}`, "live")}`;

    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: header,
        secret,
        mode: "test",
      }),
    ).toBe(true);
  });

  it("selects the live signature in live mode", () => {
    const liveSecret = "whsec_live_secret";
    const header = `t=${timestamp},te=${hmac(`${timestamp}.${body}`)},li=${hmac(`${timestamp}.${body}`, liveSecret)}`;

    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: header,
        secret: liveSecret,
        mode: "live",
      }),
    ).toBe(true);
  });

  it("rejects the signature for the other mode", () => {
    const liveSecret = "whsec_live_secret";
    const header = `t=${timestamp},te=${hmac(`${timestamp}.${body}`)},li=${hmac(`${timestamp}.${body}`, liveSecret)}`;

    // The test signature verifies against the test secret, so presenting it to
    // a live endpoint must fail even though the header carries both values.
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: header,
        secret: liveSecret,
        mode: "test",
      }),
    ).toBe(false);
  });

  it("accepts a plain body signature", () => {
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: hmac(body),
        secret,
        mode: "test",
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const header = `t=${timestamp},te=${hmac(`${timestamp}.${body}`)},li=`;

    expect(
      verifyPaymongoSignature({
        rawBody: `${body} `,
        signatureHeader: header,
        secret,
        mode: "test",
      }),
    ).toBe(false);
  });

  it("rejects a wrong secret, missing header, and empty secret", () => {
    const header = `t=${timestamp},te=${hmac(`${timestamp}.${body}`)},li=`;

    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: header,
        secret: "whsec_other",
        mode: "test",
      }),
    ).toBe(false);

    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: null,
        secret,
        mode: "test",
      }),
    ).toBe(false);

    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: header,
        secret: "",
        mode: "test",
      }),
    ).toBe(false);
  });

  it("rejects a keyed header missing the timestamp", () => {
    expect(
      verifyPaymongoSignature({
        rawBody: body,
        signatureHeader: `te=${hmac(body)}`,
        secret,
        mode: "test",
      }),
    ).toBe(false);
  });
});
