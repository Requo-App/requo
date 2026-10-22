#!/usr/bin/env node
/**
 * Captures the README screenshots with native Windows Chrome.
 *
 * The README images are the first thing a visitor sees, and they are drawn by
 * whatever browser took them. A Chromium running inside WSL rasterises glyphs
 * with FreeType, which draws noticeably heavier text than the DirectWrite
 * pipeline of the Chrome the reader actually uses. So the takes come from
 * native Windows Chrome — the same browser, and the same font rasterisation,
 * as the landing walkthrough recording
 * (scripts/marketing/record-landing-walkthrough.mjs).
 *
 * How the browser is reached: this script runs on the WSL side and hands the
 * capture to Windows Node, which drives the repo's own playwright-core
 * (playwright-core is pure JavaScript, so the Linux install runs unchanged on
 * Windows) and launches the installed Google Chrome. Windows Node opens
 * scripts and writes files under \\wsl.localhost\<distro>\..., so the capture
 * writes straight into the repository.
 *
 * Preconditions:
 *   - the app serves --base (the compose app container publishes
 *     http://localhost:3000): `docker compose up -d app`
 *   - demo data is seeded: `npm run db:seed-demo`
 *   - Windows Chrome and Windows Node are installed
 *
 * Usage (from the repo root):
 *   node scripts/marketing/capture-readme-screenshots.mjs --base http://localhost:3000
 *
 * The PNGs are written at 2x (2880x1800 for a 1440x900 viewport): GitHub
 * scales the README image to the column width, where a 1x capture of a
 * 1440px-wide layout is already soft.
 *
 * The landing page plays the recorded walkthrough in its hero, so the take
 * pauses that video on its poster frame — the same frame the hero shows before
 * playback starts. A screenshot of a running video would otherwise be a
 * different (and video-encoded, so softer) picture on every run.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

const DEFAULTS = {
  base: "http://localhost:3000",
  out: "public/screenshots",
  width: 1440,
  height: 900,
  scale: 2,
  // The seed hardcodes the primary owner as user@email.com / 12345678
  // (scripts/seed.ts), like tests/screenshots/readme.spec.ts.
  email: "user@email.com",
  password: "12345678",
  slug: "brightside-print-studio",
  quoteToken: "demoquote1002senttoken",
  headed: false,
};

/**
 * Where the hero's walkthrough poster frame sits in the shipped clip. The
 * poster PNG is extracted from this exact timestamp
 * (public/marketing/requo-walkthrough-poster.png), so pausing the video here
 * reproduces the frame the visitor sees before playback starts.
 */
const POSTER_SECONDS = 29.5;

