import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlayerProfile, RawStatKey, SupplementaryMetricNormalization } from "../domain/schemas.js";
import { WyscoutPlayerRepository } from "../data/wyscout-provider.js";

const DATASET_SCHEMA_VERSION = 1;
const DERIVATION_RULESET = "tactiscout-wyscout-events-v1";
const SOURCE_LICENSE = "CC BY 4.0";
const SOURCE_LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";
const SOURCE_PAPER_URL = "https://doi.org/10.1038/s41597-019-0247-7";
const RAW_METRIC_DEFINITIONS: Record<RawStatKey, { definition: string; sourceField: string }> = {
  goals: { definition: "Count of shot events carrying Wyscout tag 101.", sourceField: "eventName=Shot; tags includes 101" },
  assists: { definition: "Count of events carrying Wyscout tag 301.", sourceField: "tags includes 301" },
  passesAttempted: { definition: "Count of events whose eventName is Pass.", sourceField: "eventName=Pass" },
  passesCompleted: { definition: "Count of Pass events carrying Wyscout tag 1801.", sourceField: "eventName=Pass; tags includes 1801" },
  keyPasses: { definition: "Count of events carrying Wyscout tag 302; not equivalent to shot assists.", sourceField: "tags includes 302" },
  longPasses: { definition: "Not available in the Wyscout Open Data adapter.", sourceField: "unavailable" },
  carries: { definition: "Not available in the Wyscout Open Data adapter.", sourceField: "unavailable" },
  pressures: { definition: "Not available in the Wyscout Open Data adapter.", sourceField: "unavailable" },
  tackles: { definition: "Not available in the Wyscout Open Data adapter.", sourceField: "unavailable" },
  interceptions: { definition: "Not available in the Wyscout Open Data adapter.", sourceField: "unavailable" },
  shotAssists: { definition: "Not available in the Wyscout Open Data adapter.", sourceField: "unavailable" },
};

interface SourceProvenance {
  dataset: string;
  publisher: string;
  publicationDoi: string;
  retrievedAt: string;
  license: string;
  licenseUrl: string;
  scope: string;
  items: Array<{ name: string; url: string; file: string; sha256: string }>;
}

interface InputFileFingerprint {
  file: string;
  bytes: number;
  sha256: string;
}

interface DatasetMetric {
  key: string;
  value: number | null;
  unit: string;
  type: "event_aggregate" | "event_derived_estimate";
  definition: string;
  sourceField: string;
  sampleMinutes: number | null;
  sampleMatches: number | null;
  normalization?: SupplementaryMetricNormalization;
  sampleAttempts?: number | null;
}

interface DatasetPlayerRecord {
  playerId: string;
  externalPlayerId: string;
  name: string;
  team: string;
  teamId: string;
  competition: string;
  competitionId: string;
  season: string;
  ageAtSeasonEnd: number | null;
  position: PlayerProfile["position"];
  minutes: number;
  appearanceMatches: number;
  eventDataComplete: boolean;
  metrics: DatasetMetric[];
}

export interface TactiScoutDatasetSnapshot {
  schemaVersion: number;
  datasetId: string;
  builtAt: string;
  attribution: string;
  license: { name: string; url: string };
  upstreamSource: {
    name: string;
    publisher: string;
    paperUrl: string;
    acquiredAt: string;
    scope: string;
    items: SourceProvenance["items"];
  };
  derivation: {
    ruleset: string;
    description: string;
  };
  inputs: InputFileFingerprint[];
  coverage: {
    playerSeasonRecords: number;
    uniquePlayers: number;
    teams: number;
    matches: number;
    competitions: string[];
    seasons: string[];
    recordsWithCompleteEvents: number;
    recordsWithEstimatedMinutes: number;
    metrics: Array<{
      key: string;
      availableRecords: number;
      totalRecords: number;
      coverageRatio: number;
      unit: string;
      type: DatasetMetric["type"];
      definition: string;
    }>;
  };
  limitations: string[];
  records: DatasetPlayerRecord[];
}

export interface BuildWyscoutDatasetOptions {
  sourceDirectory: string;
  outputDirectory: string;
  now?: () => Date;
}

