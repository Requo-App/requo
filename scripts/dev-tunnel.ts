/**
 * Starts the optional ngrok tunnel used by `npm run dev:tunnel`.
 *
 * Loads `.env.local` first so NGROK_AUTHTOKEN and NGROK_DOMAIN can live beside
 * the rest of the development config. If NGROK_AUTHTOKEN is absent, the ngrok
 * CLI falls back to its own saved configuration.
 */
import { spawn } from "node:child_process";

import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

function normalizeDomain(value: string | undefined): string | null {
  const domain = value?.trim();
  if (!domain) return null;

  return domain
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .replace(/\/+$/, "");
}

const port = process.env.PORT?.trim() || "3000";
const authtoken = process.env.NGROK_AUTHTOKEN?.trim();
const domain = normalizeDomain(process.env.NGROK_DOMAIN);

const args = ["http", port];
if (domain) {
  args.push("--url", `https://${domain}`);
}

if (!authtoken) {
  console.warn(
    "[ngrok] NGROK_AUTHTOKEN is not set; using the ngrok CLI configuration.",
  );
}

if (domain) {
  console.log(
    `[ngrok] Webhook: https://${domain}/api/billing/polar/webhook`,
  );
}

const binary = process.platform === "win32" ? "ngrok.cmd" : "ngrok";
const child = spawn(binary, args, {
  env: process.env,
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error("[ngrok] Failed to start:", error.message);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code) {
    console.error(
      "[ngrok] Tunnel exited. Set NGROK_AUTHTOKEN in .env.local or run `npx ngrok config add-authtoken <token>`.",
    );
  }
  process.exit(code ?? 0);
});
