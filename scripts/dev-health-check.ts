/**
 * scripts/dev-health-check.ts
 *
 * Pre-flight health check for the Requo development environment.
 * Validates critical services, connectivity, and configuration before
 * starting the Next.js dev server.
 *
 * Usage: tsx --conditions=react-server scripts/dev-health-check.ts
 * Integrated via: npm run dev:app (runs automatically before next dev)
 *
 * The react-server condition lets this CLI import the same server-only
 * modules the app uses; the default Node condition resolves `server-only`
 * to its throwing guard.
 */
import { config } from "dotenv";

import {
  runAdminHealthChecks,
  type AdminHealthCheckStatus,
} from "@/lib/admin/health-checks";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const isColorSupported =
  process.env.NO_COLOR === undefined && process.stdout.isTTY;

const c = {
  reset: isColorSupported ? "\x1b[0m" : "",
  bold: isColorSupported ? "\x1b[1m" : "",
  dim: isColorSupported ? "\x1b[2m" : "",
  green: isColorSupported ? "\x1b[32m" : "",
  red: isColorSupported ? "\x1b[31m" : "",
  yellow: isColorSupported ? "\x1b[33m" : "",
  cyan: isColorSupported ? "\x1b[36m" : "",
  white: isColorSupported ? "\x1b[37m" : "",
  bgGreen: isColorSupported ? "\x1b[42m" : "",
  bgRed: isColorSupported ? "\x1b[41m" : "",
};

function getEnv(key: string): string | undefined {
  const val = process.env[key];
  return val && val.trim() !== "" ? val.trim() : undefined;
}

function renderIcon(status: AdminHealthCheckStatus): string {
  switch (status) {
    case "pass":
      return `${c.green}✓${c.reset}`;
    case "fail":
      return `${c.red}✗${c.reset}`;
    case "warn":
      return `${c.yellow}⚠${c.reset}`;
    case "skip":
      return `${c.dim}○${c.reset}`;
  }
}

function renderReport(report: Awaited<ReturnType<typeof runAdminHealthChecks>>) {
  const divider = `${c.dim}${"─".repeat(56)}${c.reset}`;

  console.log("");
  console.log(
    `  ${c.bold}${c.cyan}🚀 Requo Development Environment${c.reset}`,
  );
  console.log(
    `  ${c.dim}${report.environment} · Node ${process.versions.node} · ${report.totalDuration}ms${c.reset}`,
  );
  console.log("");
  console.log(`  ${divider}`);
  console.log("");

  for (const result of report.results) {
    const icon = renderIcon(result.status);
    const timing = result.duration
      ? ` ${c.dim}${result.duration}ms${c.reset}`
      : "";
    const msg = result.message ? ` ${c.dim}${result.message}${c.reset}` : "";
    console.log(`  ${icon} ${result.name}${msg}${timing}`);

    if (result.status === "fail" && result.hint) {
      console.log(`    ${c.red}↳ ${result.hint}${c.reset}`);
    } else if (result.status === "warn" && result.hint) {
      console.log(`    ${c.yellow}↳ ${result.hint}${c.reset}`);
    }
  }

  console.log("");
  console.log(`  ${divider}`);

  const appUrl = getEnv("BETTER_AUTH_URL") || "http://localhost:3000";
  console.log(`  ${c.white}App:${c.reset}   ${c.cyan}${appUrl}${c.reset}`);
  console.log(
    `  ${c.white}Admin:${c.reset} ${c.cyan}${appUrl}/admin${c.reset}`,
  );
  console.log(`  ${divider}`);
  console.log("");

  if (report.critical > 0) {
    console.log(
      `  ${c.bgRed}${c.white} BLOCKED ${c.reset} ${report.critical} critical issue${report.critical > 1 ? "s" : ""} must be resolved before starting.`,
    );
    console.log("");
  } else if (report.warnings > 0) {
    console.log(
      `  ${c.bgGreen}${c.white} READY ${c.reset} ${c.green}Ready for development${c.reset} ${c.dim}(${report.warnings} optional warning${report.warnings > 1 ? "s" : ""})${c.reset}`,
    );
    console.log("");
  } else {
    console.log(
      `  ${c.bgGreen}${c.white} READY ${c.reset} ${c.green}All systems operational${c.reset}`,
    );
    console.log("");
  }
}

async function main() {
  // Allow skipping health checks for minimal landing page preview
  if (getEnv("SKIP_HEALTH_CHECK") === "1") {
    console.log("");
    console.log(
      `  ${c.yellow}⚠ Health check skipped${c.reset} ${c.dim}(SKIP_HEALTH_CHECK=1)${c.reset}`,
    );
    console.log("");
    const appUrl = getEnv("BETTER_AUTH_URL") || "http://localhost:3000";
    console.log(`  ${c.white}App:${c.reset}   ${c.cyan}${appUrl}${c.reset}`);
    console.log("");
    return;
  }

  const report = await runAdminHealthChecks();
  renderReport(report);

  if (report.critical > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Health check crashed:", err);
  process.exit(1);
});
