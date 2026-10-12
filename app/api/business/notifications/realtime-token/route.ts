import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseRealtimeConfigured } from "@/lib/env";
import { createSupabaseRealtimeToken } from "@/lib/supabase/realtime-auth";

export async function GET() {
  if (!isSupabaseRealtimeConfigured) {
    return NextResponse.json(
      { error: "Realtime notifications are not configured." },
      { status: 503 },
    );
  }

  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { token, expiresAt } = createSupabaseRealtimeToken({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  return NextResponse.json(
    { token, expiresAt },
    { headers: { "cache-control": "private, no-store" } },
  );
}
