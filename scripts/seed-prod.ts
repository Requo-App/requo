/**
 * scripts/seed-prod.ts
 *
 * Production seed: creates the admin user(s) from ADMIN_EMAILS env var.
 * Safe to run multiple times — uses upserts and skips existing users.
 *
 * Run:  npx tsx --conditions=react-server scripts/seed-prod.ts
 * Reqs: DATABASE_URL + BETTER_AUTH_SECRET + ADMIN_EMAILS in env
 */
import "./load-env";

import { eq } from "drizzle-orm";

import { auth } from "../lib/auth/config";
import { db, dbConnection } from "../lib/db/client";
import { profiles, user } from "../lib/db/schema";
import { env } from "../lib/env";

const ADMIN_PASSWORD = process.env.ADMIN_SEED_PASSWORD ?? (() => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("ADMIN_SEED_PASSWORD must be set in production (no default password).");
  }
  return "ChangeMe123456!";
})();

async function main() {
  const adminEmails = env.ADMIN_EMAILS;

  if (!adminEmails) {
    console.log("⚠ ADMIN_EMAILS is not set. No admin users to seed.");
    console.log("  Set ADMIN_EMAILS in your environment to seed admin accounts.");
    await dbConnection.end();
    return;
  }

  const emails = adminEmails
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);

  if (emails.length === 0) {
    console.log("⚠ ADMIN_EMAILS is empty. Nothing to seed.");
    await dbConnection.end();
    return;
  }

  console.log(`\n🌱 Requo Production Seed`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Creating ${emails.length} admin user(s)...\n`);

  for (const email of emails) {
    // Check if user already exists
    const [existing] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existing) {
      // Ensure existing users have the admin role set (idempotent).
      await db
        .update(user)
        .set({ role: "admin", updatedAt: new Date() })
        .where(eq(user.id, existing.id));
      console.log(`  ✓ ${email} — already exists (role ensured)`);
      continue;
    }

    try {
      const result = await auth.api.signUpEmail({
        body: {
          name: email.split("@")[0],
          email,
          password: ADMIN_PASSWORD,
        },
      });

      if (!result?.user?.id) {
        console.error(`  ✗ ${email} — signup failed`);
        continue;
      }

      // Mark email as verified and set admin role
      await db
        .update(user)
        .set({ emailVerified: true, role: "admin", updatedAt: new Date() })
        .where(eq(user.id, result.user.id));

      // Create profile
      await db
        .insert(profiles)
        .values({
          userId: result.user.id,
          fullName: email.split("@")[0],
        })
        .onConflictDoNothing({ target: profiles.userId });

      console.log(`  ✓ ${email} — created`);
    } catch (error) {
      console.error(`  ✗ ${email} — failed:`, (error as Error).message);
    }
  }

  console.log(`\n✅ Production seed complete.`);
  console.log(`   Admin users can log in and complete onboarding.`);
  console.log(`   Default password: ${ADMIN_PASSWORD}`);
  console.log(`   (Change it immediately after first login)\n`);

  await dbConnection.end();
}

main().catch(async (error) => {
  console.error("\n❌ Production seed failed:", error);
  await dbConnection.end();
  process.exitCode = 1;
});
