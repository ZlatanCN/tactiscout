import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Bool, Field, FixedSizeList, Float32, List, Schema, Utf8 } from "apache-arrow";
import { connect, type Table } from "@lancedb/lancedb";
import { OpenAIEmbeddings } from "@langchain/openai";
import {
  KnowledgeDocumentInputSchema,
  KnowledgeSearchRequestSchema,
  KnowledgeSearchResultSchema,
  KnowledgeSourceSchema,
  KnowledgeStatusSchema,
  KnowledgePermissionError,
  type KnowledgeDocumentInput,
  type KnowledgeSearchRequest,
  type KnowledgeSearchResult,
  type KnowledgeSource,
  type KnowledgeStatus,
} from "./schemas.js";
import { starterKnowledgeDocuments } from "./seed.js";
import { assertCanIngestDocument } from "./permissions.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tableName = "knowledge_chunks";
const defaultModelId = "onnx-community/multilingual-e5-base-ONNX";
const localEmbeddingDtype = "q8";
const chunkSize = 900;
const chunkOverlap = 120;
const allowedChunkSearch = "permissionsVerified = true";

interface KnowledgeRow extends Record<string, unknown> {
  id: string;
  documentId: string;
  corpus: "methodology" | "player_report";
  sourceId: string;
  sourceName: string;
  sourcePublisher: string;
  sourceRights: string;
  title: string;
  url: string;
  author: string;
  publisher: string;
  publishedAt: string | null;
  license: string;
  attribution: string;
  entityIds: string[];
  entityNames: string[];
  competition: string | null;
  season: string | null;
  text: string;
  vector: number[];
  embeddingModel: string;
  permissionsVerified: boolean;
  displayAllowed: boolean;
}

export interface KnowledgeRepository {
  search(input: KnowledgeSearchRequest): Promise<KnowledgeSearchResult[]>;
}

export interface KnowledgeBase extends KnowledgeRepository {
  ingest(input: KnowledgeDocumentInput): Promise<{ documentId: string; chunkCount: number }>;
  status(): Promise<KnowledgeStatus>;
}

interface TextEmbedder {
  readonly modelId: string;
  embed(text: string, kind: "query" | "passage"): Promise<number[]>;
  embedMany?(texts: string[], kind: "query" | "passage"): Promise<number[][]>;
}

class LocalE5Embedder implements TextEmbedder {
  private readonly modelName = process.env.TACTISCOUT_EMBEDDING_MODEL?.trim() || defaultModelId;
  readonly modelId = `transformers.js:${localEmbeddingDtype}:${this.modelName}`;
  private extractorPromise: ReturnType<typeof createExtractor> | undefined;

  async embed(text: string, kind: "query" | "passage"): Promise<number[]> {
    const [vector] = await this.embedMany([text], kind);
    return vector;
  }

  async embedMany(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
    this.extractorPromise ??= createExtractor(this.modelName);
    const extractor = await this.extractorPromise;
    const vectors: number[][] = [];
    const batchSize = 8;
    for (let start = 0; start < texts.length; start += batchSize) {
      const batch = texts.slice(start, start + batchSize).map((text) => `${kind}: ${text}`);
      const output = await extractor(batch, { pooling: "mean", normalize: true });
      const data = output.data as Float32Array;
      const width = output.dims.at(-1) ?? Math.floor(data.length / batch.length);
      for (let index = 0; index < batch.length; index += 1) {
        vectors.push(Array.from(data.slice(index * width, (index + 1) * width)));
      }
    }
    return vectors;
  }
}

class OpenAICompatibleEmbedder implements TextEmbedder {
  readonly model: string;
  readonly modelId: string;
  private client: OpenAIEmbeddings | undefined;

