/**
 * scripts/bootstrap-admin.ts
 *
 * One-time migration script: promotes existing users whose email is in
 * ADMIN_EMAILS to role = "admin" in the database. Idempotent — re-runs
 * are safe (already-promoted users are skipped).
 *
 * Run AFTER deploying the code changes that activate Better Auth's
 * admin plugin with adminRoles: ["admin"].
 *
 * Run:  npx tsx --conditions=react-server scripts/bootstrap-admin.ts
 * Reqs: DATABASE_URL + BETTER_AUTH_SECRET + ADMIN_EMAILS in env
 */
import "dotenv/config";

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { db, dbConnection } from "../lib/db/client";
import { adminAuditLogs, user } from "../lib/db/schema";
import { env } from "../lib/env";

function createAuditId(): string {
  return `aal_${randomUUID().replace(/-/g, "")}`;
}

async function main() {
  const adminEmails = env.ADMIN_EMAILS;

  if (!adminEmails) {
    console.log("⚠ ADMIN_EMAILS is not set. No admin users to bootstrap.");
    console.log("  Set ADMIN_EMAILS in your environment, then re-run.");
    await dbConnection.end();
    process.exitCode = 1;
    return;
  }

  const emails = adminEmails
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (emails.length === 0) {
    console.log("⚠ ADMIN_EMAILS is empty. Nothing to bootstrap.");
    await dbConnection.end();
    process.exitCode = 1;
    return;
  }

  console.log(`\n🔐 Requo Admin Bootstrap`);
  console.log(`${"=".repeat(50)}`);
  console.log(`Checking ${emails.length} email(s) for admin role...\n`);

  let promoted = 0;
  let alreadyAdmin = 0;
  let notFound = 0;

  for (const email of emails) {
    const [row] = await db
      .select({ id: user.id, role: user.role })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (!row) {
      console.log(`  ○ ${email} — not found in DB (skipped)`);
      notFound++;
      continue;
    }

    if (row.role === "admin") {
      console.log(`  ✓ ${email} — already admin (skipped)`);
      alreadyAdmin++;
      continue;
    }

    // Promote to admin
    const now = new Date();
    await db
      .update(user)
      .set({ role: "admin", updatedAt: now })
      .where(eq(user.id, row.id));

    // Write a bootstrap audit log entry
    await db.insert(adminAuditLogs).values({
      id: createAuditId(),
      adminUserId: row.id,
      adminEmail: email,
      action: "admin.bootstrap",
      targetType: "user",
      targetId: row.id,
      metadata: {
        source: "bootstrap-script",
        previousRole: row.role,
        promotedAt: now.toISOString(),
      },
      ipAddress: null,
      userAgent: null,
      createdAt: now,
    });

    console.log(`  ★ ${email} — promoted to admin`);
    promoted++;
  }

  console.log(`\n✅ Bootstrap complete.`);
  console.log(`   Promoted: ${promoted}`);
  console.log(`   Already admin: ${alreadyAdmin}`);
  console.log(`   Not found: ${notFound}`);

  if (promoted === 0 && alreadyAdmin === 0) {
    console.log(
      `\n⚠ No admin users were found or promoted. Verify ADMIN_EMAILS.`,
    );
  }

  await dbConnection.end();
}

main().catch(async (error) => {
  console.error("\n❌ Bootstrap failed:", error);
  await dbConnection.end();
  process.exitCode = 1;
});
