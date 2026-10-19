import { describe, expect, it } from "vitest";

import { redirectToPath } from "@/lib/routing/redirects";

describe("redirectToPath", () => {
  it("emits a relative Location so the browser keeps its origin", () => {
    const response = redirectToPath("/mark-louie-builds/home", 302);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/mark-louie-builds/home");
  });

  it("defaults to a temporary 307 like NextResponse.redirect", () => {
    const response = redirectToPath("/login");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/login");
  });

  it("preserves query strings", () => {
    const response = redirectToPath(
      "/admin/users/user_1?error=Confirm%20your%20password",
      303,
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/admin/users/user_1?error=Confirm%20your%20password",
    );
  });

  it("rejects anything that could resolve off-origin", () => {
    expect(() => redirectToPath("//evil.example")).toThrow(
      "same-origin path",
    );
    expect(() => redirectToPath("https://evil.example")).toThrow(
      "same-origin path",
    );
    expect(() => redirectToPath("relative/path")).toThrow(
      "same-origin path",
    );
  });
});
