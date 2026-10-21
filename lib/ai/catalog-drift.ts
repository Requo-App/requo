/**
 * Catalog drift diff — pure comparison between the catalog identifier list
 * and a supplied live list. No network here (the test suite blocks
 * non-local HTTP), so the live listing is verified by running the script.
 */

export type DriftDiff = {
  /** Catalog identifiers no provider serves anymore — CI must fail on these. */
  missing: string[];
  /** Live identifiers Requo does not name — informational only. */
  unlisted: string[];
};

/**
 * Registry prefixes the catalog may put in front of a provider model name.
 * Only these are stripped: provider model names can legitimately contain
 * colons (OpenRouter's `:free` variants, for example), and stripping those
 * would corrupt the comparison — `nvidia/nemotron-3-super-120b-a12b:free`
 * would collapse to `nemotron-3-super-120b-a12b:free` and look retired.
 */
const REGISTRY_PREFIXES = new Set([
  "google",
  "groq",
  "cloudflare",
  "nvidia",
  "openrouter",
]);

function bareId(modelId: string): string {
  const idx = modelId.indexOf(":");
  if (idx < 0) return modelId;

  const prefix = modelId.slice(0, idx);
  return REGISTRY_PREFIXES.has(prefix) ? modelId.slice(idx + 1) : modelId;
}

function providerOf(modelId: string): string {
  // Catalog uses the registry prefix (`google:` for Gemini).
  const prefix = modelId.split(":")[0] ?? "";
  return prefix === "google" ? "gemini" : prefix;
}

/**
 * Diff catalog IDs against live IDs.
 *
 * `liveIds` are bare provider model names (as returned by `models`
 * endpoints), optionally prefixed — both shapes are accepted. Comparison is
 * per-provider: a catalog entry `google:gemini-3.8-flash` matches live
 * `gemini-3.8-flash` or `google:gemini-3.8-flash`.
 */
export function diffCatalogAgainstLive(
  catalogIds: string[],
  liveIds: string[],
): DriftDiff {
  const liveBare = new Set(liveIds.map((id) => bareId(id).toLowerCase()));
  const liveFull = new Set(liveIds.map((id) => id.toLowerCase()));

  const missing: string[] = [];
  for (const catalogId of catalogIds) {
    const bare = bareId(catalogId).toLowerCase();
    if (!liveBare.has(bare) && !liveFull.has(catalogId.toLowerCase())) {
      missing.push(catalogId);
    }
  }

  const catalogBare = new Set(catalogIds.map((id) => bareId(id).toLowerCase()));
  const unlisted = liveIds.filter(
    (id) => !catalogBare.has(bareId(id).toLowerCase()),
  );

  return { missing, unlisted };
}

/** Group catalog registry IDs by provider name for per-provider listing. */
export function groupCatalogByProvider(
  catalogIds: string[],
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const id of catalogIds) {
    const provider = providerOf(id);
    const list = map.get(provider) ?? [];
    list.push(bareId(id));
    map.set(provider, list);
  }
  return map;
}
