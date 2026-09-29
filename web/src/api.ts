import {
  DatasetStatusSchema,
  ParseBriefResponseSchema,
  ScoutResponseSchema,
  type DatasetStatus,
  type ParseBriefResponse,
  type ScoutInput as ScoutRequest,
  type ScoutResponse,
} from "../../src/domain/schemas.js";

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return `Request failed (${response.status})`;
}

async function readResponse(response: Response): Promise<unknown> {
  if (!response.ok) throw new Error(await readError(response));
  try {
    return await response.json() as unknown;
  } catch (error) {
    throw new Error("服务端返回的 JSON 无法读取。", { cause: error });
  }
}

function parseContract<T>(schema: { parse: (data: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error("服务端返回的数据格式不符合当前招募契约。", { cause: error });
  }
}

export async function getDatasetStatus(): Promise<DatasetStatus> {
  const response = await fetch("/api/v1/dataset");
  return parseContract(DatasetStatusSchema, await readResponse(response));
}

export async function scout(request: ScoutRequest): Promise<ScoutResponse> {
  const response = await fetch("/api/v1/scout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  return parseContract(ScoutResponseSchema, await readResponse(response));
}

export async function parseBrief(brief: string): Promise<ParseBriefResponse> {
  const response = await fetch("/api/v1/requirements/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  return parseContract(ParseBriefResponseSchema, await readResponse(response));
}