  constructor() {
    this.model = process.env.TACTISCOUT_REMOTE_EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
    const configuredBaseUrl = process.env.TACTISCOUT_EMBEDDING_BASE_URL?.trim();
    const endpoint = configuredBaseUrl ? new URL(configuredBaseUrl) : new URL("https://api.openai.com/v1");
    this.modelId = `openai-compatible:${endpoint.origin}${endpoint.pathname.replace(/\/$/, "")}:${this.model}`;
  }

  async embed(text: string, kind: "query" | "passage"): Promise<number[]> {
    const client = this.getClient();
    return kind === "query" ? client.embedQuery(text) : (await client.embedDocuments([text]))[0];
  }

  async embedMany(texts: string[], kind: "query" | "passage"): Promise<number[][]> {
    const client = this.getClient();
    if (kind === "query") return Promise.all(texts.map((text) => client.embedQuery(text)));
    return client.embedDocuments(texts);
  }

  private getClient(): OpenAIEmbeddings {
    if (this.client) return this.client;
    const apiKey = process.env.TACTISCOUT_EMBEDDING_API_KEY?.trim();
    if (!apiKey) throw new Error("远程 embedding 已启用，但缺少 TACTISCOUT_EMBEDDING_API_KEY。");
    const baseURL = process.env.TACTISCOUT_EMBEDDING_BASE_URL?.trim();
    this.client = new OpenAIEmbeddings({
      apiKey,
      model: this.model,
      ...(baseURL ? { configuration: { baseURL } } : {}),
    });
    return this.client;
  }
}

function createConfiguredEmbedder(): TextEmbedder {
  return process.env.TACTISCOUT_EMBEDDING_PROVIDER?.trim() === "openai_compatible"
    ? new OpenAICompatibleEmbedder()
    : new LocalE5Embedder();
}

async function embedMany(embedder: TextEmbedder, texts: string[], kind: "query" | "passage"): Promise<number[][]> {
  if (embedder.embedMany) return embedder.embedMany(texts, kind);
  return Promise.all(texts.map((text) => embedder.embed(text, kind)));
}

async function createExtractor(modelId: string) {
  const { pipeline } = await import("@huggingface/transformers");
  return pipeline("feature-extraction", modelId, { dtype: localEmbeddingDtype });
}

function splitIntoChunks(content: string): string[] {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized.length <= chunkSize) return normalized ? [normalized] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    let end = Math.min(start + chunkSize, normalized.length);
    if (end < normalized.length) {
      const sentenceEnd = normalized.lastIndexOf("。", end);
      const englishEnd = normalized.lastIndexOf(". ", end);
      const preferredEnd = Math.max(sentenceEnd, englishEnd < 0 ? -1 : englishEnd + 1);
      if (preferredEnd > start + Math.floor(chunkSize * 0.55)) end = preferredEnd + 1;
    }
    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - chunkOverlap, start + 1);
  }
  return chunks.filter(Boolean);
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function tokenize(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

function normalizeEntityName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function numberList(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (value && typeof value === "object" && "toArray" in value && typeof value.toArray === "function") {
    return Array.from(value.toArray() as Iterable<unknown>, Number);
  }
  if (value && typeof value === "object" && Symbol.iterator in value) return Array.from(value as Iterable<unknown>, Number);
  return [];
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return Number.NEGATIVE_INFINITY;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] ** 2;
    rightMagnitude += right[index] ** 2;
  }
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (value && typeof value === "object" && "toArray" in value && typeof value.toArray === "function") {
    return Array.from(value.toArray() as Iterable<unknown>, String);
  }
  if (value && typeof value === "object" && Symbol.iterator in value) return Array.from(value as Iterable<unknown>, String);
  return [];
}

