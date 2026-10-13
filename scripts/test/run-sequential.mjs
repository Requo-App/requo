#!/usr/bin/env node
// Runs one or more npm scripts sequentially, always executing every script
// even when an earlier one exits non-zero, and exits with the first non-zero
// status code (or 0 when they all pass).
//
// Usage: node scripts/test/run-sequential.mjs <script> [<script> ...]
// Example: node scripts/test/run-sequential.mjs test:unit test:components
// Example: node scripts/test/run-sequential.mjs lint typecheck check:seo
import { spawnSync } from "node:child_process";
import process from "node:process";

const args = process.argv.slice(2);

if (args.length < 1) {
  process.stderr.write(
    `run-sequential: expected at least 1 npm script name, got ${args.length}.\n` +
      `Usage: node scripts/test/run-sequential.mjs <script> [<script> ...]\n`,
  );
  process.exit(2);
}

// Restrict script names to a safe character set so we can use `shell: true`
// (required on Windows, where npm is a `.cmd` shim that Node refuses to spawn
// directly) without opening a command-injection hole.
const NPM_SCRIPT_NAME_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9:_\-.]*$/;

function runNpmScript(scriptName) {
  if (!NPM_SCRIPT_NAME_PATTERN.test(scriptName)) {
    process.stderr.write(
      `run-sequential: refusing to run script with unsafe name "${scriptName}".\n` +
        `Allowed characters: letters, digits, and ":_-." (must start with a letter, digit, or underscore).\n`,
    );
    return 1;
  }

  const result = spawnSync(`npm run ${scriptName}`, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  if (result.error) {
    process.stderr.write(
      `run-sequential: failed to spawn "npm run ${scriptName}": ${result.error.message}\n`,
    );
    return 1;
  }

  if (typeof result.status === "number") {
    return result.status;
  }

  // Process was terminated by a signal; surface it as a non-zero exit code.
  process.stderr.write(
    `run-sequential: "npm run ${scriptName}" terminated by signal ${result.signal ?? "unknown"}\n`,
  );
  return 1;
}

// First non-zero wins; 0 only when every script passed.
let exitCode = 0;
for (const script of args) {
  const code = runNpmScript(script);
  if (code !== 0 && exitCode === 0) {
    exitCode = code;
  }
}

process.exit(exitCode);
