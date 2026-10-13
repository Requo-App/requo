import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";

import { auth } from "@/lib/auth/server";

export const getSession = cache(async () => {
  await connection();

  return auth.api.getSession({
    headers: await headers(),
  });
});

export const getOptionalSession = cache(async () => {
  try {
    return await getSession();
  } catch {
    return null;
  }
});

export async function getCurrentUser() {
  return (await getOptionalSession())?.user ?? null;
}

export async function requireSession(redirectTo = "/login") {
  const session = await getSession();

  if (!session) {
    redirect(redirectTo);
  }

  return session;
}

export async function requireUser(redirectTo = "/login") {
  return (await requireSession(redirectTo)).user;
}

/**
 * API variant of `requireUser` for Route Handlers. Throws a plain
 * `ApiUnauthorizedError` (caught as JSON 401) instead of `redirect()`,
 * which must never surface from `app/api/*` (SEC-019).
 */
export class ApiUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized.");
    this.name = "ApiUnauthorizedError";
  }
}

export async function requireApiUser() {
  const session = await getOptionalSession();

  if (!session?.user) {
    throw new ApiUnauthorizedError();
  }

  return session.user;
}

export type AuthSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;
export type AuthUser = AuthSession["user"];
