import { z } from "zod/v4";
import {
  ConversationTurnResponseSchema,
  ScoutInputSchema,
  ScoutResponseSchema,
  CapabilityMetricDefinitions,
  type ConversationTurnResponse,
  type PlayerRecommendation,
  type RecruitmentReport,
  type ScoutResponse,
} from "../../src/domain/schemas.js";

const storageKey = "tactiscout.recruitment-plans";

export const ConversationMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  teamContext: z.string().optional(),
  questionReason: z.string().optional(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

const SavedRecruitmentPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  threadId: z.string().min(1),
  originalBrief: z.string(),
  messages: z.array(ConversationMessageSchema),
  lastReport: ConversationTurnResponseSchema.shape.report,
  lastReportedAt: z.string().nullable(),
  hasConversationState: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SavedRecruitmentPlan = z.infer<typeof SavedRecruitmentPlanSchema>;

const VersionedPlanStoreSchema = z.object({ version: z.literal(2), plans: z.array(SavedRecruitmentPlanSchema) });
const LegacyPlanSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  input: ScoutInputSchema,
  originalBrief: z.string(),
  lastAnalysis: ScoutResponseSchema.nullable(),
  lastAnalyzedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const LegacyPlanStoreSchema = z.object({ version: z.literal(1), plans: z.array(LegacyPlanSchema) });

type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

export interface UpsertRecruitmentPlanInput {
  id: string;
  name: string;
  threadId: string;
  originalBrief: string;
  messages: ConversationMessage[];
  currentReport: RecruitmentReport | null;
  currentReportedAt: string | null;
  hasConversationState: boolean;
  now: string;
}

function reportFromLegacy(analysis: ScoutResponse, brief: string): RecruitmentReport {
  const recommendations: PlayerRecommendation[] = analysis.candidates.map((candidate) => ({
    player: candidate.player,
    rationale: candidate.reasons.join("；") || "历史分析未保存文字理由。",
    strengths: candidate.reasons,
    tradeoffs: candidate.risks,
    focusEvidenceKeys: [],
    externalSignals: [],
    historicalArchiveSamples: [],
    reportObservations: [],
    evidence: CapabilityMetricDefinitions.flatMap(({ key, label, unit }) => {
      const value = candidate.per90[key];
      if (value === null || candidate.player.eventDataComplete === false) return [];
      return [{
      key,
      label,
      value,
      unit,
      peerPercentile: null,
      peerGroupSize: 0,
      minutes: candidate.player.minutes,
      competition: candidate.player.competition,
      season: candidate.player.season,
      source: candidate.player.source,
      }];
    }),
  }));
  const capabilityProfile = [...new Set(analysis.candidates.flatMap((candidate) =>
    candidate.roleAssessments.map((assessment) => `${assessment.phase === "in_possession" ? "有球" : "无球"} · ${assessment.role}`),
  ))];
  return {
    targetTeam: analysis.targetTeam,
    needSummary: brief || `${analysis.targetTeam} 的 ${analysis.requirements.position} 引援需求（旧版快照）`,
    capabilityProfile,
    evidenceCoverage: {
      evaluatedCandidateCount: analysis.candidates.length,
      availableMetricValues: recommendations.reduce((total, recommendation) => total + recommendation.evidence.length, 0),
      expectedMetricValues: analysis.candidates.length * CapabilityMetricDefinitions.length,
      lowSampleCandidates: analysis.candidates.filter((candidate) => candidate.player.minutes < 900).length,
      limitedPeerGroupCandidates: analysis.candidates.length,
    },
    externalSignalCoverage: {
      status: "not_run",
      disabledReason: null,
      identityUnavailableCandidates: 0,
      checkedCandidates: 0,
      matchedCandidates: 0,
      failedCandidates: 0,
    },
    historicalArchiveCoverage: {
      status: "not_run",
      disabledReason: null,
      checkedCandidates: 0,
      mappedCandidates: 0,
      matchedCandidates: 0,
      failedCandidates: 0,
    },
    knowledgeCoverage: { methodologyChunksRetrieved: 0, methodologySearchFailed: false, playerReportSearchPerformed: false, playerReportSearchFailed: false, playerReportChunksRetrieved: 0 },
    searchScopes: [{
      position: analysis.requirements.position,
      maxAge: analysis.requirements.maxAge ?? null,
      minimumMinutes: 0,
      competition: null,
      season: null,
      source: "user_confirmed",
    }],
    recommendations,
    limitations: [...analysis.caveats, "这是从旧版一次性分析迁移的历史快照；数据项没有保存同组百分位。"],
    dataSource: analysis.dataSource,
    datasetMode: analysis.datasetMode,
  };
}

function migrateLegacyPlan(plan: z.infer<typeof LegacyPlanSchema>): SavedRecruitmentPlan {
  const brief = plan.originalBrief.trim() || `${plan.input.targetTeam} ${plan.input.position} 招募计划`;
  const messages: ConversationMessage[] = [
    { id: `${plan.id}-legacy-user`, role: "user", content: brief },
    {
      id: `${plan.id}-legacy-note`,
      role: "assistant",
      content: "此前保存的是旧版单次分析结果。我已将它保留为历史快照；继续对话时，Agent 会从这条需求重新调查。",
    },
  ];
  return {
    id: plan.id,
    name: plan.name,
    threadId: `migrated-${plan.id}`,
    originalBrief: brief,
    messages,
    lastReport: plan.lastAnalysis ? reportFromLegacy(plan.lastAnalysis, brief) : null,
    lastReportedAt: plan.lastAnalyzedAt,
    hasConversationState: false,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };
}

function browserStorage(): BrowserStorage {
  if (typeof window === "undefined" || !window.localStorage) throw new Error("当前环境无法使用浏览器本地存储。");
  return window.localStorage;
}

export function upsertRecruitmentPlan(
  plans: SavedRecruitmentPlan[],
  input: UpsertRecruitmentPlanInput,
): { plans: SavedRecruitmentPlan[]; plan: SavedRecruitmentPlan; isNew: boolean } {
  const existing = plans.find((plan) => plan.id === input.id);
  const plan: SavedRecruitmentPlan = {
    id: existing?.id ?? input.id,
    name: input.name.trim() || existing?.name || "新的招募计划",
    threadId: input.threadId,
    originalBrief: input.originalBrief,
    messages: input.messages,
    lastReport: input.currentReport ?? existing?.lastReport ?? null,
    lastReportedAt: input.currentReport ? input.currentReportedAt ?? input.now : existing?.lastReportedAt ?? null,
    hasConversationState: input.hasConversationState,
    createdAt: existing?.createdAt ?? input.now,
    updatedAt: input.now,
  };
  const nextPlans = existing
    ? plans.map((current) => current.id === plan.id ? plan : current)
    : [plan, ...plans];
  return { plans: nextPlans, plan, isNew: !existing };
}

export function removeRecruitmentPlan(plans: SavedRecruitmentPlan[], id: string): SavedRecruitmentPlan[] {
  return plans.filter((plan) => plan.id !== id);
}

export function loadRecruitmentPlans(storage = browserStorage()): SavedRecruitmentPlan[] {
  const stored = storage.getItem(storageKey);
  if (!stored) return [];
  try {
    const data: unknown = JSON.parse(stored);
    if (data && typeof data === "object" && "version" in data && data.version === 2) {
      const parsed = VersionedPlanStoreSchema.safeParse(data);
      if (!parsed.success) throw new Error("本地招募计划数据无效。");
      return parsed.data.plans;
    }
    if (data && typeof data === "object" && "version" in data && data.version === 1) {
      const parsed = LegacyPlanStoreSchema.safeParse(data);
      if (!parsed.success) throw new Error("旧版本地招募计划数据无效。");
      const migratedPlans = parsed.data.plans.map(migrateLegacyPlan);
      saveRecruitmentPlans(migratedPlans, storage);
      return migratedPlans;
    }
    throw new Error("招募计划存储版本不兼容。");
  } catch (error) {
    if (error instanceof Error && (error.message.includes("版本不兼容") || error.message.includes("未能写入"))) throw error;
    throw new Error("本地招募计划无法读取；原有数据仍保留在浏览器中。", { cause: error });
  }
}

export function saveRecruitmentPlans(plans: SavedRecruitmentPlan[], storage = browserStorage()): void {
  const store = VersionedPlanStoreSchema.parse({ version: 2, plans });
  try {
    storage.setItem(storageKey, JSON.stringify(store));
  } catch (error) {
    throw new Error("计划未能写入浏览器存储。请检查可用空间后重试。", { cause: error });
  }
}

export function messageFromTurn(response: ConversationTurnResponse): ConversationMessage {
  return ConversationMessageSchema.parse({
    id: crypto.randomUUID(),
    role: "assistant",
    content: response.message,
    ...(response.question ? { questionReason: response.question.reason } : {}),
  });
}
