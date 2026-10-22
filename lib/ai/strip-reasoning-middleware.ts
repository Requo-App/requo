import type { LanguageModelMiddleware } from "ai";
import type { LanguageModelV3Prompt } from "@ai-sdk/provider";

/**
 * Middleware that removes reasoning parts from the *outgoing* prompt.
 *
 * `streamText` replays each step's assistant response into the prompt of
 * every later step, reasoning parts included. Providers on the
 * OpenAI-compatible shape serialize those parts as `reasoning_content`
 * (see `convertToOpenAICompatibleChatMessages` in
 * `@ai-sdk/openai-compatible`), and some OpenAI-compatible providers reject
 * that property with a 400 naming the offending message indexes:
 *
 *   messages.4.assistant.reasoning_content: property
 *   'messages.4.assistant.reasoning_content' is unsupported
 *
 * Because any fallback candidate can serve any step, the prompt has to stay
 * portable across providers — so reasoning is stripped before it is sent.
 * This does not stop a model from *spending* reasoning tokens; capping that
 * is a per-provider `providerOptions` concern.
 */
export const stripReasoningMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  transformParams: async ({ params }) => {
    // Defensive: callers (and tests) may hand over params without a prompt.
    if (!Array.isArray(params.prompt)) {
      return params;
    }

    const prompt: LanguageModelV3Prompt = [];
    let changed = false;

    for (const message of params.prompt) {
      if (message.role !== "assistant" || !Array.isArray(message.content)) {
        prompt.push(message);
        continue;
      }

      const content = message.content.filter((part) => part.type !== "reasoning");

      if (content.length === message.content.length) {
        prompt.push(message);
        continue;
      }

      changed = true;

      // A step that emitted nothing but reasoning has no content left.
      // Part-less assistant messages are rejected outright (Google) or sent
      // as empty strings (OpenAI-compatible), so drop the message instead.
      if (content.length > 0) {
        prompt.push({ ...message, content });
      }
    }

    return changed ? { ...params, prompt } : params;
  },
};
