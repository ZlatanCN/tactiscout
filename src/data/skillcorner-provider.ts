import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  PlayerProfileSchema,
  SupplementaryCapabilityMetricDefinitions,
  type PlayerProfile,
  type Position,
  type SupplementaryMetricKey,
} from "../domain/schemas.js";
import type { PlayerRepository } from "./provider.js";

const aggregateFiles = {
  physical: "aus1league_physicalaggregates_20242025.csv",
  passing: "aus1league_passingaggregates_20242025.csv",
  offBallRuns: "aus1league_obraggregates_20242025.csv",
} as const;

type AggregateKind = keyof typeof aggregateFiles;
type CsvRow = Record<string, string>;

interface PlayerIdentity {
  playerId: string;
  teamId: string;
  competitionId: string;
  seasonId: string;
  name: string;
  team: string;
  competition: string;
  season: string;
  positionGroup: string;
  birthdate?: string;
}

interface AggregateBundle {
  identity: PlayerIdentity;
  physical?: CsvRow;
  passing?: CsvRow;
  offBallRuns?: CsvRow;
}

export type SkillCornerProviderErrorCode = "invalid_configuration" | "missing_file" | "invalid_csv" | "incompatible_rows";

export class SkillCornerProviderError extends Error {
  constructor(readonly code: SkillCornerProviderErrorCode, message: string) {
    super(message);
    this.name = "SkillCornerProviderError";
  }
}

export interface SkillCornerRepositoryOptions {
  aggregatesDirectory: string;
  allowLocalStorage: boolean;
  allowModelProcessing: boolean;
  allowReportDisplay: boolean;
  now?: () => Date;
}

function parseCsv(content: string, fileName: string): CsvRow[] {
  content = content.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let quoteClosed = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index]!;
    if (quoted) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
        quoteClosed = true;
      } else {
        field += character;
      }
      continue;
    }
    if (quoteClosed) {
      if (character === ",") {
        row.push(field);
        field = "";
        quoteClosed = false;
      } else if (character === "\n" || character === "\r") {
        if (character === "\r" && content[index + 1] === "\n") index += 1;
        row.push(field);
        field = "";
        if (row.some((cell) => cell.length > 0)) rows.push(row);
        row = [];
        quoteClosed = false;
      } else if (character !== " " && character !== "\t") {
        throw new SkillCornerProviderError("invalid_csv", `${fileName} contains characters after a quoted field.`);
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      quoted = true;
    } else if (character === '"') {
      throw new SkillCornerProviderError("invalid_csv", `${fileName} contains an unexpected quote in an unquoted field.`);
    } else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
    } else {
      field += character;
    }
  }
  if (quoted) throw new SkillCornerProviderError("invalid_csv", `${fileName} contains an unterminated quoted field.`);
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...records] = rows;
  if (!header?.length || header.some((name) => name.trim().length === 0) || new Set(header).size !== header.length) {
    throw new SkillCornerProviderError("invalid_csv", `${fileName} has an empty or duplicate CSV header.`);
  }
  return records.map((cells, rowIndex) => {
    if (cells.length !== header.length) {
      throw new SkillCornerProviderError("invalid_csv", `${fileName} row ${rowIndex + 2} has ${cells.length} columns; expected ${header.length}.`);
    }
    return Object.fromEntries(header.map((name, index) => [name, cells[index]!.trim()]));
  });
}

function required(row: CsvRow, field: string, fileName: string): string {
  const value = row[field];
  if (!value) throw new SkillCornerProviderError("invalid_csv", `${fileName} is missing required field ${field}.`);
  return value;
}

function number(row: CsvRow | undefined, field: string, fileName: string): number | null {
  if (!row) return null;
  const raw = row[field];
  if (raw === undefined) throw new SkillCornerProviderError("invalid_csv", `${fileName} is missing metric field ${field}.`);
  if (raw === "") return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new SkillCornerProviderError("invalid_csv", `${fileName} contains a non-numeric value for ${field}.`);
  return parsed;
}

function identity(row: CsvRow, fileName: string): PlayerIdentity {
  return {
    playerId: required(row, "player_id", fileName),
    teamId: required(row, "team_id", fileName),
    competitionId: required(row, "competition_id", fileName),
    seasonId: required(row, "season_id", fileName),
    name: required(row, "player_name", fileName),
    team: required(row, "team_name", fileName),
    competition: required(row, "competition_name", fileName),
    season: required(row, "season_name", fileName),
    positionGroup: required(row, "position_group", fileName),
    ...(row.player_birthdate ? { birthdate: row.player_birthdate } : {}),
  };
}

function identityKey(value: PlayerIdentity): string {
  return [value.playerId, value.teamId, value.competitionId, value.seasonId, value.positionGroup].join(":");
}

