import { expect, test } from "@playwright/test";

type CspViolation = {
  blockedURI: string;
  effectiveDirective: string;
};

declare global {
  interface Window {
    __requoCspViolations?: CspViolation[];
  }
}

test.describe("security headers", () => {
  test("public pages keep the baseline headers and an enforced CSP", async ({
    request,
  }) => {
    const response = await request.get("/");

    expect(response.status()).toBe(200);

    const headers = response.headers();
    const csp = headers["content-security-policy"];

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    expect(csp).toContain("script-src-attr 'none'");
    expect(csp).not.toContain("nonce-");
    expect(headers["content-security-policy-report-only"]).toBeUndefined();
    expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
    expect(headers["permissions-policy"]).toBe(
      "camera=(), geolocation=(), microphone=()",
    );
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-permitted-cross-domain-policies"]).toBe("none");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("crawler and discovery resources stay indexable and cacheable", async ({
    request,
  }) => {
    for (const path of ["/robots.txt", "/sitemap.xml"]) {
      const response = await request.get(path);
      const headers = response.headers();

      expect(response.status(), path).toBe(200);
      expect(headers["x-robots-tag"], path).toBeUndefined();
      expect(headers["cache-control"], path).not.toContain("private");
    }

    const robots = await request.get("/robots.txt");
    const robotsBody = await robots.text();
    expect(robotsBody).toContain("User-Agent: *");
    expect(robotsBody).toMatch(/^Sitemap: https?:\/\/.+\/sitemap\.xml$/m);

    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.headers()["content-type"]).toContain("xml");
    expect(await sitemap.text()).toContain("<urlset");
  });

  test("security.txt is served at the canonical and legacy locations", async ({
    request,
  }) => {
    for (const path of [
      "/.well-known/security.txt",
      "/.well-known/security-txt",
    ]) {
      const response = await request.get(path);
      const body = await response.text();

      expect(response.status(), path).toBe(200);
      expect(response.headers()["content-type"], path).toContain("text/plain");
      expect(response.headers()["x-robots-tag"], path).toBeUndefined();
      expect(body, path).toContain("Contact: mailto:security@requo.app");
      expect(body, path).toContain("Expires: ");
      expect(body, path).toContain("Policy: https://requo.app/security");
      expect(body.endsWith("\n"), path).toBe(true);
    }
  });

  test("social images stay indexable and cacheable", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    const headers = response.headers();

    expect(response.status()).toBe(200);
    expect(headers["content-type"]).toContain("image/png");
    expect(headers["x-robots-tag"]).toBeUndefined();
    // `next dev` marks generated images `no-cache, no-store`; what matters is
    // that the proxy no longer marks them private (the production regression).
    expect(headers["cache-control"]).not.toContain("private");
  });

  test("auth pages stay private and same-origin", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();

    expect(response.status()).toBe(200);
    expect(headers["cache-control"]).toContain("no-store");
    expect(headers["cross-origin-resource-policy"]).toBe("same-origin");
    expect(headers["x-robots-tag"]).toContain("noindex");
  });

  test("public pages report no CSP violations", async ({ page }) => {
    await page.addInitScript(() => {
      window.__requoCspViolations = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__requoCspViolations?.push({
          blockedURI: event.blockedURI,
          effectiveDirective: event.effectiveDirective,
        });
      });
    });

    const violations: CspViolation[] = [];

    for (const path of ["/", "/pricing"]) {
      const response = await page.goto(path);

      expect(
        response?.headers()["content-security-policy"],
        `${path} must be served with an enforced CSP`,
      ).toBeTruthy();
      await expect(page.locator("h1").first()).toBeVisible();
      await page.waitForTimeout(1_000);
      violations.push(
        ...(await page.evaluate(() => window.__requoCspViolations ?? [])),
      );
    }

    expect(violations).toEqual([]);
  });
});