function bm25Scores(rows: KnowledgeRow[], query: string): Map<string, number> {
  const queryTerms = [...new Set(tokenize(query))];
  const documents = rows.map((row) => ({ row, terms: tokenize(`${row.title} ${stringList(row.entityNames).join(" ")} ${row.text}`) }));
  const averageLength = documents.reduce((sum, item) => sum + item.terms.length, 0) / Math.max(1, documents.length);
  const scores = new Map<string, number>();
  for (const term of queryTerms) {
    const documentFrequency = documents.filter((item) => item.terms.includes(term)).length;
    const idf = Math.log(1 + (documents.length - documentFrequency + 0.5) / (documentFrequency + 0.5));
    for (const item of documents) {
      const termFrequency = item.terms.filter((word) => word === term).length;
      if (!termFrequency) continue;
      const lengthAdjustment = 1 - 0.75 + 0.75 * (item.terms.length / Math.max(1, averageLength));
      const score = idf * (termFrequency * 2.2) / (termFrequency + 1.2 * lengthAdjustment);
      scores.set(item.row.id, (scores.get(item.row.id) ?? 0) + score);
    }
  }
  return scores;
}

function rankedIds(scores: Map<string, number>): string[] {
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

function reciprocalRankFusion(rankings: string[][]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index + 1)));
  }
  return scores;
}

function searchFilter(corpus: KnowledgeDocumentInput["corpus"]): string {
  return `${allowedChunkSearch} AND corpus = ${sqlString(corpus)}`;
}

function createKnowledgeSchema(vectorDimension: number): Schema {
  const item = () => new Field("item", new Utf8(), true);
  const stringField = (name: string, nullable = false) => new Field(name, new Utf8(), nullable);
  return new Schema([
    stringField("id"),
    stringField("documentId"),
    stringField("corpus"),
    stringField("sourceId"),
    stringField("sourceName"),
    stringField("sourcePublisher"),
    stringField("sourceRights"),
    stringField("title"),
    stringField("url"),
    stringField("author"),
    stringField("publisher"),
    stringField("publishedAt", true),
    stringField("license"),
    stringField("attribution"),
    new Field("entityIds", new List(item()), false),
    new Field("entityNames", new List(item()), false),
    stringField("competition", true),
    stringField("season", true),
    stringField("text"),
    new Field("vector", new FixedSizeList(vectorDimension, new Field("item", new Float32(), true)), false),
    stringField("embeddingModel"),
    new Field("permissionsVerified", new Bool(), false),
    new Field("displayAllowed", new Bool(), false),
  ]);
}

export class LocalKnowledgeBase implements KnowledgeBase {
  private readonly indexPath: string;
  private readonly registryPath: string;
  private readonly embedder: TextEmbedder;
  private readonly seedDocuments: KnowledgeDocumentInput[];
  private connectionPromise: ReturnType<typeof connect> | undefined;
  private tablePromise: Promise<Table | undefined> | undefined;
  private registryPromise: Promise<KnowledgeSource[]> | undefined;
  private seedsPromise: Promise<void> | undefined;

  constructor(options: {
    indexPath?: string;
    registryPath?: string;
    embedder?: TextEmbedder;
    seedDocuments?: KnowledgeDocumentInput[];
  } = {}) {
    this.indexPath = path.resolve(options.indexPath ?? process.env.TACTISCOUT_KNOWLEDGE_DIR ?? path.join(projectRoot, ".data", "knowledge"));
    this.registryPath = path.resolve(options.registryPath ?? process.env.TACTISCOUT_KNOWLEDGE_SOURCES_FILE ?? path.join(projectRoot, "data", "knowledge", "sources.json"));
    this.embedder = options.embedder ?? createConfiguredEmbedder();
    this.seedDocuments = options.seedDocuments ?? starterKnowledgeDocuments;
  }

