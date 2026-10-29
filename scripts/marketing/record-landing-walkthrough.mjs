#!/usr/bin/env node
/**
 * Records the landing hero walkthrough — the WebM behind
 * `public/marketing/requo-walkthrough-<theme>.webm`.
 *
 * The driver runs inside the Playwright Docker image because this host has no
 * Chromium system dependencies. `playwright-core` is mounted read-only from the
 * machine-local playwright-cli skill bundle (1.64.x), whose screencast API can
 * deliver JPEG frames; the repo's own Playwright (1.59) cannot.
 *
 * Frames are captured as quality-100 JPEGs and assembled inside this script with
 * the ffmpeg in that same image (`/ms-playwright/ffmpeg-1013/ffmpeg-linux`) at a
 * high-quality VP9 CRF. That is deliberate: the screencast's own WebM encoder is
 * visibly soft on UI text, and `--disable-lcd-text` keeps glyph edges grayscale
 * so 4:2:0 chroma subsampling does not smear colour fringes.
 *
 * Two capture modes:
 *
 *  1. Local (default). Launches Chromium inside the Playwright image; glyphs are
 *     rasterised by FreeType, which renders noticeably heavier than the
 *     DirectWrite text in Windows and macOS browsers.
 *  2. Attached (`--cdp <endpoint>`). Drives a browser that is already running, so
 *     the take carries that host's font rasterisation. The shipping take uses a
 *     headless Chrome on Windows, started from WSL next to the repo:
 *
 *       "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe" \
 *         --headless=new --remote-debugging-port=9222 --remote-allow-origins=* \
 *         --user-data-dir='C:\Users\<you>\AppData\Local\Temp\requo-cdp' \
 *         --no-first-run --no-default-browser-check --window-size=1440,726 \
 *         --force-device-scale-factor=1 --force-color-profile=srgb \
 *         --disable-lcd-text about:blank &
 *
 *     Chrome only listens on the Windows loopback interface, but Docker Desktop
 *     forwards that for containers. Address it by IP, not by name: the DevTools
 *     endpoint rejects any Host header that is not an IP or "localhost".
 *
 *       docker run --rm mcr.microsoft.com/playwright:v1.64.1-noble \
 *         getent hosts host.docker.internal          # -> 192.168.65.254
 *
 *     The attached browser opens the app itself, so that container run does not
 *     need `--network=host`, and `--cdp http://192.168.65.254:9222` selects this
 *     mode.
 *
 * The pointer is a synthetic overlay (arrow over the page, hand over anything
 * clickable) because the screencast cursor cannot change shape. Pass
 * `--cursor-dir` with bitmaps from the recording machine's cursor scheme so the
 * pointer is the artwork that machine really draws; without it the overlay falls
 * back to hand-drawn SVG. Extract the bitmaps once, from WSL:
 *
 *   node scripts/marketing/extract-windows-cursors.mjs --out .walkthrough/cursors
 *
 * Preconditions:
 *   - fresh demo data: `npm run db:seed-demo` (the take creates a draft quote,
 *     so reseed before recording the second theme)
 *   - a production build serving the base URL, so the quote editor does not
 *     sit on its cold "Creating draft…" state: `npm run build`, then
 *     `npm run start:app -- -H 0.0.0.0 -p 3000`. The port must match
 *     `BETTER_AUTH_URL` (http://localhost:3000 in `.env.local`), or Better Auth
 *     rejects the sign-in origin.
 *
 * Record (from the repo root):
 *   docker run --rm --network=host \
 *     -v "$HOME/.config/opencode/skills/product-showcase/node_modules/playwright-core:/work/node_modules/playwright-core:ro" \
 *     -v "$PWD/scripts/marketing/record-landing-walkthrough.mjs:/work/record.mjs:ro" \
 *     -v "$PWD/.walkthrough:/out" \
 *     -w /work mcr.microsoft.com/playwright:v1.64.1-noble \
 *     node /work/record.mjs --base http://localhost:3000 --out /out --theme light
 *
 * The walk ends back on the dashboard, with the pointer parked where the take
 * opens so the loop seam is quiet. Sending stays out of frame: the demo
 * business's scope recipe requires deliverable sections that the editor cannot
 * add yet, so a send click would surface the send-gate error.
 *
 * A production take needs no trim or speed pass — the draft quote is created
 * in well under a second, and the walk fits in about 34s. Copy it straight to
 * the shipped asset and take the poster from the opening frame, so the frame
 * the hero shows before playback is the first frame of the loop:
 *
 *   theme=light   # or dark, matching the take you just recorded
 *   cp ".walkthrough/requo-walkthrough-${theme}.webm" \
 *     "public/marketing/requo-walkthrough-${theme}.webm"
 *   ffmpeg -ss 0 -i "public/marketing/requo-walkthrough-${theme}.webm" \
 *     -frames:v 1 -update 1 \
 *     "public/marketing/requo-walkthrough-${theme}-poster.png"
 *
 * The pointer art comes from `--cursor-dir`, filled by
 * `extract-windows-cursors.mjs` so the arrow and hand are the machine's real
 * Windows Default scheme cursors (aero_arrow.cur / aero_link.cur).
 *
 * The hero ships one take per theme. Reseed, then run the same Docker command
 * with `--theme light`; reseed again and run it with `--theme dark`. Each run
 * writes `requo-walkthrough-<theme>.webm`; extract the matching poster from
 * the opening frame into `requo-walkthrough-<theme>-poster.png` (see above).
 */