export interface BuiltWyscoutDataset {
  path: string;
  latestPath: string;
  snapshot: TactiScoutDatasetSnapshot;
}

export class DatasetBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatasetBuildError";
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function hashFile(filePath: string): Promise<InputFileFingerprint> {
  const hash = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(filePath)) {
    const buffer = chunk as Buffer;
    bytes += buffer.byteLength;
    hash.update(buffer);
  }
  return { file: path.basename(filePath), bytes, sha256: hash.digest("hex") };
}

async function readProvenance(sourceDirectory: string): Promise<SourceProvenance> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path.join(sourceDirectory, "provenance.json"), "utf8")) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new DatasetBuildError("Missing provenance.json; record the source, license, and acquisition date before building a dataset.");
    }
    throw new DatasetBuildError("provenance.json is not valid JSON.");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DatasetBuildError("provenance.json must contain a JSON object.");
  const value = raw as Record<string, unknown>;
  if (value.dataset !== "Soccer match event dataset") throw new DatasetBuildError("The configured source is not the expected Wyscout Soccer match event dataset.");
  if (value.license !== SOURCE_LICENSE || value.licenseUrl !== SOURCE_LICENSE_URL) {
    throw new DatasetBuildError("The source provenance must confirm CC BY 4.0 before dataset derivation.");
  }
  if (typeof value.publisher !== "string" || typeof value.publicationDoi !== "string" || typeof value.retrievedAt !== "string" || typeof value.scope !== "string") {
    throw new DatasetBuildError("provenance.json must record publisher, publication DOI, acquisition date, and scope.");
  }
  if (!Array.isArray(value.items) || !value.items.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const record = item as Record<string, unknown>;
    return ["name", "url", "file", "sha256"].every((key) => typeof record[key] === "string");
  })) {
    throw new DatasetBuildError("provenance.json must list the upstream dataset items and their source fingerprints.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value.retrievedAt) || Number.isNaN(Date.parse(`${value.retrievedAt}T00:00:00Z`))) {
    throw new DatasetBuildError("provenance.json retrievedAt must be a valid YYYY-MM-DD acquisition date.");
  }
  return value as unknown as SourceProvenance;
}

function isSourceFile(fileName: string): boolean {
  return /^(competitions|players|teams|matches(?:_[\w-]+)?|events(?:_[\w-]+)?)\.json$/.test(fileName);
}

async function fingerprintInputs(sourceDirectory: string): Promise<InputFileFingerprint[]> {
  const fileNames = (await readdir(sourceDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && isSourceFile(entry.name))
    .map((entry) => entry.name)
    .sort(compareText);
  for (const required of ["competitions.json", "players.json", "teams.json"]) {
    if (!fileNames.includes(required)) throw new DatasetBuildError(`Missing required Wyscout source file: ${required}.`);
  }
  if (!fileNames.some((name) => name.startsWith("matches_")) || !fileNames.some((name) => name.startsWith("events_"))) {
    throw new DatasetBuildError("Wyscout match and event files (matches_*.json, events_*.json) are required.");
  }
  return Promise.all(fileNames.map((fileName) => hashFile(path.join(sourceDirectory, fileName))));
}

async function countClubMatches(sourceDirectory: string): Promise<number> {
  const competitions = JSON.parse(await readFile(path.join(sourceDirectory, "competitions.json"), "utf8")) as unknown;
  if (!Array.isArray(competitions)) throw new DatasetBuildError("competitions.json must contain an array.");
  const clubIds = new Set(competitions.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    if (typeof record.type !== "string" || record.type.toLowerCase() !== "club") return [];
    const id = record.wyId;
    return typeof id === "number" || typeof id === "string" ? [String(id)] : [];
  }));
  const matchFiles = (await readdir(sourceDirectory))
    .filter((fileName) => /^matches(?:_[\w-]+)?\.json$/.test(fileName))
    .sort(compareText);
  const matchIds = new Set<string>();
  for (const fileName of matchFiles) {
    const rows = JSON.parse(await readFile(path.join(sourceDirectory, fileName), "utf8")) as unknown;
    if (!Array.isArray(rows)) throw new DatasetBuildError(`${fileName} must contain an array.`);
    for (const value of rows) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as Record<string, unknown>;
      if ((typeof record.competitionId === "number" || typeof record.competitionId === "string")
        && clubIds.has(String(record.competitionId))
        && (typeof record.wyId === "number" || typeof record.wyId === "string")) {
        matchIds.add(String(record.wyId));
      }
    }
  }
  return matchIds.size;
}

