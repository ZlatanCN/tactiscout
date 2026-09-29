import { z } from "zod/v4";
import {
  ScoutInputSchema,
  ScoutResponseSchema,
  type ScoutInput as ScoutRequest,
  type ScoutResponse,
} from "../../src/domain/schemas.js";

const storageKey = "tactiscout.recruitment-plans";

const SavedRecruitmentPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  input: ScoutInputSchema,
  originalBrief: z.string(),
  lastAnalysis: ScoutResponseSchema.nullable(),
  lastAnalyzedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedRecruitmentPlan = z.infer<typeof SavedRecruitmentPlanSchema>;

const VersionedPlanStoreSchema = z.object({
  version: z.literal(1),
  plans: z.array(SavedRecruitmentPlanSchema),
});

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

export interface UpsertRecruitmentPlanInput {
  id: string;
  name: string;
  input: ScoutRequest;
  originalBrief: string;
  currentAnalysis: ScoutResponse | null;
  currentAnalyzedAt: string | null;
  now: string;
}

export interface UpsertRecruitmentPlanResult {
  plans: SavedRecruitmentPlan[];
  plan: SavedRecruitmentPlan;
  isNew: boolean;
  analysisMatches: boolean;
}

function browserStorage(): BrowserStorage {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("当前环境无法使用浏览器本地存储。");
  return window.localStorage;
}

export function analysisMatchesRequest(request: ScoutRequest, analysis: ScoutResponse): boolean {
  const requirements = analysis.requirements;
  const sameValues = <T>(left: T[], right: T[]) => left.length === right.length && left.every((value, index) => value === right[index]);
  return request.targetTeam === requirements.targetTeam
    && request.position === requirements.position
    && request.maxAge === requirements.maxAge
    && request.topK === requirements.topK
    && request.includeUnknownAge === requirements.includeUnknownAge
    && sameValues(request.inPossessionRoles, requirements.inPossessionRoles)
    && sameValues(request.outOfPossessionRoles, requirements.outOfPossessionRoles);
}

export function isAnalysisSnapshotStale(plan: SavedRecruitmentPlan): boolean {
  return Boolean(plan.lastAnalysis && !analysisMatchesRequest(plan.input, plan.lastAnalysis));
}

export function upsertRecruitmentPlan(
  plans: SavedRecruitmentPlan[],
  input: UpsertRecruitmentPlanInput,
): UpsertRecruitmentPlanResult {
  const existing = plans.find((plan) => plan.id === input.id);
  const analysisMatches = Boolean(input.currentAnalysis && analysisMatchesRequest(input.input, input.currentAnalysis));
  const plan: SavedRecruitmentPlan = {
    id: existing?.id ?? input.id,
    name: input.name,
    input: input.input,
    originalBrief: input.originalBrief,
    lastAnalysis: analysisMatches ? input.currentAnalysis : existing?.lastAnalysis ?? null,
    lastAnalyzedAt: analysisMatches ? input.currentAnalyzedAt ?? input.now : existing?.lastAnalyzedAt ?? null,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  const nextPlans = existing
    ? plans.map((current) => current.id === plan.id ? plan : current)
    : [plan, ...plans];
  return { plans: nextPlans, plan, isNew: !existing, analysisMatches };
}

export function recordSuccessfulAnalysis(
  plans: SavedRecruitmentPlan[],
  input: {
    id: string;
    name: string;
    request: ScoutRequest;
    originalBrief: string;
    analysis: ScoutResponse;
    analyzedAt: string;
  },
): SavedRecruitmentPlan[] {
  return plans.map((plan) => plan.id === input.id
    ? {
      ...plan,
      name: input.name.trim() || plan.name,
      input: input.request,
      originalBrief: input.originalBrief,
      lastAnalysis: input.analysis,
      lastAnalyzedAt: input.analyzedAt,
      updatedAt: input.analyzedAt,
    }
    : plan);
}

export function removeRecruitmentPlan(plans: SavedRecruitmentPlan[], id: string): SavedRecruitmentPlan[] {
  return plans.filter((plan) => plan.id !== id);
}

export function loadRecruitmentPlans(storage = browserStorage()): SavedRecruitmentPlan[] {
  const stored = storage.getItem(storageKey);
  if (!stored) return [];
  try {
    const data: unknown = JSON.parse(stored);
    if (
      !data
      || typeof data !== "object"
      || !("version" in data)
      || data.version !== 1
      || !("plans" in data)
      || !Array.isArray(data.plans)
    ) {
      throw new Error("招募计划存储版本不兼容。");
    }
    const parsed = VersionedPlanStoreSchema.safeParse(data);
    if (!parsed.success) throw new Error("本地招募计划数据无效。");
    return parsed.data.plans;
  } catch (error) {
    if (error instanceof Error && error.message === "招募计划存储版本不兼容。") throw error;
    throw new Error("本地招募计划无法读取；原有数据仍保留在浏览器中。", { cause: error });
  }
}

export function saveRecruitmentPlans(plans: SavedRecruitmentPlan[], storage = browserStorage()): void {
  const store = VersionedPlanStoreSchema.parse({ version: 1, plans });
  try {
    storage.setItem(storageKey, JSON.stringify(store));
  } catch (error) {
    throw new Error("计划未能写入浏览器存储。请检查可用空间后重试。", { cause: error });
  }
}