function parseArgs(argv) {
  const options = { ...DEFAULTS, child: false, repoRoot: REPO_ROOT };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    switch (flag) {
      case "--base":
        options.base = value;
        index += 1;
        break;
      case "--out":
        options.out = value;
        index += 1;
        break;
      case "--width":
        options.width = Number(value);
        index += 1;
        break;
      case "--height":
        options.height = Number(value);
        index += 1;
        break;
      case "--scale":
        options.scale = Number(value);
        index += 1;
        break;
      case "--email":
        options.email = value;
        index += 1;
        break;
      case "--password":
        options.password = value;
        index += 1;
        break;
      case "--slug":
        options.slug = value;
        index += 1;
        break;
      case "--quote-token":
        options.quoteToken = value;
        index += 1;
        break;
      case "--headed":
        options.headed = true;
        break;
      case "--child":
        options.child = true;
        break;
      case "--repo-root":
        options.repoRoot = value;
        index += 1;
        break;
      case "--help":
      case "-h":
        console.log(
          "Usage: capture-readme-screenshots.mjs [--base url] [--out dir] [--width n] [--height n] [--scale n] [--headed]",
        );
        process.exit(0);
      default:
        break;
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

/** How many screenshots this run wrote. */
let captured = 0;

function log(message) {
  console.log(`[readme-shots] ${message}`);
}

/** The output directory. Relative paths are resolved against the repo root. */
function resolveOutDir() {
  return path.isAbsolute(options.out)
    ? path.resolve(options.out)
    : path.resolve(REPO_ROOT, options.out);
}

/* -------------------------------------------------------------------------- */
/*  WSL side: hand the capture to Windows Node                                 */
/* -------------------------------------------------------------------------- */

function windowsPath(linuxPath) {
  const absolute = path.resolve(linuxPath);

  // wslpath knows the distro name and the UNC shape Windows expects.
  const converted = spawnSync("wslpath", ["-w", absolute], { encoding: "utf8" });
  if (converted.status === 0 && converted.stdout.trim()) {
    return converted.stdout.trim();
  }

  const drive = absolute.match(/^\/mnt\/([a-zA-Z])\/(.*)$/);
  if (drive) {
    return `${drive[1].toUpperCase()}:\\${drive[2].replace(/\//g, "\\")}`;
  }

  const distro = process.env.WSL_DISTRO_NAME ?? "Ubuntu";
  return `\\\\wsl.localhost\\${distro}${absolute.replace(/\//g, "\\")}`;
}

function windowsNode() {
  const candidates = [
    "/mnt/c/Program Files/nodejs/node.exe",
    "/mnt/c/Program Files (x86)/nodejs/node.exe",
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  const where = spawnSync("/mnt/c/Windows/System32/cmd.exe", ["/d", "/c", "where", "node"], {
    encoding: "utf8",
  });
  const first = (where.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (first) {
    const drive = first.match(/^([a-zA-Z]):\\(.*)$/);
    if (drive) {
      return `/mnt/${drive[1].toLowerCase()}/${drive[2].replace(/\\/g, "/")}`;
    }
  }

  return null;
}

function delegateToWindows() {
  const node = windowsNode();

  if (!node) {
    throw new Error(
      "Windows Node was not found (looked in C:\\Program Files\\nodejs and on the Windows PATH). " +
        "Install it from https://nodejs.org, or run the capture on Windows directly.",
    );
  }

  const args = [
    windowsPath(fileURLToPath(import.meta.url)),
    "--child",
    "--repo-root",
    windowsPath(REPO_ROOT),
    "--base",
    options.base,
    "--out",
    windowsPath(resolveOutDir()),
    "--width",
    String(options.width),
    "--height",
    String(options.height),
    "--scale",
    String(options.scale),
    "--email",
    options.email,
    "--password",
    options.password,
    "--slug",
    options.slug,
    "--quote-token",
    options.quoteToken,
  ];

  if (options.headed) {
    args.push("--headed");
  }

  log(`delegating to Windows Node (${node})`);
  const result = spawnSync(node, args, { stdio: "inherit", cwd: "/mnt/c" });

  if (result.error) {
    throw result.error;
  }

  process.exit(result.status ?? 1);
}

/* -------------------------------------------------------------------------- */
/*  Windows side: drive Chrome and write the PNGs                              */
/* -------------------------------------------------------------------------- */

async function settle(page, { delay = 1_500 } = {}) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  // The dev server shows a "Compiling" pill while it builds a route.
  await page
    .locator("text=Compiling")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => {});
  // Screenshots show the product, not the dev harness: the Next.js dev tools
  // portal (status pill, issue counter, launcher button) is not part of it.
  await page
    .addStyleTag({ content: "nextjs-portal{display:none!important}" })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(delay);
}

/** Navigates with the retries a dev server behind a container needs. */
async function goto(page, url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      return;
    } catch (error) {
      const message = String(error?.message ?? error);
      // A pending navigation supersedes an immediate one: the post-login
      // redirect, or the dev server's /home answer.
      if (!/ERR_ABORTED|interrupted by another navigation|ERR_ADDRESS_INVALID/.test(message)) {
        throw error;
      }
      await page.waitForTimeout(750);
    }
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

/**
 * Seeded data trips one-time onboarding toasts ("Quote accepted!", "All
 * set!") on the first dashboard load after signing in, and Sonner keeps them
 * up until they are dismissed.
 */
async function dismissToasts(page) {
  const toast = page.locator("[data-sonner-toast]");
  let dismissed = 0;

  while (dismissed < 4 && (await toast.first().isVisible().catch(() => false))) {
    await toast.first().locator("button").last().click({ timeout: 3_000 }).catch(() => {});
    await toast.first().waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    dismissed += 1;
  }

  return dismissed;
}

/**
 * Waits until the screen has been quiet for a while, dismissing toasts on the
 * way. The celebration toasts land a few seconds after the dashboard settles,
 * so a single dismissal pass right after the load would still catch one of
 * them on camera.
 */
async function waitForQuietScreen(page, { quietMs = 8_000, watchMs = 40_000 } = {}) {
  const toast = page.locator("[data-sonner-toast]");
  const deadline = Date.now() + watchMs;
  let quietSince = Date.now();
  let dismissed = 0;

  while (Date.now() < deadline) {
    if (await toast.first().isVisible().catch(() => false)) {
      dismissed += await dismissToasts(page);
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      break;
    }
    await page.waitForTimeout(400);
  }

  if (await toast.first().isVisible().catch(() => false)) {
    throw new Error("A toast is still on screen; the capture would show it.");
  }

  return dismissed;
}

async function dismissTour(page) {
  const skip = page.getByRole("button", { name: "Skip tour" });

  if (await skip.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await skip.click();
    await skip.waitFor({ state: "hidden" }).catch(() => {});
  }
}

/**
 * Puts the business in the state a returning owner sees: the sidebar's
 * getting-started checklist dismissed, and the one-time milestone
 * celebrations already shown.
 *
 * Both are ordinary client-side states the app itself writes — the
 * checklist's "Dismiss" button and the milestone bookkeeping in
 * features/onboarding/milestones.ts — so the capture reaches them through
 * the same keys instead of racing the celebrations to the screenshot.
 */
async function prepareCleanWorkspace(page) {
  await page.evaluate(() => {
    const now = new Date().toISOString();

    localStorage.setItem("requo:checklist:dismissed", now);
    localStorage.setItem("requo:milestone:first-inquiry", now);
    localStorage.setItem("requo:milestone:first-quote-sent", now);
    localStorage.setItem("requo:milestone:first-quote-accepted", now);
  });
}

async function signIn(page) {
  await goto(page, `${options.base}/login`);
  await page.getByLabel("Email address").fill(options.email);
  await page.locator("#password").fill(options.password);
  await page.getByRole("button", { name: "Sign in" }).click();

  // The session cookie is the reliable signal: the post-login redirect can
  // land on the dev server's bind address, which the browser may refuse.
  const hasSession = async () =>
    (await page.context().cookies(options.base)).some((cookie) => cookie.name.includes("session_token"));
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    if (await hasSession().catch(() => false)) {
      return;
    }
    await page.waitForTimeout(500);
  }

  throw new Error("Signing in did not produce a session cookie — is the demo data seeded?");
}

/**
 * Pauses the hero's walkthrough video on its poster frame.
 *
 * The video autoplays once the stage is in view, so a screenshot would
 * otherwise catch a random, video-encoded frame. Pausing the element also
 * stops the hero's own autoplay effect from resuming it.
 */
async function pauseOnPosterFrame(page) {
  const video = page.locator("video").first();
  const mounted = await video
    .waitFor({ state: "attached", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  if (!mounted) {
    log("warning: no walkthrough video on the landing page — the static preview will be captured");
    return;
  }

  await page.evaluate(async (seconds) => {
    const element = document.querySelector("video");

    if (!element) {
      return;
    }

    // Keep the hero's autoplay effect from resuming the clip.
    element.play = () => Promise.resolve();
    element.pause();

    if (element.readyState < 1) {
      await new Promise((resolve) => {
        element.addEventListener("loadedmetadata", resolve, { once: true });
        setTimeout(resolve, 10_000);
      });
    }

    element.currentTime = seconds;
    await new Promise((resolve) => {
      element.addEventListener("seeked", resolve, { once: true });
      setTimeout(resolve, 10_000);
    });
  }, POSTER_SECONDS);
}

async function capture(page, file) {
  await page.screenshot({ path: file });
  captured += 1;
  log(`wrote ${file}`);
}

async function main() {
  const require = createRequire(path.join(options.repoRoot, "package.json"));
  const { chromium } = require("playwright-core");

  const outDir = resolveOutDir();
  mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    channel: "chrome",
    headless: !options.headed,
    args: [
      // Grayscale glyph edges survive a 4:2:0 chroma subsampling far better
      // than LCD fringes — the same reason the walkthrough take uses them.
      "--disable-lcd-text",
      "--force-color-profile=srgb",
    ],
  });

  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.scale,
    colorScheme: "light",
    locale: "en-US",
    reducedMotion: "no-preference",
  });

  const page = await context.newPage();
  page.on("pageerror", (error) => log(`page error: ${String(error.message).slice(0, 200)}`));

  const home = `${options.base}/${options.slug}/home`;
  const inquiries = `${options.base}/${options.slug}/inquiries`;
  const quote = `${options.base}/quote/${options.quoteToken}`;

  // --- Warm-up pass: compiles the routes when running against `next dev` ---
  for (const route of [options.base, home, inquiries, quote]) {
    await goto(page, route);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  }

  // --- Landing page --------------------------------------------------------
  await goto(page, options.base);
  await page.locator("h1").first().waitFor({ state: "visible", timeout: 30_000 });
  await settle(page, { delay: 1_000 });
  await pauseOnPosterFrame(page);
  await page.waitForTimeout(500);
  await capture(page, path.join(outDir, "landing.png"));

  // --- Signed-in pages -----------------------------------------------------
  await signIn(page);
  await goto(page, home);
  await dismissTour(page);
  await prepareCleanWorkspace(page);
  // The checklist and the milestone celebrations are read on mount, so the
  // dashboard is reloaded with the business state in place.
  await goto(page, home);
  await dismissTour(page);
  await page
    .getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })
    .waitFor({ state: "visible", timeout: 30_000 });
  await settle(page, { delay: 1_000 });
  const dismissed = await waitForQuietScreen(page);
  if (dismissed > 0) {
    log(`dismissed ${dismissed} onboarding toast(s) before the dashboard capture`);
  }
  await capture(page, path.join(outDir, "dashboard-home.png"));

  await goto(page, inquiries);
  await dismissTour(page);
  await page
    .locator("main")
    .getByRole("heading", { name: "Inquiries" })
    .waitFor({ state: "visible", timeout: 30_000 });
  await settle(page, { delay: 1_000 });
  await dismissToasts(page);
  await capture(page, path.join(outDir, "inquiries.png"));

  // --- Public quote page ----------------------------------------------------
  await goto(page, quote);
  await settle(page, { delay: 1_000 });
  await capture(page, path.join(outDir, "public-quote.png"));

  await browser.close();
  log(`captured ${captured} screenshots at ${options.width}x${options.height} @${options.scale}x`);
}

// On WSL the capture is handed to Windows Node; on Windows it runs here.
const delegate = !options.child && process.platform !== "win32";

if (delegate) {
  try {
    delegateToWindows();
  } catch (error) {
    console.error(`[readme-shots] failed: ${error?.message ?? error}`);
    process.exit(1);
  }
} else {
  main().catch((error) => {
    console.error(`[readme-shots] failed: ${error?.message ?? error}`);
    process.exit(1);
  });
}
