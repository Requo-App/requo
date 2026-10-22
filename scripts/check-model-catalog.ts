/**
 * Catalog drift check — lists each configured provider's live models from its
 * `models` endpoint and diffs them against the unified catalog, plus the
 * off-catalog identifiers the app calls directly (see OFF_CATALOG_MODEL_IDS).
 *
 * - Listing-only mode (default): runs as part of `npm run check`. Fails on
 *   any identifier Requo names but the provider no longer serves.
 * - `--probe`: opt-in, makes one minimal tool-calling request per candidate
 *   to confirm tool capability. Kept OUT of the automatic check — it spends
 *   real free-tier quota.
 *
 * Note the limit of a name-only diff: a provider can keep listing an
 * identifier it refuses to serve (a retired Gemini model, for example).
 * Only `--probe` sees that class of breakage.
 *
 * Fails loudly when a provider's credentials are absent: a green check means
 * the catalog was really compared, not skipped.
 *
 * Usage:
 *   npx tsx scripts/check-model-catalog.ts                    # listing check (strict)
 *   npx tsx scripts/check-model-catalog.ts --allow-missing   # CI: skip providers without credentials
 *   npx tsx scripts/check-model-catalog.ts --probe           # + live tool probe
 *
 * PR CI sets `CATALOG_DRIFT_ALLOW_MISSING=1` (see `.github/workflows/ci.yml`)
 * so `npm run check` stays green without live provider keys. The scheduled
 * `model-drift` workflow runs without that flag and with real secrets, so a
 * green nightly run means the catalog was really compared.
 */

import "./load-env";

import { getModelCatalog } from "../lib/ai/catalog";
import { diffCatalogAgainstLive } from "../lib/ai/catalog-drift";
import { EMBEDDING_MODEL_ID } from "../lib/ai/embedding-constants";

const PROBE = process.argv.includes("--probe");
const ALLOW_MISSING =
  process.argv.includes("--allow-missing") ||
  process.env.CATALOG_DRIFT_ALLOW_MISSING === "1";

/**
 * Identifiers the app calls that are not routing candidates, so they are not
 * catalog entries. They still have to be compared against the provider's
 * listing: the embedding module returns `null` on any provider failure and
 * callers fall back to lexical retrieval, so a model retired upstream disables
 * semantic search silently. Nothing else in this repo would notice.
 */
const OFF_CATALOG_MODEL_IDS: string[] = [EMBEDDING_MODEL_ID];

type ProviderSpec = {
  name: string;
  envKeys: string[];
  listModels: () => Promise<string[]>;
};

function mustGetEnv(name: string): string {
  const value = (process.env[name] ?? "").trim();
  if (!value) {
    throw new Error(`missing credentials: ${name} is not set`);
  }
  return value;
}

async function fetchJson(url: string, headers: Record<string, string>) {
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`models endpoint returned ${response.status} for ${url}`);
  }
  return (await response.json()) as unknown;
}

