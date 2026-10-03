import { z } from "zod/v4";

const observationText = z.string().trim().min(3).max(300);

export const PlayerObservationInputSchema = z.object({
  playerName: z.string().trim().min(2).max(120),
  playerAliases: z.array(z.string().trim().min(2).max(120)).max(12).default([]),
  playerIdentityProvider: z.string().trim().max(80).nullable().default(null),
  externalPlayerId: z.string().trim().max(120).nullable().default(null),
  competition: z.string().trim().max(120).nullable().default(null),
  season: z.string().trim().max(40).nullable().default(null),
  match: z.string().trim().max(180).nullable().default(null),
  observedAt: z.iso.date(),
  matchMinute: z.number().int().min(0).max(150).nullable().default(null),
  observer: z.string().trim().min(2).max(120),
  strengths: z.array(observationText).min(1).max(12),
  risks: z.array(observationText).max(12).default([]),
  evidenceNote: z.string().trim().min(20).max(2000),
  sourceReferenceUrl: z.string().url().refine((value) => new URL(value).protocol === "https:", "参考链接必须使用 HTTPS。").nullable().default(null),
  allowPersistentStorage: z.literal(true, { error: "保存球探观察需要明确的本地持久化授权。" }),
  allowAiProcessing: z.boolean(),
}).refine((value) => (value.playerIdentityProvider === null) === (value.externalPlayerId === null), {
  message: "外部球员 ID 和数据来源必须一起填写。",
  path: ["externalPlayerId"],
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
