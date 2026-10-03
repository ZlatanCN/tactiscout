import {
  DatasetStatusSchema,
  ConversationTurnResponseSchema,
  ParseBriefResponseSchema,
  RecruitmentProgressSchema,
  ScoutResponseSchema,
  type DatasetStatus,
  type ConversationTurnResponse,
  type ParseBriefResponse,
  type RecruitmentProgress,
  type ScoutInput as ScoutRequest,
  type ScoutResponse,
} from "../../src/domain/schemas.js";
import {
  PlayerObservationInputSchema,
  PlayerObservationListSchema,
  PlayerObservationSchema,
  type PlayerObservation,
  type PlayerObservationInput,
} from "../../src/observations/schemas.js";

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

function parseContract<T>(schema: { parse: (data: unknown) => T }, value: unknown, subject = "招募"): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new Error(`服务端返回的数据格式不符合当前${subject}契约。`, { cause: error });
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

export async function turnRecruitmentCase(caseId: string, message: string, expectsExistingState = false): Promise<ConversationTurnResponse> {
  const response = await fetch(`/api/v1/recruitment/cases/${encodeURIComponent(caseId)}/turns`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, expectsExistingState }),
  });
  return parseContract(ConversationTurnResponseSchema, await readResponse(response));
}

export async function getRecruitmentProgress(caseId: string): Promise<RecruitmentProgress> {
  const response = await fetch(`/api/v1/recruitment/cases/${encodeURIComponent(caseId)}/progress`);
  return parseContract(RecruitmentProgressSchema, await readResponse(response));
}

export async function getPlayerObservations(): Promise<PlayerObservation[]> {
  const response = await fetch("/api/v1/player-observations");
  return parseContract(PlayerObservationListSchema, await readResponse(response), "球探观察");
}

export async function savePlayerObservation(id: string | null, input: PlayerObservationInput): Promise<PlayerObservation> {
  const parsedInput = PlayerObservationInputSchema.parse(input);
  const response = await fetch(id === null
    ? "/api/v1/player-observations"
    : `/api/v1/player-observations/${encodeURIComponent(id)}`, {
    method: id === null ? "POST" : "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(parsedInput),
  });
  return parseContract(PlayerObservationSchema, await readResponse(response), "球探观察");
}

export async function deletePlayerObservation(id: string): Promise<void> {
  const response = await fetch(`/api/v1/player-observations/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await readError(response));
}