  async ingest(unparsedInput: KnowledgeDocumentInput): Promise<{ documentId: string; chunkCount: number }> {
    const input = KnowledgeDocumentInputSchema.parse(unparsedInput);
    const source = (await this.sources()).find((candidate) => candidate.id === input.sourceId);
    if (!source) throw new KnowledgePermissionError(`来源 ${input.sourceId} 尚未登记；已拒绝入库。`);
    assertCanIngestDocument(source, input);
    await this.assertIndexModelCompatible();

    const documentId = createHash("sha256").update(`${input.sourceId}\n${input.url}\n${input.title}`).digest("hex");
    const chunks = splitIntoChunks(input.content);
    const vectors = await embedMany(this.embedder, chunks, "passage");
    const rows: KnowledgeRow[] = [];
    for (const [index, text] of chunks.entries()) {
      const id = createHash("sha256").update(`${documentId}\n${index}\n${text}`).digest("hex");
      rows.push({
        id,
        documentId,
        corpus: input.corpus,
        sourceId: source.id,
        sourceName: source.name,
        sourcePublisher: source.publisher,
        sourceRights: JSON.stringify(source.rights),
        title: input.title,
        url: input.url,
        author: input.author,
        publisher: input.publisher,
        publishedAt: input.publishedAt,
        license: input.license,
        attribution: input.attribution,
        entityIds: input.entityIds,
        entityNames: input.entityNames,
        competition: input.competition,
        season: input.season,
        text,
        vector: vectors[index],
        embeddingModel: this.embedder.modelId,
        permissionsVerified: true,
        displayAllowed: source.rights.display,
      });
    }
    if (rows.length) await this.addMissingRows(rows);
    return { documentId, chunkCount: rows.length };
  }

  async search(unparsedRequest: KnowledgeSearchRequest): Promise<KnowledgeSearchResult[]> {
    const request = KnowledgeSearchRequestSchema.parse(unparsedRequest);
    await this.ensureSeedDocuments();
    const table = await this.openTable();
    if (!table) return [];
    await this.assertIndexModelCompatible();
    const filter = searchFilter(request.corpus);
    const [corpusRows, queryVector] = await Promise.all([
      table.query().where(filter).toArray() as Promise<KnowledgeRow[]>,
      this.embedder.embed(request.query, "query"),
    ]);
    if (!corpusRows.length) return [];

    const requestedPlayerNames = request.playerNames.map(normalizeEntityName).filter(Boolean);
    const allRows = request.corpus === "player_report"
      ? corpusRows.filter((row) => {
        const indexedNames = stringList(row.entityNames).map(normalizeEntityName);
        return requestedPlayerNames.some((name) => indexedNames.includes(name));
      })
      : corpusRows;
    if (!allRows.length) return [];

    const lexicalRanks = rankedIds(bm25Scores(allRows, request.query));
    const vectorRanks = request.corpus === "player_report"
      ? allRows
        .map((row) => ({ id: row.id, score: cosineSimilarity(queryVector, numberList(row.vector)) }))
        .sort((left, right) => right.score - left.score)
        .map(({ id }) => id)
      : (await table.query().nearestTo(queryVector).where(filter).limit(Math.max(request.limit * 4, 20)).toArray() as KnowledgeRow[]).map((row) => row.id);
    const fused = reciprocalRankFusion([lexicalRanks, vectorRanks]);
    for (const row of allRows) {
      const indexedNames = stringList(row.entityNames).map(normalizeEntityName);
      const explicitEntityMatch = requestedPlayerNames.some((name) => indexedNames.includes(name));
      if (explicitEntityMatch) fused.set(row.id, (fused.get(row.id) ?? 0) + 0.02);
    }
    const byId = new Map(allRows.map((row) => [row.id, row]));
    const sourcesById = new Map((await this.sources()).map((source) => [source.id, source]));
    return [...fused.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, request.limit)
      .flatMap(([id]) => {
        const row = byId.get(id);
        const source = row ? sourcesById.get(row.sourceId) : undefined;
        if (!row || !source || !source.allowedCorpora.includes(row.corpus) || !source.rights.aiProcessing || !source.rights.persistentStorage) return [];
        return [KnowledgeSearchResultSchema.parse({
          id: row.id,
          documentId: row.documentId,
          corpus: row.corpus,
          text: row.text,
          title: row.title,
          url: row.url,
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          publisher: row.publisher,
          author: row.author,
          publishedAt: row.publishedAt,
          license: row.license,
          attribution: row.attribution,
          entityIds: stringList(row.entityIds),
          entityNames: stringList(row.entityNames),
          competition: row.competition,
          season: row.season,
          displayAllowed: source.rights.display,
        })];
      });
  }