function assertCompatible(left: PlayerIdentity, right: PlayerIdentity, fileName: string): void {
  if (left.playerId !== right.playerId || left.teamId !== right.teamId || left.competitionId !== right.competitionId
    || left.seasonId !== right.seasonId || left.positionGroup !== right.positionGroup
    || left.name !== right.name || left.team !== right.team || left.competition !== right.competition || left.season !== right.season) {
    throw new SkillCornerProviderError("incompatible_rows", `${fileName} has conflicting identity or season metadata for one provider record.`);
  }
}

function mapPositionGroup(value: string): Position {
  switch (value.trim().toLowerCase()) {
    case "goalkeeper": return "GK";
    case "central defender": return "CB";
    case "full back":
    case "wing back": return "DEF";
    case "midfield": return "MID";
    case "wide attacker": return "ATT";
    case "center forward":
    case "centre forward": return "ST";
    default: throw new SkillCornerProviderError("invalid_csv", `Unsupported SkillCorner position group: ${value}.`);
  }
}

function ageAt(birthdate: string | undefined, at: Date): number | null {
  if (!birthdate || !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) return null;
  const parsed = new Date(`${birthdate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== birthdate) return null;
  let age = at.getUTCFullYear() - parsed.getUTCFullYear();
  const birthdayHasPassed = at.getUTCMonth() > parsed.getUTCMonth()
    || (at.getUTCMonth() === parsed.getUTCMonth() && at.getUTCDate() >= parsed.getUTCDate());
  if (!birthdayHasPassed) age -= 1;
  return age < 0 ? null : age;
}

function rounded(value: number | null, multiplier: number, divisor = 1): number | null {
  if (value === null || divisor <= 0) return null;
  return Math.round(value * multiplier / divisor * 100) / 100;
}

function sampleContext(row: CsvRow | undefined, kind: AggregateKind): { minutes: number | null; matches: number | null } {
  if (!row) return { minutes: null, matches: null };
  const fileName = aggregateFiles[kind];
  const averageMinutes = number(row, kind === "physical" ? "minutes_full_all" : "minutes", fileName);
  const matchCountField = kind === "physical" ? "count_match" : "performance_included_count";
  const matchesValue = number(row, matchCountField, fileName);
  const matches = matchesValue === null ? null : Math.max(0, Math.trunc(matchesValue));
  return {
    minutes: averageMinutes === null || matches === null ? null : Math.round(averageMinutes * matches * 100) / 100,
    matches,
  };
}

function supplementaryMetrics(bundle: AggregateBundle): PlayerProfile["supplementaryMetrics"] {
  const { physical, passing, offBallRuns } = bundle;
  const physicalFile = aggregateFiles.physical;
  const passingFile = aggregateFiles.passing;
  const offBallRunsFile = aggregateFiles.offBallRuns;
  const physicalMinutes = number(physical, "minutes_full_all", physicalFile);
  const physicalSample = sampleContext(physical, "physical");
  const passingSample = sampleContext(passing, "passing");
  const offBallSample = sampleContext(offBallRuns, "offBallRuns");
  const item = (key: SupplementaryMetricKey, sourceField: string, value: number | null, sample: { minutes: number | null; matches: number | null }) => {
    const definition = SupplementaryCapabilityMetricDefinitions.find((candidate) => candidate.key === key);
    if (!definition) throw new SkillCornerProviderError("invalid_configuration", `No metric definition is registered for ${key}.`);
    return {
      key,
      definition: definition.definition,
      sourceField,
      unit: definition.unit,
      normalization: definition.normalization,
      value,
      sampleMinutes: sample.minutes,
      sampleMatches: sample.matches,
    };
  };
  return [
    item("highIntensityDistancePer90", "hi_distance_full_all", rounded(number(physical, "hi_distance_full_all", physicalFile), 90, physicalMinutes ?? 0), physicalSample),
    item("sprintDistancePer90", "sprint_distance_full_all", rounded(number(physical, "sprint_distance_full_all", physicalFile), 90, physicalMinutes ?? 0), physicalSample),
    item("highIntensityActionsPer90", "hi_count_full_all", rounded(number(physical, "hi_count_full_all", physicalFile), 90, physicalMinutes ?? 0), physicalSample),
    item("behindRunsPer30Tip", "behindrun_count_p30tip", number(offBallRuns, "behindrun_count_p30tip", offBallRunsFile), offBallSample),
    item("overlapRunsPer30Tip", "overlaprun_count_p30tip", number(offBallRuns, "overlaprun_count_p30tip", offBallRunsFile), offBallSample),
    item("lineBreakPassesCompletedPer30Tip", "pass_count_linebreak_completed_p30tip", number(passing, "pass_count_linebreak_completed_p30tip", passingFile), passingSample),
    item("passesToRunsCompletionPct", "pass_pct_torun_completed", number(passing, "pass_pct_torun_completed", passingFile), passingSample),
  ];
}

function buildPlayer(bundle: AggregateBundle, retrievedAt: string, now: Date): PlayerProfile {
  const { identity: item } = bundle;
  const baseMinutes = sampleContext(bundle.physical, "physical").minutes
    ?? sampleContext(bundle.passing, "passing").minutes
    ?? sampleContext(bundle.offBallRuns, "offBallRuns").minutes
    ?? 0;
  const sourceRecordId = [item.playerId, item.teamId, item.competitionId, item.seasonId, item.positionGroup].join(":");
  const age = ageAt(item.birthdate, now);
  return PlayerProfileSchema.parse({
    playerId: `skillcorner:${sourceRecordId}`,
    externalPlayerId: item.playerId,
    name: item.name,
    team: item.team,
    age,
    ...(age === null ? {} : { ageSource: "SkillCorner Open Data player_birthdate", ageVerifiedAt: now.toISOString().slice(0, 10) }),
    position: mapPositionGroup(item.positionGroup),
    competition: item.competition,
    season: item.season,
    minutes: baseMinutes,
    stats: {
      goals: 0,
      assists: 0,
      passesAttempted: 0,
      passesCompleted: 0,
      longPasses: 0,
      carries: 0,
      pressures: 0,
      tackles: 0,
      interceptions: 0,
      shotAssists: 0,
      keyPasses: 0,
    },
    availableStats: [],
    supplementaryMetrics: supplementaryMetrics(bundle),
    sourceIdentity: {
      provider: "skillcorner-open-data",
      playerId: item.playerId,
      teamId: item.teamId,
      competitionId: item.competitionId,
      seasonId: item.seasonId,
      positionGroup: item.positionGroup,
      retrievedAt,
      isCurrentSeason: false,
    },
    source: "SkillCorner Open Data (A-League 2024/25)",
  });
}

export class SkillCornerPlayerRepository implements PlayerRepository {
  readonly mode = "skillcorner" as const;
  readonly sourceName = "SkillCorner Open Data (A-League 2024/25)";

  private readonly aggregatesDirectory: string;
  private readonly now: () => Date;
  private cached?: Promise<PlayerProfile[]>;

  constructor(options: SkillCornerRepositoryOptions) {
    if (!options.allowLocalStorage) {
      throw new SkillCornerProviderError("invalid_configuration", "SkillCorner mode is disabled until local-storage permission is confirmed and explicitly enabled.");
    }
    if (!options.allowModelProcessing) {
      throw new SkillCornerProviderError("invalid_configuration", "SkillCorner mode is disabled until model-processing permission is confirmed and explicitly enabled.");
    }
    if (!options.allowReportDisplay) {
      throw new SkillCornerProviderError("invalid_configuration", "SkillCorner mode is disabled until report-display permission is confirmed and explicitly enabled.");
    }
    this.aggregatesDirectory = path.resolve(options.aggregatesDirectory);
    this.now = options.now ?? (() => new Date());
  }

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    if (refresh) this.cached = undefined;
    this.cached ??= this.loadFiles();
    return this.cached;
  }

  private async loadCsv(kind: AggregateKind): Promise<CsvRow[]> {
    const fileName = aggregateFiles[kind];
    let content: string;
    try {
      content = await readFile(path.join(this.aggregatesDirectory, fileName), "utf8");
    } catch {
      throw new SkillCornerProviderError("missing_file", `SkillCorner aggregate file ${fileName} is missing from the configured local directory.`);
    }
    return parseCsv(content, fileName);
  }

  private async loadFiles(): Promise<PlayerProfile[]> {
    const bundles = new Map<string, AggregateBundle>();
    const rowsByKind = await Promise.all((Object.keys(aggregateFiles) as AggregateKind[]).map(async (kind) => [kind, await this.loadCsv(kind)] as const));
    for (const [kind, rows] of rowsByKind) {
      const fileName = aggregateFiles[kind];
      for (const row of rows) {
        const playerIdentity = identity(row, fileName);
        const key = identityKey(playerIdentity);
        const existing = bundles.get(key);
        if (existing) {
          assertCompatible(existing.identity, playerIdentity, fileName);
          if (existing[kind]) throw new SkillCornerProviderError("incompatible_rows", `${fileName} contains duplicate rows for the same provider player/team/season/position record.`);
          existing[kind] = row;
        } else {
          bundles.set(key, { identity: playerIdentity, [kind]: row });
        }
      }
    }
    const now = this.now();
    const retrievedAt = now.toISOString();
    return [...bundles.values()].map((bundle) => buildPlayer(bundle, retrievedAt, now));
  }
}
