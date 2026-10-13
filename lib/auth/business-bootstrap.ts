import { eq } from "drizzle-orm";

import { splitFullName } from "@/features/account/name";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";

type BootstrapUser = {
  id: string;
  name: string;
  email: string;
};

export async function ensureProfileForUser(user: BootstrapUser) {
  const now = new Date();

  const [existingProfile] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (existingProfile) {
    return;
  }

  const split = splitFullName(user.name);

  await db
    .insert(profiles)
    .values({
      userId: user.id,
      fullName: user.name,
      firstName: split.firstName || null,
      lastName: split.lastName || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: profiles.userId });
}
