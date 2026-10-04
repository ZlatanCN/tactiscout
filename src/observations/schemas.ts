import { z } from "zod/v4";
import { PositionSchema } from "../domain/schemas.js";

const observationText = z.string().trim().min(3).max(300);

export const PlayerObservationDimensionSchema = z.enum([
  "progression",
  "ball_retention",
  "chance_creation",
  "off_ball_movement",
  "pressing",
  "defensive_positioning",
  "duels",
  "transition_response",
]);
export type PlayerObservationDimension = z.infer<typeof PlayerObservationDimensionSchema>;

export const PlayerObservationDimensionDefinitions: Record<PlayerObservationDimension, {
  label: string;
  phase: "in_possession" | "out_of_possession" | "transition";
  description: string;
}> = {
  progression: { label: "向前推进", phase: "in_possession", description: "通过带球或传球推进，并帮助球队越过对手防线。" },
  ball_retention: { label: "压力下控球", phase: "in_possession", description: "在对手施压时保护球权、摆脱压迫或安全连接队友。" },
  chance_creation: { label: "创造机会", phase: "in_possession", description: "通过传球、带球或跑位制造有威胁的进攻局面。" },
  off_ball_movement: { label: "无球跑动", phase: "in_possession", description: "通过无球移动提供接应、拉开空间或攻击空当。" },
  pressing: { label: "压迫参与", phase: "out_of_possession", description: "选择合适时机施压，并与队友保持防守协同。" },
  defensive_positioning: { label: "防守站位", phase: "out_of_possession", description: "保护危险空间、封锁线路并及时补位。" },
  duels: { label: "一对一对抗", phase: "out_of_possession", description: "在地面或空中对抗中处理直接挑战。" },
  transition_response: { label: "攻防转换反应", phase: "transition", description: "丢球或夺回球权后快速采取符合局势的行动。" },
};

export const PlayerObservationRatingSchema = z.object({
  dimension: PlayerObservationDimensionSchema,
  rating: z.number().int().min(1).max(5),
  matchMinute: z.number().int().min(0).max(150).nullable().default(null),
  evidence: z.string().trim().min(20).max(600),
});
export type PlayerObservationRating = z.infer<typeof PlayerObservationRatingSchema>;

export const PlayerObservationInputSchema = z.object({
  playerName: z.string().trim().min(2).max(120),
  playerAliases: z.array(z.string().trim().min(2).max(120)).max(12).default([]),
  playerIdentityProvider: z.string().trim().max(80).nullable().default(null),
  externalPlayerId: z.string().trim().max(120).nullable().default(null),
  teamAtObservation: z.string().trim().max(120).nullable().default(null),
  observedPosition: PositionSchema.nullable().default(null),
  observedRole: z.string().trim().max(120).nullable().default(null),
  competition: z.string().trim().max(120).nullable().default(null),
  season: z.string().trim().max(40).nullable().default(null),
  match: z.string().trim().max(180).nullable().default(null),
  observedAt: z.iso.date(),
  matchMinute: z.number().int().min(0).max(150).nullable().default(null),
  observer: z.string().trim().min(2).max(120),
  strengths: z.array(observationText).min(1).max(12),
  risks: z.array(observationText).max(12).default([]),
  ratings: z.array(PlayerObservationRatingSchema).max(8).default([]),
  evidenceNote: z.string().trim().min(20).max(2000),
  sourceReferenceUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "参考链接必须使用 HTTPS。").nullable().default(null),
  allowPersistentStorage: z.literal(true, { error: "保存球探观察需要明确的本地持久化授权。" }),
  allowAiProcessing: z.boolean(),
}).refine((value) => (value.playerIdentityProvider === null) === (value.externalPlayerId === null), {
  message: "外部球员 ID 和数据来源必须一起填写。",
  path: ["externalPlayerId"],
}).refine((value) => new Set(value.ratings.map((rating) => rating.dimension)).size === value.ratings.length, {
  message: "同一场观察中，每个能力维度只能记录一次；请将多个场景写入该维度的依据。",
  path: ["ratings"],
});
export type PlayerObservationInput = z.infer<typeof PlayerObservationInputSchema>;

export const PlayerObservationSchema = PlayerObservationInputSchema.extend({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  indexStatus: z.enum(["indexed", "local_only", "index_failed"]),
});
export type PlayerObservation = z.infer<typeof PlayerObservationSchema>;

export const PlayerObservationListSchema = z.array(PlayerObservationSchema);

const ObservationCoverageCountSchema = z.object({
  label: z.string().min(1),
  count: z.number().int().nonnegative(),
});

export const PlayerObservationDatasetSummarySchema = z.object({
  observationRecords: z.number().int().nonnegative(),
  matchScopedRecords: z.number().int().nonnegative(),
  recordsWithRatings: z.number().int().nonnegative(),
  ratingEntries: z.number().int().nonnegative(),
  observerCount: z.number().int().nonnegative(),
  aiProcessingAllowedRecords: z.number().int().nonnegative(),
  indexedRecords: z.number().int().nonnegative(),
  indexFailedRecords: z.number().int().nonnegative(),
  localOnlyRecords: z.number().int().nonnegative(),
  competitionCoverage: z.array(ObservationCoverageCountSchema),
  seasonCoverage: z.array(ObservationCoverageCountSchema),
  dimensionCoverage: z.array(z.object({
    dimension: PlayerObservationDimensionSchema,
    label: z.string().min(1),
    recordCount: z.number().int().nonnegative(),
  })),
  latestObservedAt: z.iso.date().nullable(),
});
export type PlayerObservationDatasetSummary = z.infer<typeof PlayerObservationDatasetSummarySchema>;
