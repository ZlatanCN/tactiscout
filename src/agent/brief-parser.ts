import { ChatOpenAI } from "@langchain/openai";
import { BriefFieldsSchema, type BriefFields } from "../domain/schemas.js";

export class BriefParserUnavailableError extends Error {
  constructor() {
    super("自然语言解析尚未配置模型服务。请填写下方结构化表单继续，或在服务端配置模型名称和 API 密钥。");
    this.name = "BriefParserUnavailableError";
  }
}

export async function parseRecruitmentBrief(brief: string): Promise<BriefFields> {
  const apiKey = process.env.OPENAI_API_KEY;
  const modelName = process.env.OPENAI_MODEL;
  if (!apiKey || !modelName) throw new BriefParserUnavailableError();

  const baseURL = process.env.OPENAI_BASE_URL;
  const model = new ChatOpenAI({
    apiKey,
    model: modelName,
    temperature: 0,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
  const parser = model.withStructuredOutput(BriefFieldsSchema);

  try {
    const result = await parser.invoke([
      [
        "system",
        [
          "你是足球球探需求解析器，只把用户明确表达的内容转换为给定结构。",
          "不要推荐球员，不要编造球队、位置、年龄门槛或战术偏好。",
          "目标球队或位置没有明确表达时返回 null；年龄门槛没有明确表达时返回 null。",
          "只把清楚的有球偏好映射到 progression（推进）、retention（控球保持）、creation（机会创造）。",
          "只把清楚的无球偏好映射到 pressing（施压）、defensive_disruption（抢断或拦截）。",
          "偏好不明确时，对应数组返回空数组。不要从球队名称推断其战术体系。",
          "用户输入可能是中文或英文。",
        ].join(" "),
      ],
      ["human", brief],
    ]);
    return BriefFieldsSchema.parse(result);
  } catch (error) {
    if (error instanceof BriefParserUnavailableError) throw error;
    throw new Error("需求解析失败。请检查模型服务配置后重试，或直接填写结构化表单。", { cause: error });
  }
}
