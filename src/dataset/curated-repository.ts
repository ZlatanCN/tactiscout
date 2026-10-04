import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod/v4";
import {
  DatasetSnapshotStatusSchema,
  PlayerProfileSchema,
  PositionSchema,
  RawStatKeySchema,
  RawStatsSchema,
  SupplementaryMetricKeySchema,
  SupplementaryMetricNormalizationSchema,
  type DatasetSnapshotStatus,
  type PlayerProfile,
  type RawStatKey,
} from "../domain/schemas.js";
import type { PlayerRepository } from "../data/provider.js";

const CuratedMetricSchema = z.object({
  key: z.string().min(1),
  value: z.number().nullable(),
  unit: z.string(),
  type: z.enum(["event_aggregate", "event_derived_estimate"]),
  definition: z.string().min(1),
  sourceField: z.string().min(1),
  sampleMinutes: z.number().nonnegative().nullable(),
  sampleMatches: z.number().int().nonnegative().nullable(),
  normalization: SupplementaryMetricNormalizationSchema.optional(),
  sampleAttempts: z.number().int().nonnegative().nullable().optional(),
});

const CuratedRecordSchema = z.object({
  playerId: z.string().min(1),
  externalPlayerId: z.string().min(1),
  name: z.string().min(1),
  team: z.string().min(1),
  teamId: z.string().min(1),
  competition: z.string().min(1),
  competitionId: z.string().min(1),
  season: z.string().min(1),
  ageAtSeasonEnd: z.number().int().nullable(),
  position: PositionSchema,
  minutes: z.number().nonnegative(),
  appearanceMatches: z.number().int().nonnegative(),
  eventDataComplete: z.boolean(),
  metrics: z.array(CuratedMetricSchema),
});

const CuratedDatasetSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  datasetId: z.string().min(1),
  builtAt: z.string().datetime(),
  attribution: z.string().min(1),
  license: z.object({ name: z.literal("CC BY 4.0"), url: z.literal("https://creativecommons.org/licenses/by/4.0/") }),
  upstreamSource: z.object({
    name: z.string().min(1),
    publisher: z.string().min(1),
    paperUrl: z.string().url(),
    acquiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    scope: z.string().min(1),
  }),
  coverage: z.object({
    playerSeasonRecords: z.number().int().nonnegative(),
    uniquePlayers: z.number().int().nonnegative(),
    teams: z.number().int().nonnegative(),
    matches: z.number().int().nonnegative(),
    competitions: z.array(z.string()),
    seasons: z.array(z.string()),
    recordsWithCompleteEvents: z.number().int().nonnegative(),
    recordsWithEstimatedMinutes: z.number().int().nonnegative(),
    metrics: z.array(z.object({
      key: z.string().min(1),
      availableRecords: z.number().int().nonnegative(),
      totalRecords: z.number().int().nonnegative(),
      coverageRatio: z.number().min(0).max(1),
      unit: z.string(),
      type: z.enum(["event_aggregate", "event_derived_estimate"]),
      definition: z.string().min(1),
    })),
  }),
  records: z.array(CuratedRecordSchema).min(1),
});

type CuratedDatasetSnapshot = z.infer<typeof CuratedDatasetSnapshotSchema>;
type CuratedRecord = z.infer<typeof CuratedRecordSchema>;

export interface CuratedDatasetRepositoryOptions {
  filePath: string;
  allowModelProcessing?: boolean;
}

export class CuratedDatasetRepository implements PlayerRepository {
  readonly mode = "curated" as const;
  readonly sourceName = "TactiScout 自建球探数据集 · Wyscout 2017/18";

  private readonly filePath: string;
  private snapshotPromise?: Promise<CuratedDatasetSnapshot>;
  private playersPromise?: Promise<PlayerProfile[]>;

  constructor(options: CuratedDatasetRepositoryOptions) {
    if (!options.allowModelProcessing) {
      throw new Error("TactiScout 自建数据集涉及 Wyscout 开放数据；启用模型分析前请先确认并设置 TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED=true。");
    }
    this.filePath = path.resolve(options.filePath);
  }

