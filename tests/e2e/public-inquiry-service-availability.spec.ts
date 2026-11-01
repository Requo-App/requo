import "../../scripts/load-env";

import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

const fixtureId = `e2e-inquiry-${randomUUID()}`;
const ownerId = `${fixtureId}-owner`;
const cases = ["disabled", "archived"] as const;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

test.beforeAll(async () => {
  await pool.query(
    'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
    [ownerId, "Inquiry test owner", `${ownerId}@example.com`],
  );

  for (const state of cases) {
    const businessId = `${fixtureId}-${state}`;
    await pool.query(
      "INSERT INTO businesses (id, owner_user_id, name, slug) VALUES ($1, $2, $3, $4)",
      [businessId, ownerId, "Inquiry test business", businessId],
    );
    await pool.query(
      `INSERT INTO business_inquiry_forms
        (id, business_id, name, slug, is_default, public_inquiry_enabled,
         archived_at, inquiry_form_config, inquiry_page_config)
       VALUES ($1, $2, 'Default service', 'default', true, $3, $4, '{}', '{}'),
              ($5, $2, 'Available service', 'available', false, true, NULL, '{}', '{}')`,
      [
        `${businessId}-default`,
        businessId,
        state !== "disabled",
        state === "archived" ? new Date() : null,
        `${businessId}-available`,
      ],
    );
  }
});

test.afterAll(async () => {
  try {
    await pool.query("DELETE FROM businesses WHERE owner_user_id = $1", [ownerId]);
    await pool.query('DELETE FROM "user" WHERE id = $1', [ownerId]);
  } finally {
    await pool.end();
  }
});

for (const state of cases) {
  test(`an enabled service stays available when the default is ${state}`, async ({ page }) => {
    const basePath = `/inquire/${fixtureId}-${state}`;

    expect((await page.goto(`${basePath}/available`))?.status()).toBe(200);
    await expect(page.locator("#inquiry-customerName:visible")).toBeVisible();
  });

  test(`the base inquiry route is unavailable when the default is ${state}`, async ({ page }) => {
    expect((await page.goto(`/inquire/${fixtureId}-${state}`))?.status()).toBe(404);
  });
}