  async status(): Promise<KnowledgeStatus> {
    const sources = await this.sources();
    const table = await this.openTable();
    const rows = table ? await table.query().where(allowedChunkSearch).toArray() as KnowledgeRow[] : [];
    return KnowledgeStatusSchema.parse({
      indexedChunks: rows.length,
      methodologyChunks: rows.filter((row) => row.corpus === "methodology").length,
      playerReportChunks: rows.filter((row) => row.corpus === "player_report").length,
      registeredSources: sources.length,
      ingestiblePlayerReportSources: sources.filter((source) =>
        source.allowedCorpora.includes("player_report") && source.rights.persistentStorage && source.rights.aiProcessing,
      ).length,
      embeddingModel: this.embedder.modelId,
      indexPath: this.indexPath,
    });
  }

  private async sources(): Promise<KnowledgeSource[]> {
    this.registryPromise ??= readFile(this.registryPath, "utf8")
      .then((contents) => JSON.parse(contents) as unknown)
      .then((contents) => KnowledgeSourceSchema.array().parse(contents));
    return this.registryPromise;
  }

  private async ensureSeedDocuments(): Promise<void> {
    this.seedsPromise ??= (async () => {
      for (const document of this.seedDocuments) await this.ingest(document);
    })();
    await this.seedsPromise;
  }

  private async connection() {
    this.connectionPromise ??= connect(this.indexPath);
    return this.connectionPromise;
  }

  private async openTable() {
    this.tablePromise ??= (async () => {
      const connection = await this.connection();
      const names = await connection.tableNames();
      if (!names.includes(tableName)) return undefined;
      return connection.openTable(tableName);
    })();
    return this.tablePromise;
  }

  private async addMissingRows(rows: KnowledgeRow[]): Promise<void> {
    const connection = await this.connection();
    const table = await this.openTable();
    if (!table) {
      const created = await connection.createTable(tableName, rows, {
        schema: createKnowledgeSchema(rows[0].vector.length),
      });
      this.tablePromise = Promise.resolve(created);
      return;
    }
    if (!rows.length) return;
    const existingRows = await table.query().where(`documentId = ${sqlString(rows[0].documentId)}`).toArray() as KnowledgeRow[];
    const existingIds = new Set(existingRows.map((row) => row.id));
    const missingRows = rows.filter((row) => !existingIds.has(row.id));
    if (missingRows.length) await table.add(missingRows);
  }

  private async assertIndexModelCompatible(): Promise<void> {
    const table = await this.openTable();
    if (!table) return;
    try {
      const mismatchedRows = await table.query()
        .where(`${allowedChunkSearch} AND embeddingModel != ${sqlString(this.embedder.modelId)}`)
        .select(["embeddingModel"])
        .limit(1)
        .toArray() as Array<{ embeddingModel?: string }>;
      if (mismatchedRows.length) {
        throw new Error(`当前知识索引使用了其他 embedding 模型（${mismatchedRows[0]?.embeddingModel ?? "未知"}）。请清空 .data/knowledge 后重新导入资料。`);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("当前知识索引使用了其他 embedding 模型")) throw error;
      throw new Error("无法确认知识索引使用的 embedding 模型；为避免混用，请清空 .data/knowledge 后重新导入资料。", { cause: error });
    }
  }
}

export function createLocalKnowledgeBase(options: ConstructorParameters<typeof LocalKnowledgeBase>[0] = {}): KnowledgeBase {
  return new LocalKnowledgeBase(options);
}

export function splitKnowledgeContent(content: string): string[] {
  return splitIntoChunks(content);
}