  async getDatasetStatus(): Promise<DatasetSnapshotStatus> {
    const snapshot = await this.loadSnapshot();
    return DatasetSnapshotStatusSchema.parse({
      datasetId: snapshot.datasetId,
      builtAt: snapshot.builtAt,
      ...snapshot.coverage,
    });
  }

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    if (refresh) {
      this.snapshotPromise = undefined;
      this.playersPromise = undefined;
    }
    this.playersPromise ??= this.loadSnapshot().then((snapshot) => snapshot.records.map((record) => this.toPlayer(record, snapshot)));
    return this.playersPromise;
  }

  private loadSnapshot(): Promise<CuratedDatasetSnapshot> {
    this.snapshotPromise ??= readFile(this.filePath, "utf8")
      .then((content) => CuratedDatasetSnapshotSchema.parse(JSON.parse(content) as unknown))
      .catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          throw new Error(`TactiScout 自建数据集不存在：${this.filePath}。请先运行 pnpm dataset:build。`);
        }
        if (error instanceof z.ZodError) throw new Error(`TactiScout 自建数据集格式不受支持：${error.issues[0]?.message ?? "invalid snapshot"}`);
        if (error instanceof SyntaxError) throw new Error("TactiScout 自建数据集不是有效 JSON，请重新运行 pnpm dataset:build。");
        throw error;
      });
    return this.snapshotPromise;
  }

  private toPlayer(record: CuratedRecord, snapshot: CuratedDatasetSnapshot): PlayerProfile {
    const stats = Object.fromEntries(RawStatKeySchema.options.map((key) => [key, 0])) as Record<RawStatKey, number>;
    const availableStats: RawStatKey[] = [];
    const supplementaryMetrics = [];
    for (const metric of record.metrics) {
      const rawKey = RawStatKeySchema.safeParse(metric.key);
      if (rawKey.success && metric.type === "event_aggregate") {
        if (metric.value === null) throw new Error(`Required event aggregate ${metric.key} is null for ${record.playerId}.`);
        stats[rawKey.data] = metric.value;
        availableStats.push(rawKey.data);
        continue;
      }
      const supplementaryKey = SupplementaryMetricKeySchema.safeParse(metric.key);
      if (!supplementaryKey.success || metric.normalization === undefined) {
        throw new Error(`Unsupported or incomplete derived metric ${metric.key} for ${record.playerId}.`);
      }
      supplementaryMetrics.push({
        key: supplementaryKey.data,
        definition: metric.definition,
        value: metric.value,
        unit: metric.unit,
        normalization: metric.normalization,
        sourceField: metric.sourceField,
        sampleMinutes: metric.sampleMinutes,
        sampleMatches: metric.sampleMatches,
        ...(metric.sampleAttempts === undefined ? {} : { sampleAttempts: metric.sampleAttempts }),
      });
    }
    const seasonEnd = /^(\d{4})\/(\d{2})$/.exec(record.season)?.[1];
    const seasonEndDate = seasonEnd ? `${Number(seasonEnd) + 1}-06-30` : undefined;
    return PlayerProfileSchema.parse({
      playerId: record.playerId,
      externalPlayerId: record.externalPlayerId,
      name: record.name,
      team: record.team,
      age: record.ageAtSeasonEnd,
      ...(record.ageAtSeasonEnd === null ? {} : {
        ageSource: "Wyscout Open Data birthDate; age at historical season end",
        ...(seasonEndDate ? { ageVerifiedAt: seasonEndDate } : {}),
      }),
      position: record.position,
      competition: record.competition,
      season: record.season,
      minutes: record.minutes,
      appearanceMatchCount: record.appearanceMatches,
      datasetId: snapshot.datasetId,
      datasetBuiltAt: snapshot.builtAt,
      stats: RawStatsSchema.parse(stats),
      sourceIdentity: {
        provider: "wyscout-open-data",
        playerId: record.externalPlayerId,
        teamId: record.teamId,
        competitionId: record.competitionId,
        seasonId: record.season,
        retrievedAt: `${snapshot.upstreamSource.acquiredAt}T00:00:00.000Z`,
        isCurrentSeason: false,
      },
      availableStats,
      ...(supplementaryMetrics.length > 0 ? { supplementaryMetrics } : {}),
      eventDataComplete: record.eventDataComplete,
      source: `TactiScout 自建指标 · ${snapshot.upstreamSource.name} · ${snapshot.license.name}`,
    });
  }
}