function toMetrics(profile: PlayerProfile): DatasetMetric[] {
  const availableStats = profile.availableStats ?? [];
  const available = new Set(availableStats);
  const metrics: DatasetMetric[] = [];
  for (const key of availableStats) {
    metrics.push({
      key,
      value: profile.stats[key],
      unit: "count",
      type: "event_aggregate",
      definition: RAW_METRIC_DEFINITIONS[key].definition,
      sourceField: RAW_METRIC_DEFINITIONS[key].sourceField,
      sampleMinutes: profile.minutes,
      sampleMatches: profile.appearanceMatchCount ?? 0,
    });
  }
  for (const metric of profile.supplementaryMetrics ?? []) {
    if (available.has(metric.key as RawStatKey)) throw new DatasetBuildError(`Metric key collision: ${metric.key}.`);
    metrics.push({
      key: metric.key,
      value: metric.value,
      unit: metric.unit,
      type: "event_derived_estimate",
      definition: metric.definition,
      sourceField: metric.sourceField,
      sampleMinutes: metric.sampleMinutes,
      sampleMatches: metric.sampleMatches,
      normalization: metric.normalization,
      ...(metric.sampleAttempts === undefined ? {} : { sampleAttempts: metric.sampleAttempts }),
    });
  }
  return metrics.sort((left, right) => compareText(left.key, right.key));
}

function toRecord(profile: PlayerProfile): DatasetPlayerRecord {
  const sourceIdentity = profile.sourceIdentity;
  if (!sourceIdentity || sourceIdentity.provider !== "wyscout-open-data") {
    throw new DatasetBuildError(`Player ${profile.playerId} is missing Wyscout source identity.`);
  }
  if (!sourceIdentity.teamId || !sourceIdentity.competitionId) {
    throw new DatasetBuildError(`Player ${profile.playerId} is missing a Wyscout team or competition ID.`);
  }
  return {
    playerId: profile.playerId,
    externalPlayerId: sourceIdentity.playerId,
    name: profile.name,
    team: profile.team,
    teamId: sourceIdentity.teamId,
    competition: profile.competition,
    competitionId: sourceIdentity.competitionId,
    season: profile.season,
    ageAtSeasonEnd: profile.age,
    position: profile.position,
    minutes: profile.minutes,
    appearanceMatches: profile.appearanceMatchCount ?? 0,
    eventDataComplete: profile.eventDataComplete ?? false,
    metrics: toMetrics(profile),
  };
}

function contentDigest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function buildCoverage(records: DatasetPlayerRecord[], matches: number): TactiScoutDatasetSnapshot["coverage"] {
  const metricDefinitions = new Map<string, DatasetMetric>();
  for (const record of records) {
    for (const metric of record.metrics) {
      if (!metricDefinitions.has(metric.key)) metricDefinitions.set(metric.key, metric);
    }
  }
  const metrics = [...metricDefinitions.entries()].sort(([left], [right]) => compareText(left, right)).map(([key, definition]) => {
    const availableRecords = records.filter((record) => record.metrics.some((metric) => metric.key === key && metric.value !== null)).length;
    return {
      key,
      availableRecords,
      totalRecords: records.length,
      coverageRatio: records.length === 0 ? 0 : availableRecords / records.length,
      unit: definition.unit,
      type: definition.type,
      definition: definition.definition,
    };
  });
  return {
    playerSeasonRecords: records.length,
    uniquePlayers: new Set(records.map((record) => record.externalPlayerId)).size,
    teams: new Set(records.map((record) => record.teamId)).size,
    matches,
    competitions: [...new Set(records.map((record) => record.competition))].sort(compareText),
    seasons: [...new Set(records.map((record) => record.season))].sort(compareText),
    recordsWithCompleteEvents: records.filter((record) => record.eventDataComplete).length,
    recordsWithEstimatedMinutes: records.filter((record) => record.minutes > 0).length,
    metrics,
  };
}