import { spawn } from "node:child_process";
import {
  appendFileSync,
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readSync,
  rmSync,
  statSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium } from "playwright-core";

const DEFAULTS = {
  base: "http://localhost:3000",
  out: ".walkthrough",
  slug: "brightside-print-studio",
  // Stable, hand-authored seed fixtures (scripts/seed.ts). The account and
  // fixture defaults match tests/e2e/fixtures.ts and tests/screenshots.
  inquiryId: "demo_inquiry_new_storefront",
  // Seeded quote used only to precompile the quote detail route before the
  // camera rolls (the recording creates its own quote).
  warmQuoteId: "demo_quote_sent_1002",
  email: process.env.WALKTHROUGH_EMAIL ?? "user@email.com",
  password: process.env.WALKTHROUGH_PASSWORD ?? "12345678",
  width: 1440,
  height: 726,
  // The hero ships a light and a dark take; the theme is pinned for the whole
  // run so the recording matches the page the visitor is looking at.
  theme: "light",
  // 60 fps because the renderers capture at ~60 during motion; slower output
  // judders the pointer and scroll beats.
  fps: 60,
  crf: 22,
  ffmpeg: "/ms-playwright/ffmpeg-1013/ffmpeg-linux",
  // When set, drive this browser over CDP instead of launching Chromium.
  cdp: "",
  // Cursor bitmaps (arrow.png/hand.png + .json hotspots) for the pointer
  // overlay; see scripts/marketing/extract-windows-cursors.mjs.
  cursorDir: "",
  framesDir: "",
  keepFrames: false,
};

const CURSOR_STYLE = `
#requo-demo-cursor{position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;will-change:transform;}
/* Tailwind's preflight clamps images with max-width:100%, and this container has
   no width of its own, so the pointer bitmaps must opt out to keep their size. */
#requo-demo-cursor [data-shape]{position:absolute;left:0;top:0;display:none;max-width:none;max-height:none;filter:drop-shadow(0 1px 1.5px rgba(15,23,42,.35));}
#requo-demo-cursor[data-shape="arrow"] [data-shape="arrow"],
#requo-demo-cursor[data-shape="hand"] [data-shape="hand"]{display:block;}
`;

// Fallback pointer art, used when --cursor-dir is not given.
const SVG_CURSOR_MARKUP = `
<div id="requo-demo-cursor" data-shape="arrow">
  <svg data-shape="arrow" width="21" height="24" viewBox="0 0 21 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M0.7 0.7 L0.7 17.4 L5.2 13.2 L7.7 19.5 L10.7 18.3 L8.2 12.1 L14.7 11.7 Z"
      fill="#0f172a" stroke="#ffffff" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>
  <svg data-shape="hand" width="24" height="26" viewBox="0 0 24 26" xmlns="http://www.w3.org/2000/svg">
    <path d="M10.4 1.2 h3.3 a1.9 1.9 0 0 1 1.9 1.9 v8.4 l1.3 -.3 a2.15 2.15 0 0 1 2.6 1.5 l.5 1.8 c.1.4 .1 .8 .1 1.2 v2.2 A7.9 7.9 0 0 1 12.2 26.3 h-1.5 a7.9 7.9 0 0 1 -6.8 -3.9 l-2.9 -4.6 a2.05 2.05 0 0 1 .7 -2.8 l.2 -.1 a2.05 2.05 0 0 1 2.7 .6 l1.4 1.9 V3.1 a1.9 1.9 0 0 1 1.9 -1.9 z"
      fill="#ffffff" stroke="#0f172a" stroke-width="1.35" stroke-linejoin="round"/>
  </svg>
</div>`;

// Hotspot of each SVG shape, in its own viewBox coordinates.
const SVG_CURSOR_HOTSPOTS = {
  arrow: { x: 1, y: 1 },
  hand: { x: 12, y: 1.6 },
};

/**
 * Builds the pointer overlay from the recording machine's cursor scheme (PNGs
 * plus hotspot JSON from extract-windows-cursors.mjs) or from the SVG fallback.
 */
