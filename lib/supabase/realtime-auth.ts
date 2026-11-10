import "server-only";

import { createHmac } from "node:crypto";

import { env, isSupabaseRealtimeConfigured } from "@/lib/env";

const supabaseRealtimeTokenLifetimeSeconds = 15 * 60;

type CreateSupabaseRealtimeTokenInput = {
  userId: string;
  email: string;
  name: string;
};

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signJwt(payload: Record<string, unknown>) {
  if (!isSupabaseRealtimeConfigured || !env.SUPABASE_JWT_SECRET) {
    throw new Error("Supabase Realtime is not configured.");
  }

  const header = {
    alg: "HS256",
    typ: "JWT",
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signaturePayload = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", env.SUPABASE_JWT_SECRET)
    .update(signaturePayload)
    .digest("base64url");

  return `${signaturePayload}.${signature}`;
}

export function createSupabaseRealtimeToken({
  userId,
  email,
  name,
}: CreateSupabaseRealtimeTokenInput) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + supabaseRealtimeTokenLifetimeSeconds;

  return {
    token: signJwt({
      aud: "authenticated",
      exp: expiresAt,
      iat: issuedAt,
      iss: env.BETTER_AUTH_URL,
      role: "authenticated",
      sub: userId,
      aal: "aal1",
      email,
      phone: "",
      app_metadata: {
        provider: "better-auth",
      },
      user_metadata: {
        name,
      },
      is_anonymous: false,
      session_id: crypto.randomUUID(),
    }),
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}
