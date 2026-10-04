import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod/v4";
import { knowledgeDocumentId } from "../knowledge/document-id.js";
import type { KnowledgeDocumentInput } from "../knowledge/schemas.js";
import { firstPartyObservationSourceId } from "../knowledge/source-ids.js";
import {
  PlayerObservationInputSchema,
  PlayerObservationDimensionDefinitions,
  PlayerObservationSchema,
  type PlayerObservation,
  type PlayerObservationInput,
} from "./schemas.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const observationPublisher = "TactiScout 自录观察";

interface StoredPlayerObservation extends PlayerObservation {
  indexDocumentId: string | null;
}

const StoredPlayerObservationSchema = PlayerObservationSchema.extend({
  indexDocumentId: z.string().min(1).nullable(),
});

export interface PlayerObservationIndex {
  ingest(input: KnowledgeDocumentInput): Promise<{ documentId: string; chunkCount: number }>;
  removeDocument(documentId: string): Promise<number>;
}

export interface PlayerObservationLibrary {
  list(): Promise<PlayerObservation[]>;
  save(id: string | null, input: PlayerObservationInput): Promise<PlayerObservation>;
  delete(id: string): Promise<void>;
}

export class PlayerObservationNotFoundError extends Error {
  constructor(id: string) {
    super(`找不到球探观察记录 ${id}。`);
    this.name = "PlayerObservationNotFoundError";
  }
}

export class LocalPlayerObservationLibrary implements PlayerObservationLibrary {
  private readonly storagePath: string;
  private readonly index: PlayerObservationIndex;
  private readonly idGenerator: () => string;
  private readonly clock: () => Date;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(options: {
    index: PlayerObservationIndex;
    storagePath?: string;
    idGenerator?: () => string;
    clock?: () => Date;
  }) {
    this.index = options.index;
    this.storagePath = path.resolve(
      options.storagePath
      ?? process.env.TACTISCOUT_PLAYER_OBSERVATIONS_PATH
      ?? path.join(projectRoot, ".data", "player-observations.json"),
    );
    this.idGenerator = options.idGenerator ?? randomUUID;
    this.clock = options.clock ?? (() => new Date());
  }

  async list(): Promise<PlayerObservation[]> {
    const observations = await this.readStore();
    return observations
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .map(publicObservation);
  }

