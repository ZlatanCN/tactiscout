import { z } from "zod/v4";

export const PositionSchema = z.enum(["GK", "DEF", "CB", "LB", "RB", "LWB", "RWB", "MID", "DM", "CM", "AM", "ATT", "LW", "RW", "ST"]);
export type Position = z.infer<typeof PositionSchema>;

export const DatasetModeSchema = z.enum(["demo", "statsbomb", "sportmonks"]);
export type DatasetMode = z.infer<typeof DatasetModeSchema>;

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

export const RawStatKeySchema = z.enum([
  "goals",
  "assists",
  "passesAttempted",
  "passesCompleted",
  "longPasses",
  "carries",
  "pressures",
  "tackles",
  "interceptions",
  "shotAssists",
]);
export type RawStatKey = z.infer<typeof RawStatKeySchema>;

export const PlayerDataSourceIdentitySchema = z.object({
  provider: z.string().min(1),
  playerId: z.string().min(1),
  teamId: z.string().optional(),
  competitionId: z.string().optional(),
  seasonId: z.string().optional(),
  retrievedAt: z.string().datetime(),
  isCurrentSeason: z.boolean().optional(),
});
export type PlayerDataSourceIdentity = z.infer<typeof PlayerDataSourceIdentitySchema>;

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
  sourceIdentity: PlayerDataSourceIdentitySchema.optional(),
  availableStats: z.array(RawStatKeySchema).optional(),
  eventDataComplete: z.boolean().optional(),
  source: z.string(),
});
export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;

export const Per90Schema = z.object({
  goals: z.number().nullable(),
  assists: z.number().nullable(),
  passesAttempted: z.number().nullable(),
  passCompletionPct: z.number().nullable(),
  longPasses: z.number().nullable(),
  carries: z.number().nullable(),
  pressures: z.number().nullable(),
  tacklesInterceptions: z.number().nullable(),
  shotAssists: z.number().nullable(),
});
export type Per90 = z.infer<typeof Per90Schema>;

export const RoleAssessmentSchema = z.object({
  phase: RolePhaseSchema,
  role: z.union([InPossessionRoleSchema, OutOfPossessionRoleSchema]),
  fit: z.number().min(0).max(100).nullable(),
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
  datasetMode: DatasetModeSchema,
  candidates: z.array(RankedCandidateSchema),
  review: ReviewSchema,
  caveats: z.array(z.string()),
});
export type ScoutResponse = z.infer<typeof ScoutResponseSchema>;

export const DatasetStatusSchema = z.object({
  mode: DatasetModeSchema,
  source: z.string(),
});
export type DatasetStatus = z.infer<typeof DatasetStatusSchema>;

export const ConversationTurnRequestSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  expectsExistingState: z.boolean().default(false),
});
export type ConversationTurnRequest = z.infer<typeof ConversationTurnRequestSchema>;

export const CapabilityMetricKeySchema = z.enum([
  "goals",
  "assists",
  "shotAssists",
  "carries",
  "longPasses",
  "passCompletionPct",
  "pressures",
  "tacklesInterceptions",
]);
export type CapabilityMetricKey = z.infer<typeof CapabilityMetricKeySchema>;

export const CapabilityMetricDefinitions = [
  { key: "goals", label: "进球", unit: "次/90" },
  { key: "assists", label: "助攻", unit: "次/90" },
  { key: "shotAssists", label: "射门助攻", unit: "次/90" },
  { key: "carries", label: "带球", unit: "次/90" },
  { key: "longPasses", label: "长传", unit: "次/90" },
  { key: "passCompletionPct", label: "传球成功率", unit: "%" },
  { key: "pressures", label: "施压", unit: "次/90" },
  { key: "tacklesInterceptions", label: "抢断与拦截", unit: "次/90" },
] as const satisfies readonly { key: CapabilityMetricKey; label: string; unit: string }[];

export const CapabilityEvidenceSchema = z.object({
  key: CapabilityMetricKeySchema,
  label: z.string(),
  value: z.number(),
  unit: z.string(),
  peerPercentile: z.number().min(0).max(100).nullable(),
  peerGroupSize: z.number().int().nonnegative(),
  minutes: z.number().nonnegative(),
  competition: z.string(),
  season: z.string(),
  source: z.string(),
});
export type CapabilityEvidence = z.infer<typeof CapabilityEvidenceSchema>;

