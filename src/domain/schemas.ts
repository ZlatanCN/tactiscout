import { z } from "zod/v4";

export const PositionSchema = z.enum(["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LW", "RW", "ST"]);
export type Position = z.infer<typeof PositionSchema>;

export const InPossessionRoleSchema = z.enum(["progression", "retention", "creation"]);
export type InPossessionRole = z.infer<typeof InPossessionRoleSchema>;

export const OutOfPossessionRoleSchema = z.enum(["pressing", "defensive_disruption"]);
export type OutOfPossessionRole = z.infer<typeof OutOfPossessionRoleSchema>;

export const RolePhaseSchema = z.enum(["in_possession", "out_of_possession"]);

export const ScoutInputSchema = z.object({
  targetTeam: z.string().trim().min(1).describe("Club the recommendation is for"),
  query: z.string().optional().describe("Original natural-language scouting brief"),
  position: PositionSchema,
  maxAge: z.number().int().min(15).max(45).optional(),
  inPossessionRoles: z.array(InPossessionRoleSchema).default([]),
  outOfPossessionRoles: z.array(OutOfPossessionRoleSchema).default([]),
  topK: z.number().int().min(1).max(10).default(5),
  includeUnknownAge: z.boolean().default(false),
}).refine(
  (value) => value.inPossessionRoles.length + value.outOfPossessionRoles.length > 0,
  { message: "至少选择一项有球或无球职责。" },
);
export type ScoutInput = z.infer<typeof ScoutInputSchema>;

export const BriefFieldsSchema = z.object({
  targetTeam: z.string().nullable().describe("Only fill when explicitly stated; otherwise null"),
  position: PositionSchema.nullable().describe("Only fill when clearly stated; otherwise null"),
  maxAge: z.number().int().min(15).max(45).nullable().describe("Maximum age, or null when not stated"),
  inPossessionRoles: z.array(InPossessionRoleSchema).describe("Explicitly stated on-ball preferences only"),
  outOfPossessionRoles: z.array(OutOfPossessionRoleSchema).describe("Explicitly stated off-ball preferences only"),
});
export type BriefFields = z.infer<typeof BriefFieldsSchema>;

export const ParseBriefRequestSchema = z.object({
  brief: z.string().trim().min(5).max(4000),
});
export type ParseBriefRequest = z.infer<typeof ParseBriefRequestSchema>;

export const ParseBriefResponseSchema = z.object({
  draft: BriefFieldsSchema,
  missingFields: z.array(z.enum(["targetTeam", "position"])),
});
export type ParseBriefResponse = z.infer<typeof ParseBriefResponseSchema>;

export const RequirementsSchema = z.object({
  targetTeam: z.string().trim().min(1),
  position: PositionSchema,
  maxAge: z.number().int().min(15).max(45).optional(),
  inPossessionRoles: z.array(InPossessionRoleSchema).default([]),
  outOfPossessionRoles: z.array(OutOfPossessionRoleSchema).default([]),
  includeUnknownAge: z.boolean().default(false),
  topK: z.number().int().min(1).max(10).default(5),
}).refine(
  (value) => value.inPossessionRoles.length + value.outOfPossessionRoles.length > 0,
  { message: "至少选择一项有球或无球职责。" },
);
export type Requirements = z.infer<typeof RequirementsSchema>;

export const RawStatsSchema = z.object({
  goals: z.number().default(0),
  assists: z.number().default(0),
  passesAttempted: z.number().default(0),
  passesCompleted: z.number().default(0),
  longPasses: z.number().default(0),
  carries: z.number().default(0),
  pressures: z.number().default(0),
  tackles: z.number().default(0),
  interceptions: z.number().default(0),
  shotAssists: z.number().default(0),
});

export const PlayerProfileSchema = z.object({
  playerId: z.string(),
  externalPlayerId: z.string().optional(),
  name: z.string(),
  team: z.string(),
  age: z.number().int().nullable(),
  ageSource: z.string().optional(),
  ageVerifiedAt: z.string().optional(),
  position: PositionSchema,
  competition: z.string(),
  season: z.string(),
  minutes: z.number().nonnegative(),
  stats: RawStatsSchema,
  source: z.string(),
});
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

export const Per90Schema = z.object({
  goals: z.number(),
  assists: z.number(),
  passesAttempted: z.number(),
  passCompletionPct: z.number(),
  longPasses: z.number(),
  carries: z.number(),
  pressures: z.number(),
  tacklesInterceptions: z.number(),
  shotAssists: z.number(),
});
export type Per90 = z.infer<typeof Per90Schema>;

export const RoleAssessmentSchema = z.object({
  phase: RolePhaseSchema,
  role: z.union([InPossessionRoleSchema, OutOfPossessionRoleSchema]),
  fit: z.number().min(0).max(100),
  evidence: z.array(z.string()),
  unsupportedAttributes: z.array(z.string()),
});
export type RoleAssessment = z.infer<typeof RoleAssessmentSchema>;

export const RankedCandidateSchema = z.object({
  player: PlayerProfileSchema,
  per90: Per90Schema,
  inPossessionFit: z.number().min(0).max(100).nullable(),
  outOfPossessionFit: z.number().min(0).max(100).nullable(),
  tacticalFit: z.number().min(0).max(100),
  score: z.number().min(0).max(100),
  roleAssessments: z.array(RoleAssessmentSchema),
  reasons: z.array(z.string()),
  risks: z.array(z.string()),
});
export type RankedCandidate = z.infer<typeof RankedCandidateSchema>;

export const ReviewSchema = z.object({
  evidenceCompleteness: z.number().min(0).max(1),
  evidenceCoverage: z.number().min(0).max(1),
  findings: z.array(z.string()),
  retryRecommended: z.boolean(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ScoutResponseSchema = z.object({
  targetTeam: z.string(),
  requirements: RequirementsSchema,
  dataSource: z.string(),
  datasetMode: z.enum(["demo", "statsbomb"]),
  candidates: z.array(RankedCandidateSchema),
  review: ReviewSchema,
  caveats: z.array(z.string()),
});
export type ScoutResponse = z.infer<typeof ScoutResponseSchema>;

export const DatasetStatusSchema = z.object({
  mode: z.enum(["demo", "statsbomb"]),
  source: z.string(),
});
export type DatasetStatus = z.infer<typeof DatasetStatusSchema>;
