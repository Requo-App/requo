import "server-only";

import { timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";
import { logWarn } from "@/lib/observability/logger";
import { withRequestCorrelation } from "@/lib/observability/request";

/**
 * Verifies Vercel Cron `Authorization: Bearer <CRON_SECRET>` using a
 * timing-safe comparison. Returns true only when a secret is configured
 * and the header matches exactly. Missing secret fails closed (all requests
 * rejected) so misconfiguration never opens the endpoint.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const configured = env.CRON_SECRET;

  if (!configured) {
    return false;
  }

  const header = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${configured}`;

  const a = Buffer.from(header, "utf8");
  const b = Buffer.from(expected, "utf8");

  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(a, b);
}

/**
 * Single factory for Vercel Cron GET routes (was copy-pasted 4×).
 * Verifies the cron secret, runs `fn`, returns `{ success: true, ...result }`,
 * and gives every run a correlation ID that is also returned in the response.
 */
export function makeCronRoute<T extends Record<string, unknown>>(
  fn: () => Promise<T>,
): (request: Request) => Promise<Response> {
  return async (request: Request) =>
    withRequestCorrelation(
      request,
      "vercel_cron",
      async () => {
        if (!isAuthorizedCronRequest(request)) {
          logWarn("vercel_cron.unauthorized", {
            path: new URL(request.url).pathname,
          });
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const result = await fn();
        return Response.json({ success: true, ...result });
      },
      { scheduler: "vercel-cron" },
    );
}
