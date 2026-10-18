#!/usr/bin/env node
/**
 * Extracts cursor bitmaps from the active Windows cursor scheme so the synthetic
 * pointer in `record-landing-walkthrough.mjs` is the artwork this machine really
 * draws. Chrome uses the system cursors for the default arrow and for
 * `cursor: pointer`, so these files are what a viewer of the product sees.
 *
 * The bitmaps stay on the recording machine: this script writes them into the
 * (ignored) output directory, and the recorder picks them up through
 * `--cursor-dir`. Nothing is copied into the repository.
 *
 * Run from WSL, which has `reg.exe` interop and `/mnt/c`:
 *   node scripts/marketing/extract-windows-cursors.mjs --out .walkthrough/cursors
 *
 * Then give the recording that directory:
 *   --cursor-dir /cursors        (with "$PWD/.walkthrough/cursors:/cursors:ro")
 *
 * Use `--arrow`/`--hand` to override the scheme entries (Windows or WSL paths).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";

const CURSOR_KEY = "HKCU\\Control Panel\\Cursors";
const FALLBACKS = {
  arrow: "C:\\Windows\\Cursors\\aero_arrow.cur",
  hand: "C:\\Windows\\Cursors\\aero_link.cur",
};

function parseArgs(argv) {
  const options = { out: ".walkthrough/cursors", arrow: "", hand: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--out") {
      options.out = value;
      index += 1;
    } else if (flag === "--arrow") {
      options.arrow = value;
      index += 1;
    } else if (flag === "--hand") {
      options.hand = value;
      index += 1;
    } else if (flag === "--help" || flag === "-h") {
      console.log("Usage: extract-windows-cursors.mjs [--out dir] [--arrow file.cur] [--hand file.cur]");
      process.exit(0);
    }
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));

function log(message) {
  console.log(`[cursors] ${message}`);
}

/** `C:\Windows\Cursors\aero_arrow.cur` -> `/mnt/c/Windows/Cursors/aero_arrow.cur`. */
function winPathToWsl(winPath) {
  const match = /^([A-Za-z]):\\(.+)$/.exec(winPath.trim());
  if (!match) {
    return winPath.trim();
  }
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, "/")}`;
}

/** Reads one entry of the user's cursor scheme; empty means "system default". */
function schemeCursor(name) {
  try {
    const output = execFileSync("reg.exe", ["query", CURSOR_KEY, "/v", name], { encoding: "utf8" });
    const match = /REG_SZ\s+(.+?)\s*$/m.exec(output);
    return match && match[1].trim() ? winPathToWsl(match[1]) : null;
  } catch {
    return null;
  }
}

function parseCur(file) {
  const buf = readFileSync(file);
  if (buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 2) {
    throw new Error(`${file} is not a .cur cursor (header mismatch)`);
  }

  const entries = [];
  const count = buf.readUInt16LE(4);
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    entries.push({
      width: buf[offset] === 0 ? 256 : buf[offset],
      height: buf[offset + 1] === 0 ? 256 : buf[offset + 1],
      // In .cur files these fields hold the hotspot rather than the icon planes.
      hotspotX: buf.readUInt16LE(offset + 4),
      hotspotY: buf.readUInt16LE(offset + 6),
      bytes: buf.readUInt32LE(offset + 8),
      offset: buf.readUInt32LE(offset + 12),
    });
  }

  if (count === 0) {
    throw new Error(`${file} has no cursor images`);
  }

  return { buf, entries };
}

/** Decodes a 32-bit DIB cursor image (bottom-up BGRA plus an AND mask) to RGBA. */
function decodeDib(buf, entry) {
  const base = entry.offset;
  const headerSize = buf.readUInt32LE(base);
  const width = buf.readInt32LE(base + 4);
  const heightAll = buf.readInt32LE(base + 8); // colour bitmap and mask together
  const bitCount = buf.readUInt16LE(base + 14);
  const compression = buf.readUInt32LE(base + 16);

  if (bitCount !== 32 || compression !== 0) {
    throw new Error(`unsupported cursor bitmap: ${bitCount}bpp, compression ${compression}`);
  }

  const height = heightAll / 2;
  const pixels = base + headerSize;
  const stride = width * 4;
  const rgba = Buffer.alloc(width * height * 4);
  let anyAlpha = false;

  for (let y = 0; y < height; y += 1) {
    const row = pixels + (height - 1 - y) * stride;
    for (let x = 0; x < width; x += 1) {
      const alpha = buf[row + x * 4 + 3];
      if (alpha) {
        anyAlpha = true;
      }
      const dst = (y * width + x) * 4;
      rgba[dst] = buf[row + x * 4 + 2];
      rgba[dst + 1] = buf[row + x * 4 + 1];
      rgba[dst + 2] = buf[row + x * 4];
      rgba[dst + 3] = alpha;
    }
  }

  if (!anyAlpha) {
    // Older cursors carry transparency in the AND mask (1 bit = transparent).
    const maskStride = Math.ceil(width / 32) * 4;
    const mask = pixels + stride * height;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const byte = buf[mask + (height - 1 - y) * maskStride + (x >> 3)];
        rgba[(y * width + x) * 4 + 3] = (byte >> (7 - (x & 7))) & 1 ? 0 : 255;
      }
    }
  }

  return { width, height, rgba };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typed = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typed), 0);
  return Buffer.concat([length, typed, crc]);
}

/** Minimal PNG writer: 8-bit RGBA, no filtering. Keeps this script dependency-free. */
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

function extract(file, outPrefix) {
  const { buf, entries } = parseCur(file);
  // The OS draws cursors at the scheme's base size (32 px at 100% scaling); the
  // other entries exist for high-DPI and accessibility sizes.
  const entry = entries.find((candidate) => candidate.width === 32 && candidate.height === 32)
    ?? [...entries].sort((a, b) => b.width - a.width)[0];

  const isPng = buf.slice(entry.offset, entry.offset + 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (isPng) {
    writeFileSync(`${outPrefix}.png`, buf.slice(entry.offset, entry.offset + entry.bytes));
  } else {
    const { width, height, rgba } = decodeDib(buf, entry);
    writeFileSync(`${outPrefix}.png`, encodePng(width, height, rgba));
  }

  writeFileSync(
    `${outPrefix}.json`,
    `${JSON.stringify(
      { file: path.basename(file), width: entry.width, height: entry.height, hotspotX: entry.hotspotX, hotspotY: entry.hotspotY },
      null,
      2,
    )}\n`,
  );

  return entry;
}

const outDir = path.resolve(options.out);
mkdirSync(outDir, { recursive: true });

for (const [shape, override] of [["arrow", options.arrow], ["hand", options.hand]]) {
  const file = override ? path.resolve(override) : schemeCursor(shape === "arrow" ? "Arrow" : "Hand") ?? winPathToWsl(FALLBACKS[shape]);
  if (file.toLowerCase().endsWith(".ani")) {
    throw new Error(`${shape}: ${path.basename(file)} is animated; pick a .cur cursor instead`);
  }
  const entry = extract(file, path.join(outDir, shape));
  log(`${shape}: ${path.basename(file)} -> ${entry.width}x${entry.height}, hotspot ${entry.hotspotX},${entry.hotspotY}`);
}

log(`wrote ${path.join(outDir, "arrow.png")} and ${path.join(outDir, "hand.png")}`);
