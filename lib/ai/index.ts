export { generateWithFallback, streamWithFallback } from "./router";
export { isAiConfigured } from "./config";
export { cacheLayer } from "./cache-layer";
export type { CacheLayer } from "./cache-layer";
export { registry } from "./registry";
export {
  AiProviderError,
  isModelNotFoundError,
  isOversizedError,
  isRetryableError,
  classifyExhaustionScope,
} from "./errors";
export {
  TOKEN_COST_TABLE,
  computeEstimatedCostCents,
  getTokenCostTable,
  logAiInvocation,
} from "./token-logger";
export type { LogAiInvocationParams, TokenLogEntry } from "./token-logger";
export {
  NULL_SENTINEL,
  generateCacheKey,
  getCachedOutput,
  setCachedOutput,
} from "./ai-cache";
export type { CacheKeyComponents, CachedAiOutput } from "./ai-cache";
export type {
  AiCompletionRequest,
  AiCompletionResponse,
  AiStreamResponse,
  AiStreamChunk,
  AiProviderName,
  AiChatMessage,
  AiQualityTier,
  AiRoutingProfile,
} from "./types";
export {
  PLAN_LIMITS,
  TASK_WEIGHTS,
  CREDIT_TOKEN_DIVISOR,
  OUTPUT_TOKEN_MULTIPLIER,
  MIN_CREDITS_PER_INVOCATION,
  computeCreditsForTokens,
  computeUsageWeight,
  checkUsageLimit,
  recordUsage,
  startCooldown,
  resetCooldown,
  getMonthlyUsageSummary,
} from "./usage-limiter";
export type {
  UsageLimitCheck,
  UsageLimitResult,
  InvocationTokenUsage,
} from "./usage-limiter";
export {
  classifyMessageComplexity,
  getHistoryLimitForComplexity,
  getContextBudgetForComplexity,
} from "./message-complexity";
export type { MessageComplexity } from "./message-complexity";
export {
  selectModels,
  recordModelUsage,
  recordModelTokenUsage,
  recordModelTokenUsageDetailed,
  correctTokenUsage,
  markModelExhausted,
  markModelDead,
  isModelDead,
  getCapacitySnapshot,
  getAllRegisteredModelIds,
  CHAT_MAX_ATTEMPTS,
  NON_CHAT_MAX_ATTEMPTS,
} from "./capacity-selector";
export type { ModelCapacity, SelectionCriteria } from "./capacity-selector";
export {
  getModelCatalog,
  getBaseCatalog,
  getCatalogEntry,
  getDerivedCostTable,
  getProviderOverride,
  getNeuronPoolOverride,
  CLOUDFLARE_DAILY_NEURON_POOL,
  EXTRACTION_MODEL_IDS,
  KNOWN_CATALOG_PROVIDERS,
} from "./catalog";
export type { ModelEntry } from "./catalog";
export { ROUTING_PROFILES, profileForTaskType } from "./routing-profiles";
export type {
  AiRoutingProfile as RoutingProfile,
  RoutingProfileDefinition,
} from "./routing-profiles";
export { createFallbackLanguageModel } from "./fallback-model";
export type {
  FallbackModelOptions,
  FallbackModelSelected,
  FallbackAttemptTrailEntry,
} from "./fallback-model";
export { truncateToolOutput } from "./tool-truncator";
export type { TruncationResult } from "./tool-truncator";
export {
  estimateTokens,
  estimateMessageTokens,
  estimateChatRequestTokens,
  measurePromptOverhead,
  compactMessages,
  CHAT_TOKEN_BUDGETS,
} from "./token-budget";
export { checkQualityGate } from "./quality-gate";
export type { QualityGateEvent } from "./quality-gate";
export { checkDuplicate } from "./request-dedup";
