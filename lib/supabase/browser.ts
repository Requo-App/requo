import { createBrowserClient } from "@supabase/ssr";

import { publicEnv } from "@/lib/public-env";

/**
 * Creates a singleton Supabase client for use in Client Components.
 *
 * Auth is handled by Better Auth — this client is used for Supabase Realtime
 * only. Storage is accessed through the application's server routes. The
 * client is only constructed when Realtime is actually enabled, so a
 * non-Supabase install never needs public Supabase credentials.
 */
export function createSupabaseBrowserClient() {
  if (
    !publicEnv.NEXT_PUBLIC_SUPABASE_URL ||
    !publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    throw new Error(
      "Supabase Realtime is not configured. Set NEXT_PUBLIC_SUPABASE_URL and a browser-safe key, or use REQUO_REALTIME_DRIVER=none.",
    );
  }

  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      isSingleton: true,
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