function loadCursorArt(cursorDir) {
  if (!cursorDir) {
    return { markup: SVG_CURSOR_MARKUP, hotspots: SVG_CURSOR_HOTSPOTS };
  }

  const dir = path.resolve(cursorDir);
  const images = [];
  const hotspots = {};

  for (const shape of ["arrow", "hand"]) {
    const png = readFileSync(path.join(dir, `${shape}.png`));
    const meta = JSON.parse(readFileSync(path.join(dir, `${shape}.json`), "utf8"));
    images.push(
      `  <img data-shape="${shape}" alt="" width="${meta.width}" height="${meta.height}"` +
        ` src="data:image/png;base64,${png.toString("base64")}">`,
    );
    hotspots[shape] = { x: meta.hotspotX, y: meta.hotspotY };
  }

  return {
    markup: `\n<div id="requo-demo-cursor" data-shape="arrow">\n${images.join("\n")}\n</div>`,
    hotspots,
  };
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];

    if (flag === "--base") {
      options.base = value;
      index += 1;
    } else if (flag === "--out") {
      options.out = value;
      index += 1;
    } else if (flag === "--slug") {
      options.slug = value;
      index += 1;
    } else if (flag === "--inquiry") {
      options.inquiryId = value;
      index += 1;
    } else if (flag === "--warm-quote") {
      options.warmQuoteId = value;
      index += 1;
    } else if (flag === "--email") {
      options.email = value;
      index += 1;
    } else if (flag === "--password") {
      options.password = value;
      index += 1;
    } else if (flag === "--theme") {
      if (value !== "light" && value !== "dark") {
        throw new Error(`--theme must be "light" or "dark" (received ${value})`);
      }
      options.theme = value;
      index += 1;
    } else if (flag === "--fps") {
      options.fps = Number(value);
      index += 1;
    } else if (flag === "--crf") {
      options.crf = Number(value);
      index += 1;
    } else if (flag === "--cdp") {
      options.cdp = value;
      index += 1;
    } else if (flag === "--cursor-dir") {
      options.cursorDir = value;
      index += 1;
    } else if (flag === "--ffmpeg") {
      options.ffmpeg = value;
      index += 1;
    } else if (flag === "--frames-dir") {
      options.framesDir = value;
      index += 1;
    } else if (flag === "--keep-frames") {
      options.keepFrames = true;
    } else if (flag === "--help" || flag === "-h") {
      console.log(
        "Usage: record.mjs [--base url] [--out dir] [--theme light|dark] [--slug slug] [--inquiry id] [--crf n] [--fps n] [--cdp endpoint] [--cursor-dir dir]",
      );
      process.exit(0);
    }
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));

const cursorArt = loadCursorArt(options.cursorDir);

// The page this run drives. Closed from the top-level catch so a failed take
// does not leave stray tabs behind in an attached browser.
let activePage = null;

function log(message) {
  console.log(`[walkthrough] ${message}`);
}

async function hold(page, ms) {
  await page.waitForTimeout(ms);
}

async function mustSee(locator, label, timeout = 20_000) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
  } catch {
    throw new Error(
      `Expected "${label}" to be visible. Reseed the demo data (npm run db:seed-demo)?`,
    );
  }
}

/**
 * Seeded data trips one-time onboarding toasts ("Quote accepted!", "All set!")
 * on the first dashboard load after signing in. Sonner keeps them up until they
 * are dismissed, so close them rather than waiting for a timeout that never
 * comes. Returns how many were closed.
 */
async function dismissToasts(page) {
  const toast = page.locator("[data-sonner-toast]");
  let dismissed = 0;

  while (dismissed < 4 && (await toast.first().isVisible().catch(() => false))) {
    // Sonner renders the close affordance as the toast's last button.
    await toast.first().locator("button").last().click({ timeout: 3_000 }).catch(() => {});
    await toast.first().waitFor({ state: "hidden", timeout: 5_000 }).catch(() => {});
    dismissed += 1;
  }

  return dismissed;
}

/**
 * Scene checks follow in-app (client) navigations, which can occasionally settle
 * on the previously rendered UI — a param-less quote editor, an inquiries list
 * without its toolbar. A hard load renders the correct page, and the warning
 * marks takes worth re-checking on the frames around this scene.
 */
async function mustSeeScene(page, locator, label) {
  try {
    // Generous: a cold business page can legitimately take ten seconds under
    // local dev load, and only a stuck render needs the reload below.
    await locator.first().waitFor({ state: "visible", timeout: 15_000 });
    return;
  } catch {
    log(`warning: "${label}" did not render after the in-app navigation — reloading`);
  }

  await goto(page, page.url());
  await mustSee(locator, label);
}

