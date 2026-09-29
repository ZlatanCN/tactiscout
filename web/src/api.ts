import type { DatasetStatus, ParseBriefResponse, ScoutRequest, ScoutResponse } from "./types";

async function readError(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  return `Request failed (${response.status})`;
}

export async function getDatasetStatus(): Promise<DatasetStatus> {
  const response = await fetch("/api/v1/dataset");
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<DatasetStatus>;
}

export async function scout(request: ScoutRequest): Promise<ScoutResponse> {
  const response = await fetch("/api/v1/scout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<ScoutResponse>;
}

export async function parseBrief(brief: string): Promise<ParseBriefResponse> {
  const response = await fetch("/api/v1/requirements/parse", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ brief }),
  });
  if (!response.ok) throw new Error(await readError(response));
  return response.json() as Promise<ParseBriefResponse>;
}
