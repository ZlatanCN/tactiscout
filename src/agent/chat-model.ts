import { ChatOpenAI } from "@langchain/openai";

export function createChatModel(apiKey: string, modelName: string): ChatOpenAI {
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  const reasoningEffort = process.env.OPENAI_REASONING_EFFORT?.trim();

  return new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0,
    ...(baseURL ? { configuration: { baseURL } } : {}),
    ...(reasoningEffort ? { modelKwargs: { reasoning_effort: reasoningEffort } } : {}),
  });
}