async function writeSnapshotFile(filePath: string, snapshot: TactiScoutDatasetSnapshot): Promise<void> {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(snapshot, null, 2)}\n`, { flag: "w" });
  try {
    await rename(temporaryPath, filePath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function buildWyscoutDataset(options: BuildWyscoutDatasetOptions): Promise<BuiltWyscoutDataset> {
  const sourceDirectory = path.resolve(options.sourceDirectory);
  const outputDirectory = path.resolve(options.outputDirectory);
  const provenance = await readProvenance(sourceDirectory);
  const inputs = await fingerprintInputs(sourceDirectory);
  const inputDigest = contentDigest({ inputs, provenance });
  const acquiredAt = new Date(`${provenance.retrievedAt}T00:00:00.000Z`);
  const repository = new WyscoutPlayerRepository({
    dataDirectory: sourceDirectory,
    allowHistoricalReport: true,
    now: () => acquiredAt,
  });
  const profiles = (await repository.loadPlayers()).sort((left, right) =>
    compareText(left.season, right.season)
      || compareText(left.competition, right.competition)
      || compareText(left.externalPlayerId ?? left.playerId, right.externalPlayerId ?? right.playerId)
      || compareText(left.playerId, right.playerId));
  if (profiles.length === 0) throw new DatasetBuildError("No player-season records were derived; check the configured competition files.");
  const records = profiles.map(toRecord);
  const matchCount = await countClubMatches(sourceDirectory);
  if (matchCount === 0) throw new DatasetBuildError("No club-competition matches were found in the configured Wyscout files.");
  const datasetId = `tactiscout-wyscout-v${DATASET_SCHEMA_VERSION}-${inputDigest.slice(0, 12)}-${DERIVATION_RULESET}`;
  const snapshot: TactiScoutDatasetSnapshot = {
    schemaVersion: DATASET_SCHEMA_VERSION,
    datasetId,
    builtAt: (options.now ?? (() => new Date()))().toISOString(),
    attribution: "Pappalardo, L. and Massucco, E. (2019). Soccer match event dataset. Scientific Data. https://doi.org/10.1038/s41597-019-0247-7. TactiScout derived indicators; modifications from the source are described in each metric definition.",
    license: { name: provenance.license, url: provenance.licenseUrl },
    upstreamSource: {
      name: provenance.dataset,
      publisher: provenance.publisher,
      paperUrl: SOURCE_PAPER_URL,
      acquiredAt: provenance.retrievedAt,
      scope: provenance.scope,
      items: provenance.items,
    },
    derivation: {
      ruleset: DERIVATION_RULESET,
      description: "TactiScout aggregates event counts and derives progressive-pass and ground-defensive-duel indicators from Wyscout event records. Unsupported fields are omitted; no model-generated metrics are included.",
    },
    inputs,
    coverage: buildCoverage(records, matchCount),
    limitations: [
      "The upstream data is a historical 2017/18 competition sample, not a current player or transfer-market database.",
      "Estimated minutes assume 90-minute regulation appearances and substitution minutes; added time and red-card adjustments are not modeled.",
      "Progressive-pass metrics depend on event coordinates and TactiScout's documented coordinate-distance thresholds.",
      "Ground-defensive-duel outcome rates retain neutral outcomes in the denominator and are not tackle-success rates.",
      "Missing or incomplete source fields are represented as unavailable metrics, not zero-valued performance.",
    ],
    records,
  };
  const outputPath = path.join(outputDirectory, `${datasetId}.json`);
  const latestPath = path.join(outputDirectory, "latest.json");
  await mkdir(outputDirectory, { recursive: true });
  await writeSnapshotFile(outputPath, snapshot);
  await writeSnapshotFile(latestPath, snapshot);
  return { path: outputPath, latestPath, snapshot };
}
