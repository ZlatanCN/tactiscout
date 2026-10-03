import { z } from "zod/v4";
import {
  CapabilityMetricKeySchema,
  type Position,
  type CapabilityEvidence,
  type CapabilityMetricKey,
  type PlayerProfile,
} from "../domain/schemas.js";
import type { KnowledgeSearchResult } from "../knowledge/schemas.js";
import {
  AskUserActionSchema,
  FinishActionSchema,
  type ParsedRecruitmentAction,
} from "./recruitment-actions.js";
import { normalizeSearchText } from "./text-matching.js";

export interface EvaluatedCandidate {
  player: PlayerProfile;
  evidence: CapabilityEvidence[];
}

export interface RecruitmentDecisionConstraints {
  targetTeam: string | null;
  evaluatedCandidates: Array<{ playerId: string; evidenceKeys: CapabilityMetricKey[] }>;
  reportObservations: Array<{ playerId: string; documentId: string; evidenceKeys: CapabilityMetricKey[] }>;
}

function unionSchemas(schemas: z.ZodType[]): z.ZodType {
  const [first, ...rest] = schemas;
  if (!first) return z.never();
  return rest.reduce((combined, schema) => z.union([combined, schema]), first);
}

export function createConstrainedConclusionSchema(constraints: RecruitmentDecisionConstraints) {
  const recommendationChoices = constraints.evaluatedCandidates.flatMap(({ playerId, evidenceKeys }) => {
    if (!evidenceKeys.length) return [];
    return [z.object({
      playerId: z.literal(playerId),
      evidenceKeys: z.array(z.enum(evidenceKeys as [CapabilityMetricKey, ...CapabilityMetricKey[]])).min(1),
    })];
  });
  const reportObservationChoices = constraints.reportObservations.map(({ playerId, documentId, evidenceKeys }) => z.object({
    playerId: z.literal(playerId),
    documentId: z.literal(documentId),
    summary: z.string().trim().min(1).max(600),
    linkedMetricKeys: evidenceKeys.length
      ? z.array(z.enum(evidenceKeys as [CapabilityMetricKey, ...CapabilityMetricKey[]])).max(8)
      : z.array(CapabilityMetricKeySchema).max(0),
  }));
  const recommendationItemSchema = z.object({
    playerId: z.string().min(1),
    evidenceKeys: z.array(CapabilityMetricKeySchema).min(1),
  });
  const reportObservationItemSchema = z.object({
    playerId: z.string().min(1),
    documentId: z.string().min(1),
    summary: z.string().trim().min(1).max(600),
    linkedMetricKeys: z.array(CapabilityMetricKeySchema).max(8),
  });
  return z.discriminatedUnion("action", [
    AskUserActionSchema,
    FinishActionSchema.extend({
      targetTeam: constraints.targetTeam === null ? z.null() : z.literal(constraints.targetTeam),
      recommendations: z.array(recommendationChoices.length ? unionSchemas(recommendationChoices) : recommendationItemSchema)
        .max(recommendationChoices.length ? 5 : 0),
      reportObservations: z.array(reportObservationChoices.length ? unionSchemas(reportObservationChoices) : reportObservationItemSchema)
        .max(reportObservationChoices.length ? 10 : 0).default([]),
    }),
  ]);
}

function reportMatchesCandidate(
  document: KnowledgeSearchResult,
  player: PlayerProfile,
  eligiblePlayers: EvaluatedCandidate[],
): boolean {
  const normalizeEntityId = (value: string) => {
    const separator = value.indexOf(":");
    return separator < 0 ? value : `${value.slice(0, separator).toLocaleLowerCase()}:${value.slice(separator + 1)}`;
  };
  const documentIds = document.entityIds.map(normalizeEntityId);
  const candidateIds = [
    player.playerId,
    ...(player.sourceIdentity ? [`${player.sourceIdentity.provider}:${player.sourceIdentity.playerId}`] : []),
  ].map(normalizeEntityId);
  if (documentIds.length) return documentIds.some((id) => candidateIds.includes(id));
  const documentNames = new Set(document.entityNames.map(normalizeSearchText));
  const matchingCandidates = new Map<string, EvaluatedCandidate>();
  for (const candidate of eligiblePlayers) {
    if (documentNames.has(normalizeSearchText(candidate.player.name))) {
      matchingCandidates.set(candidate.player.playerId, candidate);
    }
  }
  return matchingCandidates.size === 1 && matchingCandidates.has(player.playerId);
}

