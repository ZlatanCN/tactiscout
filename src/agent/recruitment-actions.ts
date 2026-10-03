import { z } from "zod/v4";
import { CapabilityMetricKeySchema, PositionSchema } from "../domain/schemas.js";

export const FinishActionSchema = z.object({
  action: z.literal("finish"),
  targetTeam: z.string().nullable(),
  needSummary: z.string().min(1),
  capabilityProfile: z.array(z.string()).max(8),
  recommendations: z.array(z.object({
    playerId: z.string().min(1),
    evidenceKeys: z.array(CapabilityMetricKeySchema).min(1),
  })).max(5),
  limitationKeys: z.array(z.enum([
    "current_roster",
    "budget",
    "market_value",
    "contract",
    "injury",
    "physical",
    "potential",
    "registration",
    "work_permit",
    "other",
  ])),
  reportObservations: z.array(z.object({
    playerId: z.string().min(1),
    documentId: z.string().min(1),
    summary: z.string().trim().min(1).max(600),
    linkedMetricKeys: z.array(CapabilityMetricKeySchema).max(8),
  })).max(10).default([]),
});

export const AskUserActionSchema = z.object({
  action: z.literal("ask_user"),
  question: z.string().min(1),
  reason: z.string().min(1),
});

const targetTeamContextField = { targetTeam: z.string().trim().min(1).nullable().optional() };

export const RecruitmentActionSchema = z.discriminatedUnion("action", [
  z.object({
    ...targetTeamContextField,
    action: z.literal("inspect_team"),
    teamName: z.string().min(1).describe("The club mentioned by the user; inspect only the dataset sample."),
  }),
  z.object({
    ...targetTeamContextField,
    action: z.literal("search_candidates"),
    position: PositionSchema.nullable().default(null),
    playerName: z.string().trim().min(1).nullable().default(null),
    maxAge: z.number().int().min(15).max(45).nullable().default(null),
    minimumMinutes: z.number().int().min(0).max(5000).default(0),
    competition: z.string().nullable().default(null),
    season: z.string().nullable().default(null),
    offset: z.number().int().min(0).default(0),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  z.object({
    ...targetTeamContextField,
    action: z.literal("search_methodology"),
    query: z.string().trim().min(2).max(2000),
    limit: z.number().int().min(1).max(8).default(4),
  }),
  z.object({
    ...targetTeamContextField,
    action: z.literal("search_player_reports"),
    query: z.string().trim().min(2).max(2000),
    playerNames: z.array(z.string().trim().min(1)).min(1).max(10),
    limit: z.number().int().min(1).max(8).default(4),
  }),
  z.object({
    ...targetTeamContextField,
    action: z.literal("evaluate_candidates"),
    playerIds: z.array(z.string().min(1)).min(1).max(10),
  }),
  z.object({
    ...targetTeamContextField,
    ...AskUserActionSchema.shape,
  }),
  FinishActionSchema,
]);

export type RecruitmentAction = z.input<typeof RecruitmentActionSchema>;
export type ParsedRecruitmentAction = z.output<typeof RecruitmentActionSchema>;
export type FinishRecruitmentAction = z.output<typeof FinishActionSchema>;

export const toolBudgets = {
  inspect_team: 2,
  search_methodology: 2,
  search_candidates: 4,
  evaluate_candidates: 3,
  search_player_reports: 2,
} as const;

export type ToolActionName = keyof typeof toolBudgets;
export type ToolUseCounts = Record<ToolActionName, number>;

export function emptyToolUseCounts(): ToolUseCounts {
  return { inspect_team: 0, search_methodology: 0, search_candidates: 0, evaluate_candidates: 0, search_player_reports: 0 };
}

export function isToolAction(action: ParsedRecruitmentAction): action is Extract<ParsedRecruitmentAction, { action: ToolActionName }> {
  return action.action in toolBudgets;
}
