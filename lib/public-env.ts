import { z } from "zod";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }

    return value;
  }, schema.optional());

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: emptyToUndefined(z.string().url()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: emptyToUndefined(z.string().min(1)),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: emptyToUndefined(z.string().min(1)),
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: emptyToUndefined(z.string().min(1)),
});

const parsed = publicEnvSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
});

/** Resolved Supabase client key — prefers publishable key, falls back to anon key. */
const supabaseKey =
  parsed.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  parsed.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: parsed.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseKey,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: parsed.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
};
