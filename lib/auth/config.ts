import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { admin, magicLink } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";

import { ensureProfileForUser } from "@/lib/auth/business-bootstrap";
import { extractFirstName } from "@/features/account/name";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import {
  sendMagicLinkEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/email/transactional";

function toOrigin(value: string) {
  return new URL(value).origin;
}

/**
 * Derive the cookie domain for cross-subdomain session sharing.
 *
 * - Production (https://requo.app): domain = ".requo.app" so the session
 *   cookie is shared across subdomains.
 * - Development (http://localhost:3000): "" (no Domain attribute).
 *   Browsers silently drop `Set-Cookie` responses carrying
 *   `Domain=localhost`, which surfaces as a login that succeeds
 *   server-side (fresh session row per attempt) but bounces straight
 *   back to `/login`. Host-only cookies work fine.
 */
function getCookieDomain(): string {
  const baseUrl = env.BETTER_AUTH_URL;
  if (!baseUrl) return "";
  try {
    const hostname = new URL(baseUrl).hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "";
    }
    return `.${hostname}`;
  } catch {
    return "";
  }
}

function getTrustedVercelOrigin(value: string) {
  return toOrigin(value.startsWith("http") ? value : `https://${value}`);
}

/**
 * Protocol of the configured base URL.
 *
 * Keyed off `BETTER_AUTH_URL`, not `NODE_ENV`, so a production build run
 * locally (`next start` with an http base URL) still trusts http origins
 * and skips secure cookies. Real deployments use an https base URL, so
 * their behavior is unchanged.
 */
function getBaseUrlProtocol(): "http" | "https" {
  try {
    return new URL(env.BETTER_AUTH_URL).protocol === "https:"
      ? "https"
      : "http";
  } catch {
    return env.NODE_ENV === "production" ? "https" : "http";
  }
}

function buildTrustedOrigins() {
  const origins = new Set<string>([toOrigin(env.BETTER_AUTH_URL)]);

  if (env.NEXT_PUBLIC_BETTER_AUTH_URL) {
    origins.add(toOrigin(env.NEXT_PUBLIC_BETTER_AUTH_URL));
  }

  if (env.VERCEL_URL) {
    origins.add(getTrustedVercelOrigin(env.VERCEL_URL));
  }

  // Vercel auto-sets VERCEL_BRANCH_URL and VERCEL_PROJECT_PRODUCTION_URL
  if (process.env.VERCEL_BRANCH_URL) {
    origins.add(getTrustedVercelOrigin(process.env.VERCEL_BRANCH_URL));
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    origins.add(getTrustedVercelOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL));
  }

  // Localhost aliases apply whenever a localhost-family origin is
  // present — including production builds run locally — so the mirror
  // is keyed off hostnames, not NODE_ENV. In real deployments no origin
  // matches and the loop is a no-op.
  for (const origin of Array.from(origins)) {
    const url = new URL(origin);

    if (url.hostname === "localhost") {
      url.hostname = "127.0.0.1";
      origins.add(url.origin);
    }

    if (url.hostname === "127.0.0.1") {
      url.hostname = "localhost";
      origins.add(url.origin);
    }
  }

  return Array.from(origins);
}

const shouldSkipTransactionalAuthEmails =
  env.DISABLE_TRANSACTIONAL_EMAILS === "1" ||
  env.DISABLE_TRANSACTIONAL_EMAILS === "true";

const shouldSkipMagicLinkEmail =
  shouldSkipTransactionalAuthEmails ||
  env.DISABLE_MAGIC_LINK === "1" ||
  env.DISABLE_MAGIC_LINK === "true";

// Empty in local dev (see getCookieDomain) — the cross-subdomain option
// below is omitted entirely in that case.
const cookieDomain = getCookieDomain();

