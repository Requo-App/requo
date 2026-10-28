import path from "node:path";

import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

const rootDir = path.resolve(__dirname, "..");

config({ path: path.join(rootDir, ".env.local") });
config({ path: path.join(rootDir, ".env") });

const url = process.env.DATABASE_MIGRATION_URL;

if (!url) {
  throw new Error(
    "DATABASE_MIGRATION_URL must be set before running Drizzle commands.",
  );
}

export default defineConfig({
  schema: path.join(rootDir, "lib/db/schema/index.ts"),
  // Drizzle prefixes the output path with "./", so it must stay relative.
  out: path.relative(process.cwd(), path.join(rootDir, "drizzle")) || ".",
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
  verbose: true,
  strict: true,
});