function extractIds(payload: unknown): string[] {
  if (Array.isArray(payload)) return payload.map(String);
  if (typeof payload === "object" && payload !== null) {
    const data = (payload as { data?: unknown }).data;
    if (Array.isArray(data)) {
      return data
        .map((m) =>
          typeof m === "string"
            ? m
            : typeof (m as { id?: unknown }).id === "string"
              ? String((m as { id: string }).id)
              : null,
        )
        .filter((id): id is string => Boolean(id));
    }
    const models = (payload as { models?: unknown }).models;
    if (Array.isArray(models)) {
      return models
        .map((m) =>
          typeof m === "string"
            ? m
            : typeof (m as { name?: unknown }).name === "string"
              ? String((m as { name: string }).name).replace(/^models\//, "")
              : null,
        )
        .filter((id): id is string => Boolean(id));
    }
  }
  return [];
}

function providers(): ProviderSpec[] {
  return [
    {
      name: "groq",
      envKeys: ["GROQ_API_KEY"],
      listModels: async () => {
        const key = mustGetEnv("GROQ_API_KEY");
        const json = await fetchJson("https://api.groq.com/openai/v1/models", {
          Authorization: `Bearer ${key}`,
        });
        return extractIds(json);
      },
    },
    {
      name: "gemini",
      envKeys: ["GEMINI_API_KEY"],
      listModels: async () => {
        const key = mustGetEnv("GEMINI_API_KEY");
        const json = await fetchJson(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
          {},
        );
        return extractIds(json);
      },
    },
    {
      name: "cloudflare",
      envKeys: ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"],
      listModels: async () => {
        const account = mustGetEnv("CLOUDFLARE_ACCOUNT_ID");
        const token = mustGetEnv("CLOUDFLARE_API_TOKEN");
        const headers = { Authorization: `Bearer ${token}` };

        // Workers AI moved to the paginated `/ai/models/search` endpoint; the
        // old `/ai/models` listing 404s. Its rows carry the `@cf/...` model
        // name in `name` (with `id` holding an opaque UUID), so the generic
        // `extractIds` — which prefers `id` — cannot be used here.
        const perPage = 100;
        const names: string[] = [];

        for (let page = 1; page <= 50; page += 1) {
          const json = (await fetchJson(
            `https://api.cloudflare.com/client/v4/accounts/${account}/ai/models/search?per_page=${perPage}&page=${page}`,
            headers,
          )) as { result?: unknown };

          const rows = Array.isArray(json.result) ? json.result : [];
          const pageNames = rows
            .map((row) =>
              typeof (row as { name?: unknown })?.name === "string"
                ? String((row as { name: string }).name)
                : null,
            )
            .filter((name): name is string => Boolean(name));

          names.push(...pageNames);

          if (rows.length < perPage) break;
        }

        return names;
      },
    },
    {
      name: "nvidia",
      envKeys: ["NVIDIA_NIM_API_KEY"],
      listModels: async () => {
        const key = mustGetEnv("NVIDIA_NIM_API_KEY");
        const json = await fetchJson("https://integrate.api.nvidia.com/v1/models", {
          Authorization: `Bearer ${key}`,
        });
        return extractIds(json);
      },
    },
    {
      name: "openrouter",
      envKeys: ["OPENROUTER_API_KEY"],
      listModels: async () => {
        const key = mustGetEnv("OPENROUTER_API_KEY");
        const json = await fetchJson("https://openrouter.ai/api/v1/models", {
          Authorization: `Bearer ${key}`,
        });
        return extractIds(json);
      },
    },
  ];
}

async function main() {
  const catalog = getModelCatalog();
  const catalogIds = catalog.map((e) => e.modelId);
  // Compared against the listing, but never probed: a generateText call on an
  // embedding model fails for reasons that say nothing about availability.
  const listingIds = [...catalogIds, ...OFF_CATALOG_MODEL_IDS];
  let failures = 0;
  let skipped = 0;

  for (const provider of providers()) {
    const missingEnv = provider.envKeys.filter(
      (k) => !(process.env[k] ?? "").trim(),
    );
    if (missingEnv.length > 0) {
      if (ALLOW_MISSING) {
        console.warn(
          `[catalog-drift] SKIP: ${provider.name}: missing credentials (${missingEnv.join(", ")}). PR CI skips live comparison; the scheduled model-drift workflow compares with real secrets.`,
        );
        skipped += 1;
        continue;
      }
      console.error(
        `[catalog-drift] FAIL: ${provider.name}: missing credentials (${missingEnv.join(", ")}). Set them — a green check must mean the catalog was compared.`,
      );
      failures += 1;
      continue;
    }
    let live: string[];
    try {
      live = await provider.listModels();
    } catch (error) {
      console.error(
        `[catalog-drift] FAIL: ${provider.name}: ${error instanceof Error ? error.message : String(error)}`,
      );
      failures += 1;
      continue;
    }
    const expected = listingIds.filter((id) => {
      const prefix = id.split(":")[0];
      const pname = prefix === "google" ? "gemini" : prefix;
      return pname === provider.name;
    });
    const { missing } = diffCatalogAgainstLive(expected, live);
    if (missing.length > 0) {
      console.error(
        `[catalog-drift] FAIL: ${provider.name}: catalog names ${missing.length} identifier(s) the provider no longer serves: ${missing.join(", ")}`,
      );
      failures += 1;
    } else {
      console.info(
        `[catalog-drift] OK: ${provider.name}: ${expected.length} catalog identifier(s) all live (${live.length} listed).`,
      );
    }
  }

  if (PROBE) {
    await probeToolCapability(catalogIds);
  }

  if (failures > 0) {
    console.error(`[catalog-drift] ${failures} provider(s) failed.`);
    process.exit(1);
  }
  if (skipped > 0) {
    console.info(
      `[catalog-drift] Skipped live comparison for ${skipped} provider(s) (no credentials). Scheduled model-drift workflow does the full comparison with secrets.`,
    );
    return;
  }
  console.info("[catalog-drift] Catalog matches live providers.");
}

async function probeToolCapability(catalogIds: string[]) {
  // Minimal tool-calling request per candidate — spends real quota, hence
  // opt-in only. Confirms tool capability rather than assuming it.
  const { generateText, tool } = await import("ai");
  const { z } = await import("zod");
  const { registry } = await import("../lib/ai/registry");
  for (const modelId of catalogIds) {
    try {
      const result = await generateText({
        model: registry.languageModel(modelId as `${string}:${string}`),
        prompt: "Reply with the word OK.",
        tools: {
          ping: tool({
            description: "Reply to a ping.",
            inputSchema: z.object({}),
          }),
        },
        maxOutputTokens: 10,
        abortSignal: AbortSignal.timeout(30_000),
      });
      console.info(
        `[catalog-drift:probe] ${modelId}: ok (text=${JSON.stringify(result.text.slice(0, 40))})`,
      );
    } catch (error) {
      console.warn(
        `[catalog-drift:probe] ${modelId}: FAILED — ${error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200)}`,
      );
    }
  }
}

void main().catch((error) => {
  console.error("[catalog-drift] Unexpected failure:", error);
  process.exit(1);
});