function normalizeValue(value) {
  return value.replace(/[^0-9a-z]/gi, "").toLowerCase();
}

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

async function goto(page, url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
      return;
    } catch (error) {
      const message = String(error?.message ?? error);
      // A pending navigation supersedes an immediate one: the post-login
      // redirect, or the dev server's /home answer (an absolute redirect to
      // http://0.0.0.0:3000, which Windows Chrome rejects). Let it land and retry.
      if (!/ERR_ABORTED|interrupted by another navigation|ERR_ADDRESS_INVALID/.test(message)) {
        throw error;
      }
      await page.waitForTimeout(750);
    }
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

/** Waits for fonts, quiet network, and a clean (pill-free) frame. */
async function settle(page, { delay = 900 } = {}) {
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  await page
    .locator("text=Compiling")
    .waitFor({ state: "hidden", timeout: 30_000 })
    .catch(() => {});
  // Screenshots show the product, not the dev harness (no-op in production).
  await page
    .addStyleTag({ content: "nextjs-portal{display:none!important}" })
    .catch(() => {});
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  await page.waitForTimeout(delay);
}

/* -------------------------------------------------------------------------- */
/*  Synthetic pointer                                                          */
/* -------------------------------------------------------------------------- */

const cursorState = { x: 720, y: 420 };

async function ensureCursor(page) {
  const present = await page
    .evaluate(() => Boolean(document.getElementById("requo-demo-cursor")))
    .catch(() => false);
  if (present) {
    return;
  }

  await page.addStyleTag({ content: CURSOR_STYLE }).catch(() => {});
  await page.evaluate(
    ({ markup, hotspots, x, y }) => {
      const holder = document.createElement("div");
      holder.innerHTML = markup.trim();
      const cursor = holder.firstElementChild;
      document.body.appendChild(cursor);

      const shapeFor = (px, py) => {
        const element = document.elementFromPoint(px, py);
        if (!element) return "arrow";
        // Text fields keep the arrow: the overlay only distinguishes the
        // resting pointer from the clickable one.
        if (
          element.closest(
            "a,button,label,summary,select,[role=button],[type=checkbox],[type=radio],[type=submit],[type=file]",
          )
        ) {
          return "hand";
        }
        return "arrow";
      };

      window.__walkthroughCursor = {
        place(px, py) {
          const shape = shapeFor(px, py);
          const hotspot = hotspots[shape] ?? hotspots.arrow;
          cursor.dataset.shape = shape;
          cursor.style.transform = `translate3d(${px - hotspot.x}px, ${py - hotspot.y}px, 0)`;
        },
      };

      window.__walkthroughCursor.place(x, y);
    },
    { markup: cursorArt.markup, hotspots: cursorArt.hotspots, x: cursorState.x, y: cursorState.y },
  );
}

async function placeCursor(page, x, y) {
  cursorState.x = x;
  cursorState.y = y;
  await page.evaluate(({ x: px, y: py }) => {
    window.__walkthroughCursor?.place(px, py);
  }, { x, y });
}

