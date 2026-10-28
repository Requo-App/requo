#!/usr/bin/env node
// Verifies that `npm run test:coverage` produced the expected v8 coverage
// artifacts on disk: the HTML report (`coverage/index.html`) and the
// machine-readable companion of the stdout text summary
// (`coverage/coverage-final.json`, emitted by Vitest's `json` reporter
// whenever the v8 provider collected data).
//
// Exits non-zero with a stderr message naming the missing format when either
// report is absent. Exits 0 otherwise.
//
// Coverage itself stays report-only during rollout (no thresholds), so this
// check is structural: it guarantees the verify job has artifacts to upload
// and surfaces misconfigurations that silently drop a reporter.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const COVERAGE_DIR = path.resolve(process.cwd(), "coverage");

/**
 * Reports required to be present after `npm run test:coverage`.
 *
 * - `html`: Vitest's v8 `html` reporter writes `coverage/index.html` plus a
 *   per-file HTML tree. The root `index.html` is the stable entry point.
 * - `text`: Vitest's v8 `text` reporter writes a summary table to stdout and
 *   does not create a file of its own. `coverage/coverage-final.json` is the
 *   on-disk artifact produced alongside the text summary whenever the v8
 *   provider actually collected data, so its presence is the reliable signal
 *   that the text report materialized.
 */
const REQUIRED_REPORTS = [
  {
    format: "html",
    file: path.join(COVERAGE_DIR, "index.html"),
    hint:
      "Expected Vitest's v8 `html` reporter to emit coverage/index.html. " +
      "Check `reporter` under `coverage` in config/vitest.config.ts.",
  },
  {
    format: "text",
    file: path.join(COVERAGE_DIR, "coverage-final.json"),
    hint:
      "Expected Vitest's v8 coverage run to emit coverage/coverage-final.json " +
      "alongside the stdout text summary. Check `reporter` under `coverage` in " +
      "config/vitest.config.ts and confirm the v8 provider ran to completion.",
  },
];

function hasNonEmptyFile(filePath) {
  if (!existsSync(filePath)) return false;
  try {
    return statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

const missing = REQUIRED_REPORTS.filter(
  (report) => !hasNonEmptyFile(report.file),
);

if (missing.length === 0) {
  process.exit(0);
}

const relative = (absPath) =>
  path.relative(process.cwd(), absPath).replaceAll("\\", "/");

for (const report of missing) {
  process.stderr.write(
    `check-coverage-outputs: missing ${report.format} coverage report at ` +
      `${relative(report.file)}. ${report.hint}\n`,
  );
}

process.exit(1);
