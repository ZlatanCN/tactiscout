import { ChatOpenAI } from "@langchain/openai";

export const DEFAULT_OPENAI_TIMEOUT_MS = 180_000;

export function openAIRequestTimeoutMs(value = process.env.OPENAI_TIMEOUT_MS): number {
  if (!value?.trim()) return DEFAULT_OPENAI_TIMEOUT_MS;
  const timeoutMs = Number(value);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 600_000) {
    throw new Error("OPENAI_TIMEOUT_MS must be an integer between 1000 and 600000 milliseconds.");
  }
  return timeoutMs;
}

export function isChatModelTimeout(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error && /timeout|timed out|deadline exceeded|aborted/i.test(`${current.name} ${current.message}`)) {
      return true;
    }
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

export function createChatModel(apiKey: string, modelName: string): ChatOpenAI {
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  const reasoningEffort = process.env.OPENAI_REASONING_EFFORT?.trim();

  return new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0,
    timeout: openAIRequestTimeoutMs(),
    maxRetries: 0,
    ...(baseURL ? { configuration: { baseURL } } : {}),
    ...(reasoningEffort ? { modelKwargs: { reasoning_effort: reasoningEffort } } : {}),
  });
}