export function buildDecisionConstraints(input: {
  targetTeam: string | null;
  confirmedPosition?: Position | null;
  evaluatedPlayers: EvaluatedCandidate[];
  retrievedKnowledge: KnowledgeSearchResult[];
}): RecruitmentDecisionConstraints {
  const eligiblePlayers = input.evaluatedPlayers.filter(({ player }) =>
    !input.confirmedPosition || player.position === input.confirmedPosition,
  );
  const playerReportDocuments = input.retrievedKnowledge.filter((document) =>
    document.corpus === "player_report" && document.displayAllowed,
  );
  return {
    targetTeam: input.targetTeam,
    evaluatedCandidates: eligiblePlayers.map(({ player, evidence }) => ({
      playerId: player.playerId,
      evidenceKeys: evidence.map((item) => item.key),
    })),
    reportObservations: eligiblePlayers.flatMap(({ player, evidence }) => playerReportDocuments
      .filter((document) => reportMatchesCandidate(document, player, eligiblePlayers))
      .map((document) => ({
        playerId: player.playerId,
        documentId: document.documentId,
        evidenceKeys: evidence.map((item) => item.key),
      }))),
  };
}

export function validateConclusion(input: {
  action: ParsedRecruitmentAction | undefined;
  confirmedPosition?: Position | null;
  evaluatedPlayers: Record<string, EvaluatedCandidate>;
  retrievedKnowledge: Record<string, KnowledgeSearchResult>;
}): string[] {
  const action = input.action;
  if (action?.action !== "finish") return ["当前动作不是最终推荐。"];
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const recommendation of action.recommendations) {
    if (ids.has(recommendation.playerId)) problems.push(`球员 ${recommendation.playerId} 被重复推荐。`);
    ids.add(recommendation.playerId);
    const evaluated = input.evaluatedPlayers[recommendation.playerId];
    if (!evaluated) {
      problems.push(`球员 ${recommendation.playerId} 没有能力评估证据。`);
      continue;
    }
    if (input.confirmedPosition && evaluated.player.position !== input.confirmedPosition) {
      problems.push(`球员 ${recommendation.playerId} 不符合用户确认的位置 ${input.confirmedPosition}。`);
      continue;
    }
    const availableKeys = new Set(evaluated.evidence.map((item) => item.key));
    const invalidKeys = recommendation.evidenceKeys.filter((key) => !availableKeys.has(key));
    if (invalidKeys.length) problems.push(`球员 ${recommendation.playerId} 引用了不存在的证据：${invalidKeys.join(", ")}`);
  }
  for (const observation of action.reportObservations) {
    const document = Object.values(input.retrievedKnowledge).find((candidate) => candidate.documentId === observation.documentId);
    const evaluated = input.evaluatedPlayers[observation.playerId];
    if (!evaluated) {
      problems.push(`球员 ${observation.playerId} 没有比赛数据评估，不能附加球员定性观察。`);
      continue;
    }
    if (input.confirmedPosition && evaluated.player.position !== input.confirmedPosition) {
      problems.push(`球员 ${observation.playerId} 不符合用户确认的位置 ${input.confirmedPosition}，不能附加球员定性观察。`);
      continue;
    }
    if (!document || document.corpus !== "player_report") {
      problems.push(`报告文档 ${observation.documentId} 未在本轮球员报告检索结果中出现。`);
      continue;
    }
    if (!document.displayAllowed) problems.push(`来源 ${document.sourceName} 不允许在报告中展示。`);
    const eligiblePlayers = Object.values(input.evaluatedPlayers).filter(({ player }) =>
      !input.confirmedPosition || player.position === input.confirmedPosition,
    );
    if (!reportMatchesCandidate(document, evaluated.player, eligiblePlayers)) {
      problems.push(`报告文档 ${observation.documentId} 的实体元数据不匹配球员 ${evaluated.player.name}。`);
    }
    const availableKeys = new Set(evaluated.evidence.map((item) => item.key));
    const invalidKeys = observation.linkedMetricKeys.filter((key) => !availableKeys.has(key));
    if (invalidKeys.length) problems.push(`球员定性观察引用了不存在的比赛指标：${invalidKeys.join(", ")}`);
  }
  return problems;
}