  async save(id: string | null, unparsedInput: PlayerObservationInput): Promise<PlayerObservation> {
    const input = PlayerObservationInputSchema.parse(unparsedInput);
    return this.serialize(async () => {
      const observations = await this.readStore();
      const previousIndex = id === null ? -1 : observations.findIndex((item) => item.id === id);
      if (id !== null && previousIndex < 0) throw new PlayerObservationNotFoundError(id);
      const previous = previousIndex < 0 ? undefined : observations[previousIndex];
      const clockTime = this.clock().getTime();
      const previousTime = previous ? Date.parse(previous.updatedAt) : 0;
      const now = new Date(Math.max(clockTime, previousTime + 1)).toISOString();
      const nextId = previous?.id ?? this.idGenerator();

      if (previous?.indexDocumentId) await this.index.removeDocument(previous.indexDocumentId);

      const baseRecord: StoredPlayerObservation = {
        ...input,
        id: nextId,
        createdAt: previous?.createdAt ?? now,
        updatedAt: now,
        indexStatus: input.allowAiProcessing ? "index_failed" : "local_only",
        indexDocumentId: null,
      };
      // Store the deterministic ID before ingest so revocation can remove a
      // document even if the process exits after LanceDB writes but before
      // the final observation status is persisted.
      if (input.allowAiProcessing) baseRecord.indexDocumentId = knowledgeDocumentId(toKnowledgeDocument(baseRecord));
      const nextRecords = [...observations];
      if (previousIndex < 0) nextRecords.push(baseRecord);
      else nextRecords[previousIndex] = baseRecord;
      await this.writeStore(nextRecords);

      if (!input.allowAiProcessing) return publicObservation(baseRecord);

      try {
        const indexed = await this.index.ingest(toKnowledgeDocument(baseRecord));
        const indexedRecord = { ...baseRecord, indexStatus: "indexed" as const, indexDocumentId: indexed.documentId };
        nextRecords[nextRecords.findIndex((item) => item.id === nextId)] = indexedRecord;
        await this.writeStore(nextRecords);
        return publicObservation(indexedRecord);
      } catch {
        return publicObservation(baseRecord);
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.serialize(async () => {
      const observations = await this.readStore();
      const index = observations.findIndex((item) => item.id === id);
      if (index < 0) throw new PlayerObservationNotFoundError(id);
      const observation = observations[index];
      if (observation?.indexDocumentId) await this.index.removeDocument(observation.indexDocumentId);
      observations.splice(index, 1);
      await this.writeStore(observations);
    });
  }

  private async readStore(): Promise<StoredPlayerObservation[]> {
    try {
      return StoredPlayerObservationSchema.array().parse(JSON.parse(await readFile(this.storagePath, "utf8")) as unknown);
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw new Error("本地球探观察记录无法读取；原文件未修改。", { cause: error });
    }
  }

  private async writeStore(observations: StoredPlayerObservation[]): Promise<void> {
    const directory = path.dirname(this.storagePath);
    await mkdir(directory, { recursive: true });
    const tempPath = `${this.storagePath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(tempPath, `${JSON.stringify(observations, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(tempPath, this.storagePath);
    } catch (error) {
      await rm(tempPath, { force: true }).catch(() => undefined);
      throw new Error("本地球探观察记录无法保存。", { cause: error });
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.mutationTail.then(operation, operation);
    this.mutationTail = next.then(() => undefined, () => undefined);
    return next;
  }
}

export function createPlayerObservationLibrary(options: ConstructorParameters<typeof LocalPlayerObservationLibrary>[0]): PlayerObservationLibrary {
  return new LocalPlayerObservationLibrary(options);
}

function publicObservation(observation: StoredPlayerObservation): PlayerObservation {
  return PlayerObservationSchema.parse(observation);
}

function toKnowledgeDocument(observation: StoredPlayerObservation): KnowledgeDocumentInput {
  const identity = observation.playerIdentityProvider && observation.externalPlayerId
    ? `${observation.playerIdentityProvider} 球员 ID：${observation.externalPlayerId}`
    : undefined;
  const evidenceLines = [
    `球员：${observation.playerName}`,
    identity,
    observation.teamAtObservation ? `观察时球队（由观察者记录）：${observation.teamAtObservation}` : undefined,
    observation.observedPosition ? `观察时位置：${observation.observedPosition}` : undefined,
    observation.observedRole ? `观察时职责（由观察者描述）：${observation.observedRole}` : undefined,
    `观察人：${observation.observer}`,
    `观察日期：${observation.observedAt}`,
    observation.competition ? `赛事：${observation.competition}` : undefined,
    observation.season ? `赛季：${observation.season}` : undefined,
    observation.match ? `比赛：${observation.match}` : undefined,
    observation.matchMinute === null ? undefined : `比赛时间点：第 ${observation.matchMinute} 分钟`,
    `作者记录的优势：${observation.strengths.join("；")}`,
    observation.risks.length ? `待核实风险：${observation.risks.join("；")}` : "待核实风险：作者未记录明确风险。",
    ...observation.ratings.map((rating) => {
      const dimension = PlayerObservationDimensionDefinitions[rating.dimension];
      const phase = dimension.phase === "in_possession" ? "有球" : dimension.phase === "out_of_possession" ? "无球" : "攻防转换";
      const minute = rating.matchMinute === null ? "" : `（第 ${rating.matchMinute} 分钟）`;
      return `球探主观评估 · ${phase} · ${dimension.label} · ${rating.rating}/5${minute}：${rating.evidence}`;
    }),
    `比赛观察：${observation.evidenceNote}`,
    "该内容由作者自录。1–5 档是观察者对该场样本的主观判断，不是统计事实、跨球员标准化分数或未来表现预测；不同观察记录不会自动求平均或进入适配评分。",
  ].filter(Boolean);
  const reference = observation.sourceReferenceUrl ? `；参考链接：${observation.sourceReferenceUrl}` : "";

  return {
    sourceId: firstPartyObservationSourceId,
    corpus: "player_report",
    title: `${observation.playerName} · 球探自录观察（${observation.observedAt}）`,
    url: `https://tactiscout.local/player-observations/${observation.id}?revision=${encodeURIComponent(observation.updatedAt)}`,
    author: observation.observer,
    publisher: observationPublisher,
    publishedAt: observation.observedAt,
    license: "用户自录观察；仅依照记录中的本地保存与模型处理授权使用",
    attribution: `${observation.observer}，观察日期 ${observation.observedAt}；作者自录的定性观点，未独立核实${reference}。`,
    entityIds: observation.externalPlayerId && observation.playerIdentityProvider
      ? [`${observation.playerIdentityProvider.toLocaleLowerCase()}:${observation.externalPlayerId}`]
      : [],
    entityNames: [observation.playerName, ...observation.playerAliases],
    competition: observation.competition,
    season: observation.season,
    acquisition: "authored",
    content: evidenceLines.join("\n"),
  };
}