export const PlayerRecommendationSchema = z.object({
  player: PlayerProfileSchema,
  rationale: z.string(),
  strengths: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  focusEvidenceKeys: z.array(CapabilityMetricKeySchema),
  evidence: z.array(CapabilityEvidenceSchema),
  reportObservations: z.array(z.object({
    summary: z.string(),
    verificationStatus: z.enum(["unverified", "linked_to_match_data"]),
    linkedMetricKeys: z.array(CapabilityMetricKeySchema),
    source: z.object({
      sourceId: z.string(),
      sourceName: z.string(),
      title: z.string(),
      url: z.string().url(),
      author: z.string(),
      publisher: z.string(),
      publishedAt: z.string().nullable(),
      license: z.string(),
      attribution: z.string(),
    }),
  })).default([]),
});
export type PlayerRecommendation = z.infer<typeof PlayerRecommendationSchema>;

export const EvidenceCoverageSummarySchema = z.object({
  evaluatedCandidateCount: z.number().int().nonnegative(),
  availableMetricValues: z.number().int().nonnegative(),
  expectedMetricValues: z.number().int().nonnegative(),
  lowSampleCandidates: z.number().int().nonnegative(),
  limitedPeerGroupCandidates: z.number().int().nonnegative(),
});
export type EvidenceCoverageSummary = z.infer<typeof EvidenceCoverageSummarySchema>;

export const KnowledgeCoverageSchema = z.object({
  methodologyChunksRetrieved: z.number().int().nonnegative(),
  methodologySearchFailed: z.boolean().default(false),
  playerReportSearchPerformed: z.boolean(),
  playerReportSearchFailed: z.boolean().default(false),
  playerReportChunksRetrieved: z.number().int().nonnegative(),
});
export type KnowledgeCoverage = z.infer<typeof KnowledgeCoverageSchema>;

export const RecruitmentSearchScopeSchema = z.object({
  position: PositionSchema.nullable(),
  maxAge: z.number().int().min(15).max(45).nullable(),
  minimumMinutes: z.number().int().nonnegative(),
  competition: z.string().nullable(),
  season: z.string().nullable(),
  source: z.enum(["agent_interpreted", "user_confirmed", "mixed"]),
});
export type RecruitmentSearchScope = z.infer<typeof RecruitmentSearchScopeSchema>;

export const RecruitmentReportSchema = z.object({
  targetTeam: z.string().nullable(),
  needSummary: z.string(),
  capabilityProfile: z.array(z.string()),
  evidenceCoverage: EvidenceCoverageSummarySchema,
  knowledgeCoverage: KnowledgeCoverageSchema.default({
    methodologyChunksRetrieved: 0,
    methodologySearchFailed: false,
    playerReportSearchPerformed: false,
    playerReportSearchFailed: false,
    playerReportChunksRetrieved: 0,
  }),
  searchScopes: z.array(RecruitmentSearchScopeSchema),
  recommendations: z.array(PlayerRecommendationSchema).max(5),
  limitations: z.array(z.string()),
  dataSource: z.string(),
  datasetMode: DatasetModeSchema,
});
export type RecruitmentReport = z.infer<typeof RecruitmentReportSchema>;

export const ConversationTurnResponseSchema = z.object({
  threadId: z.string().min(1),
  status: z.enum(["needs_input", "completed"]),
  message: z.string().min(1),
  question: z.object({ reason: z.string().min(1) }).nullable(),
  report: RecruitmentReportSchema.nullable(),
});
export type ConversationTurnResponse = z.infer<typeof ConversationTurnResponseSchema>;

export const RecruitmentProgressStageSchema = z.enum([
  "starting",
  "planning",
  "methodology",
  "team_sample",
  "candidate_search",
  "player_evaluation",
  "report_search",
  "review",
  "asking_user",
  "completed",
  "failed",
]);
export type RecruitmentProgressStage = z.infer<typeof RecruitmentProgressStageSchema>;

export const RecruitmentProgressSchema = z.object({
  active: z.boolean(),
  stage: RecruitmentProgressStageSchema,
  message: z.string().min(1),
  completedSteps: z.number().int().nonnegative(),
  updatedAt: z.string().datetime(),
});
export type RecruitmentProgress = z.infer<typeof RecruitmentProgressSchema>;