async function moveCursorTo(page, target, { duration = 620 } = {}) {
  await ensureCursor(page);

  let to;
  if (typeof target === "object" && typeof target.x === "number") {
    to = { x: target.x, y: target.y };
  } else {
    const box = await target.first().boundingBox();
    if (!box) {
      throw new Error("Cursor target is not visible");
    }
    to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  const from = { x: cursorState.x, y: cursorState.y };
  cursorState.x = to.x;
  cursorState.y = to.y;

  // The overlay interpolates on the page's own frame clock, so pointer motion is
  // as smooth as the capture rate allows instead of stepping once per CDP round
  // trip. The real mouse walks the same eased path for hover styles (nav
  // highlight, button states) and is the only part throttled by latency.
  const overlaySettled = page
    .evaluate(
      ({ from: start, to: end, ms }) => {
        const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
        const startedAt = performance.now();
        return new Promise((resolve) => {
          const step = (now) => {
            const progress = Math.min(1, (now - startedAt) / ms);
            const eased = ease(progress);
            window.__walkthroughCursor?.place(
              start.x + (end.x - start.x) * eased,
              start.y + (end.y - start.y) * eased,
            );
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      },
      { from, to, ms: duration },
    )
    .catch(() => {});

  // Coarse samples: the overlay above carries the visible motion, and each real
  // move costs a round trip (the attached browser is only reachable over the
  // Docker gateway), so a step per 16 ms would stretch every pointer move. Each
  // step still spends `duration / steps` on the clock, minus its own latency, so
  // the move ends when the overlay does.
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    const eased = easeInOutCubic(step / steps);
    const x = from.x + (to.x - from.x) * eased;
    const y = from.y + (to.y - from.y) * eased;
    const startedAt = Date.now();
    await page.mouse.move(x, y);
    const remaining = duration / steps - (Date.now() - startedAt);
    if (remaining > 0) {
      await page.waitForTimeout(remaining);
    }
  }

  await overlaySettled;
  await placeCursor(page, to.x, to.y);
  return to;
}

async function clickTarget(page, target, { duration = 620, settle: settleMs = 160 } = {}) {
  const locator = target.first();
  await locator.scrollIntoViewIfNeeded().catch(() => {});
  await moveCursorTo(page, locator, { duration });
  await hold(page, 150);
  await locator.click({ delay: 60 });
  await hold(page, settleMs);
}

async function typeInto(page, target, text, { delay = 60 } = {}) {
  const field = target.first();

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (attempt === 1) {
      await moveCursorTo(page, field).catch(() => {});
    }
    await field.click();
    await field.press("ControlOrMeta+a").catch(() => {});
    await field.press("Backspace").catch(() => {});
    await field.pressSequentially(text, { delay });

    const value = await field.inputValue().catch(() => null);
    if (value !== null && normalizeValue(value) === normalizeValue(text)) {
      return;
    }

    await page.waitForTimeout(400);
  }

  throw new Error(`Typing "${text}" did not stick — was the field hydrated?`);
}

/* -------------------------------------------------------------------------- */
/*  Scrolling                                                                  */
/* -------------------------------------------------------------------------- */

async function smoothScroll(page, deltaY, { duration = 850 } = {}) {
  await page.evaluate(
    ({ deltaY: delta, duration: ms }) => {
      const scroller = document.scrollingElement;
      const start = scroller.scrollTop;
      const max = scroller.scrollHeight - scroller.clientHeight;
      const target = Math.max(0, Math.min(max, start + delta));

      return new Promise((resolve) => {
        const startedAt = performance.now();
        const step = (now) => {
          const progress = Math.min(1, (now - startedAt) / ms);
          scroller.scrollTop = start + (target - start) * easeInOutCubicLocal(progress);
          if (progress < 1) {
            requestAnimationFrame(step);
          } else {
            resolve();
          }
        };
        const easeInOutCubicLocal = (t) =>
          t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        requestAnimationFrame(step);
      });
    },
    { deltaY, duration },
  );
  await hold(page, 140);
}

async function scrollToTop(page) {
  await smoothScroll(page, -100_000, { duration: 700 });
}

async function revealTarget(page, target, { duration = 700 } = {}) {
  const box = await target.first().boundingBox();
  if (!box) {
    return;
  }
  const desiredY = options.height * 0.62;
  const delta = box.y - desiredY;
  if (Math.abs(delta) > 24) {
    await smoothScroll(page, delta, { duration });
  }
}

/* -------------------------------------------------------------------------- */
/*  Capture + assembly                                                         */
/* -------------------------------------------------------------------------- */

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${path.basename(command)} exited with code ${code}`));
      }
    });
  });
}

/**
 * Duplicates captured frames so playback matches the wall-clock timeline, then
 * encodes the duplicate-free MJPEG stream to VP9. The screencast only delivers
 * frames when the page changes, so a quiet hold yields very few frames — the
 * repeated frames cost almost nothing once compressed.
 */
async function assembleVideo({ sequencePath, trace, stoppedAt, outputPath }) {
  const frameMs = 1000 / options.fps;
  const duplicatedPath = `${sequencePath}.timeline.mjpeg`;

  const readFd = openSync(sequencePath, "r");
  const writeFd = openSync(duplicatedPath, "w");
  let offset = 0;
  let frames = 0;

  for (let index = 0; index < trace.length; index += 1) {
    const frame = trace[index];
    const next = trace[index + 1]
      ? trace[index + 1].t
      : Math.max(stoppedAt, frame.t + frameMs);
    const repeats = Math.max(1, Math.round((next - frame.t) / frameMs));
    const buffer = Buffer.allocUnsafe(frame.size);

    readSync(readFd, buffer, 0, frame.size, offset);
    offset += frame.size;

    for (let repeat = 0; repeat < repeats; repeat += 1) {
      writeSync(writeFd, buffer);
    }
    frames += repeats;
  }

  closeSync(readFd);
  closeSync(writeFd);

  const bytes = statSync(duplicatedPath).size;
  const seconds = frames / options.fps;
  log(
    `assembling ${frames} frames (${seconds.toFixed(1)}s, ${(bytes / 1_048_576).toFixed(0)} MB) at crf ${options.crf}`,
  );

  await run(options.ffmpeg, [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "image2pipe",
    "-vcodec",
    "mjpeg",
    "-framerate",
    String(options.fps),
    "-i",
    duplicatedPath,
    "-c:v",
    "libvpx-vp9",
    "-crf",
    String(options.crf),
    "-b:v",
    "0",
    "-row-mt",
    "1",
    "-cpu-used",
    "3",
    "-pix_fmt",
    "yuv420p",
    "-tune-content",
    "screen",
    "-an",
    outputPath,
  ]);

  rmSync(duplicatedPath, { force: true });
}

/* -------------------------------------------------------------------------- */

/**
 * Starts frame capture. Local runs use Playwright's screencast; an attached
 * browser exposes no such API, so the underlying CDP screencast is driven
 * directly (same JPEG frames, same clock). Both paths append quality-100 JPEGs
 * to `sequencePath` and record `{ t, size }` in epoch milliseconds.
 */
async function startCapture({ page, session, sequencePath }) {
  const trace = [];
  const lastFrame = { wall: Date.now() };

  const onFrame = (data, timestamp) => {
    appendFileSync(sequencePath, data);
    trace.push({ t: timestamp, size: data.length });
    lastFrame.wall = Date.now();
  };

  // End of the last frame on the trace clock: the closing hold is only as long
  // as the wall time since the final frame, which is how the screencast clock
  // and the driver's clock are reconciled.
  const stoppedAt = () => {
    const last = trace[trace.length - 1];
    return last ? last.t + Math.max(0, Date.now() - lastFrame.wall) : Date.now();
  };

  if (session) {
    session.on("Page.screencastFrame", (event) => {
      onFrame(Buffer.from(event.data, "base64"), event.metadata.timestamp * 1000);
      session.send("Page.screencastFrameAck", { sessionId: event.sessionId }).catch(() => {});
    });
    await session.send("Page.startScreencast", {
      format: "jpeg",
      quality: 100,
      maxWidth: options.width,
      maxHeight: options.height,
      everyNthFrame: 1,
    });
    return { trace, stoppedAt, stop: () => session.send("Page.stopScreencast").catch(() => {}) };
  }

  await page.screencast.start({
    onFrame: (frame) => onFrame(frame.data, frame.timestamp),
    size: { width: options.width, height: options.height },
    quality: 100,
  });
  return { trace, stoppedAt, stop: () => page.screencast.stop() };
}

/* -------------------------------------------------------------------------- */

async function main() {
  const outDir = path.resolve(options.out);
  mkdirSync(outDir, { recursive: true });
  const videoPath = path.join(outDir, `requo-walkthrough-${options.theme}.webm`);
  const framesDir =
    options.framesDir || mkdtempSync(path.join(tmpdir(), "requo-walkthrough-"));
  mkdirSync(framesDir, { recursive: true });
  const sequencePath = path.join(framesDir, "frames.mjpeg");

  // Either launch a local Chromium (FreeType glyphs) or attach to a browser
  // that already runs on the host whose text rendering the take should match.
  const attached = Boolean(options.cdp);
  let browser;
  let page;
  let cdpSession = null;

  if (attached) {
    browser = await chromium.connectOverCDP(options.cdp);
    const context = browser.contexts()[0];
    if (!context) {
      throw new Error(`No browser context available at ${options.cdp}`);
    }
    page = await context.newPage();
    activePage = page;
    cdpSession = await context.newCDPSession(page);
    await cdpSession.send("Emulation.setDeviceMetricsOverride", {
      width: options.width,
      height: options.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdpSession
      .send("Emulation.setEmulatedMedia", {
        media: "",
        features: [
          { name: "prefers-color-scheme", value: options.theme },
          { name: "prefers-reduced-motion", value: "no-preference" },
        ],
      })
      .catch(() => {});
    await cdpSession.send("Emulation.setLocaleOverride", { locale: "en-US" }).catch(() => {});
    log(`attached to ${browser.version()} at ${options.cdp}`);
  } else {
    browser = await chromium.launch({
      // Grayscale glyph edges survive 4:2:0 encoding far better than LCD fringes.
      args: ["--disable-lcd-text"],
    });
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
      colorScheme: options.theme,
      locale: "en-US",
      reducedMotion: "no-preference",
    });
    page = await context.newPage();
  }

  // The app's theme bootstrap reads this storage key before paint. Set it on
  // every navigation so an attached browser profile left in the other theme
  // cannot leak into the take. The authenticated profile marker makes
  // ThemePreferenceSync restore the saved user preference, so clear it too.
  await page.addInitScript((theme) => {
    try {
      localStorage.setItem("requo-theme", theme);
      localStorage.removeItem("requo-theme-user");
      document.documentElement.classList.toggle("dark", theme === "dark");
      document.documentElement.style.colorScheme = theme;
    } catch {}
  }, options.theme);

  // Page errors explain a scene that never renders; keep them in the take log.
  page.on("pageerror", (error) => log(`page error: ${String(error.message).slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      log(`console error: ${message.text().slice(0, 200)}`);
    }
  });

  // --- Sign in before the camera rolls -------------------------------------
  // An attached browser keeps its profile between takes, and `db:seed-demo`
  // deletes every `session` row. A cookie left over from an earlier take can
  // then outlive its session and expire mid-recording, which shows up as an
  // unexpectedly empty page. Clear cookies so each take signs in for real.
  await page
    .context()
    .clearCookies()
    .catch((error) => log(`could not clear cookies: ${error?.message ?? error}`));

  await goto(page, `${options.base}/login`);
  const emailField = page.getByLabel("Email address");
  const signingIn = await emailField
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (signingIn) {
    await emailField.fill(options.email);
    await page.locator("#password").fill(options.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    // Signing in lands on /home, which answers with an absolute redirect to the
    // dev server's bind address (http://0.0.0.0:3000). Linux Chrome maps that to
    // localhost; Windows Chrome rejects it with ERR_ADDRESS_INVALID and shows an
    // error page, so the URL after the click says nothing about whether the
    // sign-in worked. Wait for the session cookie itself (Playwright reads
    // HttpOnly cookies) before walking past /home.
    const sessionCookie = async () =>
      (await page.context().cookies(options.base)).some((cookie) =>
        cookie.name.includes("session_token"),
      );
    const signedInBy = Date.now() + 60_000;
    while (Date.now() < signedInBy) {
      if (await sessionCookie().catch(() => false)) {
        break;
      }
      await page.waitForTimeout(500);
    }
    if (!(await sessionCookie().catch(() => false))) {
      log("warning: no session cookie after signing in");
    }
  }

  const origin = new URL(options.base).origin;
  const home = `${origin}/${options.slug}/home`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await goto(page, home);
    const greeting = await page
      .getByRole("heading", { name: /^Good (morning|afternoon|evening)/ })
      .isVisible()
      .catch(() => false);
    if (greeting) {
      break;
    }
    await page.waitForTimeout(1500);
  }
  log(`signed in; driving ${origin}`);

  const inquiries = `${origin}/${options.slug}/inquiries`;
  const inquiry = `${origin}/${options.slug}/inquiries/${options.inquiryId}`;

  await goto(page, home);
  await settle(page);
  const skipTour = page.getByRole("button", { name: "Skip tour" });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
    await skipTour.waitFor({ state: "hidden" }).catch(() => {});
  }

  // --- Warm-up pass (compiles routes when running against `next dev`) ------
  for (const route of [
    home,
    inquiries,
    inquiry,
    `${origin}/${options.slug}/quotes/new?inquiryId=${options.inquiryId}`,
    `${origin}/${options.slug}/quotes`,
    `${origin}/${options.slug}/quotes/${options.warmQuoteId}`,
  ]) {
    await goto(page, route);
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
  }

  // --- Scene 1: dashboard home ---------------------------------------------
  await goto(page, home);
  await mustSee(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
    "dashboard greeting",
  );
  await settle(page);
  await ensureCursor(page);

  // Scene 1 is the first dashboard load after signing in, which can trip
  // one-time onboarding toasts ("Quote accepted!", "All set!"). The celebration
  // lands a few seconds after the dashboard settles, so keep dismissing until the
  // screen has been quiet for a while: a take must not open on such a toast.
  const toast = page.locator("[data-sonner-toast]");
  let dismissedToasts = 0;
  let quietSince = Date.now();
  const toastWatchUntil = Date.now() + 30_000;
  while (Date.now() < toastWatchUntil) {
    if (await toast.first().isVisible().catch(() => false)) {
      dismissedToasts += await dismissToasts(page);
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= 8_000) {
      break;
    }
    await page.waitForTimeout(400);
  }
  if (dismissedToasts > 0) {
    log(`dismissed ${dismissedToasts} onboarding toast(s) before recording`);
  }
  if (await toast.first().isVisible().catch(() => false)) {
    throw new Error("An onboarding toast is still on screen; the take would show it.");
  }

  log(`recording to ${videoPath}`);
  const capture = await startCapture({ page, session: cdpSession, sequencePath });

  await hold(page, 800);
  await smoothScroll(page, 420, { duration: 900 });
  await hold(page, 850);
  await scrollToTop(page);
  await hold(page, 250);

  // --- Scene 2: open the inquiries inbox -----------------------------------
  await clickTarget(page, page.locator(`a[href="/${options.slug}/inquiries"]`));
  await page.waitForURL(/\/inquiries$/);
  await mustSeeScene(page, page.getByLabel("Search inquiries"), "inquiries search");
  await settle(page, { delay: 700 });

  // --- Scene 3: find the inquiry, open it ----------------------------------
  const search = page.getByLabel("Search inquiries");
  await typeInto(page, search, "Foundry", { delay: 70 });
  // The lookup is debounced; the applied filter lands in the URL.
  await page.waitForURL((url) => url.searchParams.get("q") === "Foundry", {
    timeout: 15_000,
  });
  const inquiryRow = page.locator(
    `main a[href$="/inquiries/${options.inquiryId}"]:visible`,
  );
  await mustSee(inquiryRow, "seeded inquiry row");
  await hold(page, 550);
  await clickTarget(page, inquiryRow);
  await page.waitForURL(new RegExp(`/inquiries/${options.inquiryId}$`));
  await settle(page, { delay: 1000 });

  // --- Scene 4: read the inquiry, generate a quote --------------------------
  await smoothScroll(page, 620, { duration: 950 });
  await hold(page, 900);
  await scrollToTop(page);
  await hold(page, 220);
  const generateQuote = page.getByRole("link", { name: "Generate quote" });
  await clickTarget(page, generateQuote);
  await page.waitForURL(/\/quotes\/new\?inquiryId=/);
  await mustSeeScene(
    page,
    page.getByRole("heading", { name: "Turn this inquiry into a quote" }),
    "quote editor heading",
  );
  await settle(page, { delay: 900 });

  // --- Scene 5: price the quote (realistic typing) -------------------------
  const description = page.getByLabel("Item 1 description");
  await mustSee(description, "line item description");
  await typeInto(page, description, "Booth backdrop and counter wrap", {
    delay: 42,
  });
  await hold(page, 320);

  const unitPrice = page.getByLabel("Item 1 unit price");
  await mustSee(unitPrice, "line item unit price");
  await typeInto(page, unitPrice, "1850", { delay: 90 });
  await hold(page, 650);

  const createDraft = page.getByRole("button", { name: "Create draft quote" });
  await mustSee(createDraft, "Create draft quote button");
  await revealTarget(page, createDraft, { duration: 750 });
  await clickTarget(page, createDraft, { duration: 520 });
  await page.waitForURL(
    (url) => /^\/[^/]+\/quotes\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith("/new"),
    { timeout: 120_000 },
  );
  await settle(page, { delay: 1100 });

  // --- Scene 6: review the created draft quote -----------------------------
  await smoothScroll(page, 560, { duration: 950 });
  await hold(page, 950);
  await scrollToTop(page);
  await hold(page, 220);

  // The cursor settles on Send to show the next step without clicking it —
  // see the header note about the scope send gate.
  const sendButton = page.getByRole("button", { name: /^Send( quote)?$/ });
  await mustSeeScene(page, sendButton, "Send button");
  await moveCursorTo(page, sendButton, { duration: 620 });
  await hold(page, 1500);

  // --- Scene 7: back to the dashboard (loop-friendly closing frame) --------
  await clickTarget(page, page.locator(`a[href="/${options.slug}/home"]`));
  await page.waitForURL(/\/home$/);
  await mustSeeScene(
    page,
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening)/ }),
    "dashboard greeting",
  );
  // Let the streamed cards finish so the closing frame matches the opening.
  await settle(page, { delay: 2200 });

  // Park the pointer where the take opens so the loop seam is invisible.
  await moveCursorTo(page, { x: 720, y: 420 }, { duration: 700 });
  await hold(page, 700);

  const stoppedAt = capture.stoppedAt();
  await capture.stop();
  if (attached) {
    // The attached browser belongs to the operator: closing it from here would
    // end a process this script did not start, so only this run's page goes.
    await page.close().catch(() => {});
  } else {
    await browser.close();
  }

  log(`captured ${capture.trace.length} frames`);
  await assembleVideo({ sequencePath, trace: capture.trace, stoppedAt, outputPath: videoPath });

  if (!options.keepFrames) {
    rmSync(framesDir, { recursive: true, force: true });
  } else {
    log(`kept capture frames in ${framesDir}`);
  }

  log(`wrote ${videoPath} (${(statSync(videoPath).size / 1_048_576).toFixed(1)} MB)`);

  if (attached) {
    // The attached browser is not ours to close and its CDP connection keeps the
    // event loop alive, so end the process now that the take is complete.
    process.exit(0);
  }
}

main().catch(async (error) => {
  console.error(`[walkthrough] failed: ${error?.message ?? error}`);
  await activePage
    ?.evaluate(() => ({
      url: location.href,
      text: document.body.innerText.slice(0, 240).replace(/\s+/g, " "),
    }))
    .then(({ url, text }) => log(`page was at ${url} — ${text}`))
    .catch(() => {});
  await activePage?.close().catch(() => {});
  process.exit(1);
});
