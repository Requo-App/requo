import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(), intent: vi.fn(), retrieve: vi.fn(), payment: vi.fn(),
  activate: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/auth/session", () => ({ requireSession: mocks.session }));
vi.mock("@/lib/billing/paymongo-checkout", () => ({
  getPaymongoCheckoutIntentForUser: mocks.intent,
  activatePaymongoCheckoutIntent: mocks.activate,
}));
vi.mock("@/lib/billing/paymongo-client", () => ({
  retrievePaymongoCheckoutSession: mocks.retrieve,
  getPaidCheckoutPayment: mocks.payment,
}));

import { GET } from "@/app/(checkout)/billing/paymongo/return/sync/route";
import { getBusinessBillingCacheTags } from "@/lib/cache/shell-tags";

describe("PayMongo return sync", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.session.mockResolvedValue({ user: { id: "owner" } });
    mocks.intent.mockResolvedValue({ id: "intent", status: "pending", providerSessionId: "session" });
    mocks.payment.mockReturnValue({ id: "payment", amount: 100, currency: "PHP", paidAt: null });
    mocks.activate.mockResolvedValue({ status: "activated", businessId: "business", plan: "pro" });
  });

  it("activates a paid intent, marks billing tags stale and returns to the page", async () => {
    await expect(GET(new Request("https://requo.test/billing/paymongo/return/sync?intent=intent&returnTo=%2Fbusiness%2Fhome")))
      .rejects.toThrow("redirect:/billing/paymongo/return?returnTo=%2Fbusiness%2Fhome&checked=1&intent=intent");
    expect(mocks.intent).toHaveBeenCalledWith({ intentId: "intent", userId: "owner" });
    expect(mocks.activate).toHaveBeenCalledWith({ intentId: "intent", payment: { providerPaymentId: "payment", amount: 100, currency: "PHP", paidAt: null }, invalidateCache: false });
    expect(mocks.revalidate.mock.calls).toEqual(getBusinessBillingCacheTags("business").map((tag) => [tag, "max"]));
  });

  it("does not retrieve or activate an intent belonging to another user", async () => {
    mocks.intent.mockResolvedValue(null);
    await expect(GET(new Request("https://requo.test/billing/paymongo/return/sync?intent=other&returnTo=https%3A%2F%2Fevil.test"))).rejects.toThrow("redirect:/billing/paymongo/return?");
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("leaves an unpaid intent pending", async () => {
    mocks.payment.mockReturnValue(null);
    await expect(GET(new Request("https://requo.test/billing/paymongo/return/sync?intent=intent"))).rejects.toThrow("redirect:/billing/paymongo/return?");
    expect(mocks.activate).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
