import "server-only";

import { createPolar } from "@polar-sh/sdk/2026-10";

import { env } from "@/lib/env";
import { sanitizeSameOriginPath } from "@/lib/routing/safe-return-path";

/** Single Polar SDK construction site (was copy-pasted in 3 routes). */
export function getPolarClient() {
  if (!env.POLAR_ACCESS_TOKEN) {
    throw new Error("Polar is not configured.");
  }

  return createPolar({
    accessToken: env.POLAR_ACCESS_TOKEN,
    environment: env.POLAR_SERVER,
  });
}

/** Shared same-origin returnTo guard (was duplicated with drift). */
export function sanitizeReturnTo(value: string | null | undefined): string | null {
  return sanitizeSameOriginPath(value);
}

function isPrivateIp(candidate: string): boolean {
  if (
    candidate === "127.0.0.1" ||
    candidate === "::1" ||
    candidate.startsWith("10.") ||
    candidate.startsWith("192.168.") ||
    candidate.startsWith("169.254.")
  ) {
    return true;
  }
  if (candidate.startsWith("172.")) {
    const second = Number.parseInt(candidate.split(".")[1] ?? "", 10);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

/**
 * Visitor IP for Polar currency geolocation. Header-only — no external
 * echo-service fallback (ponytail: dev ipify call deleted; localhost simply
 * sends no IP and Polar falls back to server egress).
 */
export function resolveClientIp(request: Request): string | null {
  const candidates = [
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    request.headers.get("x-real-ip")?.trim(),
    request.headers.get("cf-connecting-ip")?.trim(),
  ];
  for (const candidate of candidates) {
    if (!candidate || isPrivateIp(candidate)) continue;
    return candidate;
  }
  return null;
}

export function resolveAppOrigin(fallbackUrl?: string): string | null {
  const candidates = [env.BETTER_AUTH_URL, env.NEXT_PUBLIC_APP_URL, env.VERCEL_URL];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const value = candidate.startsWith("http") ? candidate : `https://${candidate}`;
    try {
      return new URL(value).origin;
    } catch {
      continue;
    }
  }
  if (fallbackUrl) {
    try {
      return new URL(fallbackUrl).origin;
    } catch {
      return null;
    }
  }
  return null;
}