export const auth = betterAuth({
  appName: "Requo",
  baseURL: env.BETTER_AUTH_URL,
  trustedOrigins: buildTrustedOrigins(),
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
    camelCase: true,
  }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url, token }) => {
      if (shouldSkipTransactionalAuthEmails) {
        return;
      }

      await sendPasswordResetEmail({
        userId: user.id,
        email: user.email,
        name: extractFirstName(user.name) || user.name,
        url,
        token,
      });
    },
  },
  emailVerification: {
    autoSignInAfterVerification: false,
    sendOnSignIn: true,
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url, token }) => {
      if (shouldSkipTransactionalAuthEmails) {
        return;
      }

      await sendVerificationEmail({
        userId: user.id,
        email: user.email,
        name: extractFirstName(user.name) || user.name,
        token,
        url,
      });
    },
  },
  verification: {
    storeIdentifier: "hashed",
  },
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
  account: {
    accountLinking: {
      trustedProviders: ["google"],
    },
    // OAuth + `verification.storeIdentifier: "hashed"` can break DB+signed-cookie state checks (surfacing as `state_mismatch`).
    storeStateStrategy: "cookie",
  },
  user: {
    deleteUser: {
      enabled: true,
      beforeDelete: async (deletedUser) => {
        const { getAccountDeletionPreflight } = await import(
          "@/features/account/queries"
        );
        const { cleanupDeletedAccountAssets } = await import(
          "@/features/account/mutations"
        );
        const { writeAccountAuditLogsForUser } = await import(
          "@/features/audit/mutations"
        );
        const preflight = await getAccountDeletionPreflight(deletedUser.id);

        if (!preflight.allowed) {
          throw new Error(
            preflight.blockers[0]?.message ??
              "Resolve your owned businesses or business ownership before deleting this account.",
          );
        }

        await writeAccountAuditLogsForUser(deletedUser.id, {
          actorUserId: deletedUser.id,
          actorName: deletedUser.name,
          actorEmail: deletedUser.email,
          action: "account.deleted",
          metadata: {
            accountEmail: deletedUser.email,
          },
          source: "system",
          createdAt: new Date(),
        });

        await cleanupDeletedAccountAssets(deletedUser.id);
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
    },
  },
  advanced: {
    // Secure cookies follow the base URL protocol, not NODE_ENV, so a
    // production build served over plain http (local `next start`) does
    // not set `Secure` cookies the browser would silently drop.
    useSecureCookies: getBaseUrlProtocol() === "https",
    // Share session cookies between app and admin subdomains. Omitted
    // when there is no cookie domain (local dev) — an empty Domain
    // attribute would break cookie storage, so dev falls back to
    // host-only cookies (separate session per host).
    ...(cookieDomain
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        }
      : {}),
    // Prefer concrete proxy headers before x-forwarded-for so "::" is not used as a stable client key when a better header exists.
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip", "x-real-ip", "x-forwarded-for"],
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/get-session": false,
      "/admin/confirm": {
        max: 5,
        window: 300,
      },
      "/request-password-reset": {
        max: 5,
        window: 300,
      },
      "/reset-password": {
        max: 10,
        window: 300,
      },
      "/sign-in/email": {
        max: 10,
        window: 60,
      },
      "/sign-up/email": {
        max: 5,
        window: 60,
      },
      "/sign-in/magic-link": {
        max: 5,
        window: 60,
      },
      "/magic-link/verify": {
        max: 15,
        window: 60,
      },
    },
  },
  plugins: [
    magicLink({
      expiresIn: 900,
      storeToken: "hashed",
      sendMagicLink: async ({ email, url, token }) => {
        if (shouldSkipMagicLinkEmail) {
          return;
        }

        await sendMagicLinkEmail({ email, url, token });
      },
    }),
    admin({
      // Role-based admin authorization. The `user.role` column is the
      // source of truth — users with role "admin" can access the admin
      // console and the Better Auth admin endpoints.
      adminRoles: ["admin"],
      // 1 hour impersonation window.
      impersonationSessionDuration: 60 * 60,
      // Disallow admin-on-admin impersonation (default is already false;
      // set explicitly to make the invariant visible in config).
      allowImpersonatingAdmins: false,
    }),
    // next-cookies must be last so plugins with `hooks.after` don't set
    // cookies that bypass the Next.js cookie store.
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await ensureProfileForUser({
            id: user.id,
            name: user.name,
            email: user.email,
          });
        },
      },
    },
  },
});
