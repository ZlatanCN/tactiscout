import { createReadStream } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  SupplementaryCapabilityMetricDefinitions,
  PlayerProfileSchema,
  type PlayerProfile,
  type Position,
  type RawStatKey,
  type SupplementaryMetricKey,
  type SupplementaryPerformanceMetric,
} from "../domain/schemas.js";
import type { PlayerRepository } from "./provider.js";

const DATA_LICENSE = "CC BY 4.0";
const PLAYER_STATS: RawStatKey[] = ["goals", "assists", "passesAttempted", "passesCompleted", "keyPasses"];
const SOURCE_NAME = `Wyscout Open Data · Pappalardo et al. 2019 · doi:10.1038/s41597-019-0247-7 · ${DATA_LICENSE} · historical 2017/18`;

type JsonRecord = Record<string, unknown>;

interface Competition {
  id: string;
  name: string;
  type: string;
}

interface Team {
  id: string;
  name: string;
}

interface Player {
  id: string;
  name: string;
  position: Position;
  birthDate?: string;
}

interface Match {
  id: string;
  competitionId: string;
  competition: string;
  season: string;
  seasonEnd: string;
  date: string;
  teamsData: JsonRecord;
}

interface MutablePlayer {
  player: Player;
  teamId: string;
  team: string;
  competitionId: string;
  competition: string;
  season: string;
  seasonEnd: string;
  minutes: number;
  appearanceMatchIds: Set<string>;
  goals: number;
  assists: number;
  passesAttempted: number;
  passesCompleted: number;
  shotAssists: number;
  keyPasses: number;
  progressivePassDataComplete: boolean;
  progressivePasses: number;
  completedProgressivePasses: number;
  defensiveDuelDataComplete: boolean;
  groundDefensiveDuels: number;
  clearlyWonGroundDefensiveDuels: number;
}

export type WyscoutProviderErrorCode = "invalid_configuration" | "missing_file" | "invalid_json" | "invalid_source_data";

export class WyscoutProviderError extends Error {
  constructor(readonly code: WyscoutProviderErrorCode, message: string) {
    super(message);
    this.name = "WyscoutProviderError";
  }
}

export interface WyscoutRepositoryOptions {
  dataDirectory: string;
  allowModelProcessing?: boolean;
  allowHistoricalReport?: boolean;
  competitionIds?: string[];
  now?: () => Date;
}

function asRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined;
}

function id(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function fieldId(record: JsonRecord, key: string, fileName: string): string {
  const value = id(record[key]);
  if (!value) throw new WyscoutProviderError("invalid_source_data", `${fileName} contains a record without ${key}.`);
  return value;
}

function fieldText(record: JsonRecord, key: string, fileName: string): string {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new WyscoutProviderError("invalid_source_data", `${fileName} contains a record without ${key}.`);
  }
  return value.trim();
}

function nameOfPlayer(record: JsonRecord): string {
  const first = typeof record.firstName === "string" ? record.firstName.trim() : "";
  const last = typeof record.lastName === "string" ? record.lastName.trim() : "";
  const full = [first, last].filter(Boolean).join(" ");
  if (full) return full;
  return typeof record.shortName2 === "string" && record.shortName2.trim() ? record.shortName2.trim() : "Unknown player";
}

function mapPosition(record: JsonRecord): Position {
  const role = asRecord(record.role);
  const name = typeof role?.name === "string" ? role.name.trim().toLowerCase() : "";
  if (name.includes("goalkeeper")) return "GK";
  if (name.includes("defender")) return "DEF";
  if (name.includes("midfielder")) return "MID";
  if (name.includes("forward") || name.includes("attacker")) return "ATT";
  throw new WyscoutProviderError("invalid_source_data", `Unsupported Wyscout player role: ${name || "missing"}.`);
}

function parseDate(value: unknown, fileName: string): Date {
  if (typeof value !== "string" || !value.trim()) {
    throw new WyscoutProviderError("invalid_source_data", `${fileName} contains a match without dateutc.`);
  }
  const normalized = value.trim().includes("T") ? value.trim() : `${value.trim().replace(" ", "T")}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) throw new WyscoutProviderError("invalid_source_data", `${fileName} contains an invalid dateutc.`);
  return date;
}

function seasonAt(date: Date): { label: string; endDate: string } {
  const startYear = date.getUTCMonth() >= 6 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  const endYear = startYear + 1;
  return { label: `${startYear}/${String(endYear).slice(-2)}`, endDate: `${endYear}-06-30` };
}

function ageAt(birthDate: string | undefined, atDate: string): number | null {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const birth = new Date(`${birthDate}T00:00:00.000Z`);
  const at = new Date(`${atDate}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== birthDate || Number.isNaN(at.getTime())) return null;
  let age = at.getUTCFullYear() - birth.getUTCFullYear();
  if (at.getUTCMonth() < birth.getUTCMonth() || (at.getUTCMonth() === birth.getUTCMonth() && at.getUTCDate() < birth.getUTCDate())) age -= 1;
  return age < 0 ? null : age;
}

function requiredArray(value: unknown, fileName: string): JsonRecord[] {
  if (!Array.isArray(value)) throw new WyscoutProviderError("invalid_json", `${fileName} must contain a JSON array.`);
  return value.map((item, index) => {
    const record = asRecord(item);
    if (!record) throw new WyscoutProviderError("invalid_json", `${fileName} row ${index + 1} must be a JSON object.`);
    return record;
  });
}

async function readJsonArrayFile(filePath: string): Promise<JsonRecord[]> {
  const fileName = path.basename(filePath);
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WyscoutProviderError("missing_file", `Wyscout data file ${fileName} is missing from the configured directory.`);
    }
    throw error;
  }
  try {
    return requiredArray(JSON.parse(text) as unknown, fileName);
  } catch (error) {
    if (error instanceof WyscoutProviderError) throw error;
    throw new WyscoutProviderError("invalid_json", `Wyscout data file ${fileName} is not valid JSON.`);
  }
}

async function* streamJsonObjectArray(filePath: string): AsyncGenerator<JsonRecord> {
  const fileName = path.basename(filePath);
  let mode: "start" | "value" | "object" | "separator" | "done" = "start";
  let text = "";
  let depth = 0;
  let inString = false;
  let escaped = false;
  let trailingComma = false;

  try {
    const stream = createReadStream(filePath, { encoding: "utf8" });
    for await (const chunk of stream) {
      for (const character of chunk as string) {
        if (mode === "done") {
          if (!/\s/.test(character)) throw new WyscoutProviderError("invalid_json", `${fileName} has content after its JSON array.`);
          continue;
        }
        if (mode === "start") {
          if (/\s/.test(character)) continue;
          if (character !== "[") throw new WyscoutProviderError("invalid_json", `${fileName} must contain a top-level JSON array.`);
          mode = "value";
          continue;
        }
        if (mode === "value") {
          if (/\s/.test(character)) continue;
          if (character === "]" && !trailingComma) {
            mode = "done";
            continue;
          }
          if (character !== "{") throw new WyscoutProviderError("invalid_json", `${fileName} must contain only JSON objects in its top-level array.`);
          text = character;
          depth = 1;
          inString = false;
          escaped = false;
          trailingComma = false;
          mode = "object";
          continue;
        }
        if (mode === "object") {
          text += character;
          if (inString) {
            if (escaped) escaped = false;
            else if (character === "\\") escaped = true;
            else if (character === '"') inString = false;
          } else if (character === '"') inString = true;
          else if (character === "{") depth += 1;
          else if (character === "}") depth -= 1;
          if (depth === 0) {
            let record: unknown;
            try {
              record = JSON.parse(text) as unknown;
            } catch {
              throw new WyscoutProviderError("invalid_json", `${fileName} contains an invalid event object.`);
            }
            const value = asRecord(record);
            if (!value) throw new WyscoutProviderError("invalid_json", `${fileName} contains a non-object event.`);
            yield value;
            text = "";
            mode = "separator";
          }
          continue;
        }
        if (mode === "separator") {
          if (/\s/.test(character)) continue;
          if (character === ",") {
            mode = "value";
            trailingComma = true;
          } else if (character === "]") {
            mode = "done";
          } else {
            throw new WyscoutProviderError("invalid_json", `${fileName} is missing a comma between events.`);
          }
        }
      }
    }
  } catch (error) {
    if (error instanceof WyscoutProviderError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WyscoutProviderError("missing_file", `Wyscout event file ${fileName} is missing from the configured directory.`);
    }
    throw new WyscoutProviderError("invalid_json", `Wyscout event file ${fileName} could not be read.`);
  }
  if (mode !== "done") throw new WyscoutProviderError("invalid_json", `Wyscout event file ${fileName} ends before its JSON array is complete.`);
}

async function matchingFiles(directory: string, prefix: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new WyscoutProviderError("missing_file", `Wyscout data directory ${directory} does not exist.`);
    }
    throw error;
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().startsWith(prefix.toLowerCase()) && entry.name.toLowerCase().endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

function suffixOf(filePath: string, prefix: "matches" | "events"): string {
  const base = path.basename(filePath, ".json");
  return base.slice(prefix.length).replace(/^[_-]/, "").toLowerCase();
}

function matchFromRecord(record: JsonRecord, competition: Competition, fileName: string): Match {
  const recordCompetitionId = fieldId(record, "competitionId", fileName);
  const date = parseDate(record.dateutc, fileName);
  const season = seasonAt(date);
  const teamsData = asRecord(record.teamsData);
  if (!teamsData) throw new WyscoutProviderError("invalid_source_data", `${fileName} match has no teamsData object.`);
  return {
    id: fieldId(record, "wyId", fileName),
    competitionId: recordCompetitionId,
    competition: competition.name,
    season: season.label,
    seasonEnd: season.endDate,
    date: date.toISOString(),
    teamsData,
  };
}

function nestedPlayerId(value: unknown): string | undefined {
  const direct = id(value);
  if (direct) return direct;
  const record = asRecord(value);
  return id(record?.playerId) ?? id(record?.id) ?? id(record?.wyId);
}

function substitutionMinute(record: JsonRecord, fileName: string): number {
  const raw = record.minute;
  let value = typeof raw === "number" ? raw : Number.NaN;
  if (typeof raw === "string" && raw.trim()) {
    const minuteParts = /^(\d{1,3})(?:\+(\d{1,2}))?$/.exec(raw.trim());
    if (minuteParts) value = Number(minuteParts[1]) + Number(minuteParts[2] ?? 0);
  }
  if (!Number.isFinite(value) || value < 0 || value > 120) {
    throw new WyscoutProviderError("invalid_source_data", `${fileName} contains a substitution with an invalid minute.`);
  }
  // Preserve a 90-minute sample clock. Stoppage and extra-time exposure is outside this estimate.
  return Math.min(value, 90);
}

function playerRecordKey(playerId: string, teamId: string, competitionId: string, season: string): string {
  return `${playerId}:${teamId}:${competitionId}:${season}`;
}

function addMutablePlayer(
  players: Map<string, MutablePlayer>,
  player: Player,
  teamId: string,
  team: string,
  match: Match,
): MutablePlayer {
  const key = playerRecordKey(player.id, teamId, match.competitionId, match.season);
  const existing = players.get(key);
  if (existing) return existing;
  const value: MutablePlayer = {
    player,
    teamId,
    team,
    competitionId: match.competitionId,
    competition: match.competition,
    season: match.season,
    seasonEnd: match.seasonEnd,
    minutes: 0,
    appearanceMatchIds: new Set(),
    goals: 0,
    assists: 0,
    passesAttempted: 0,
    passesCompleted: 0,
    shotAssists: 0,
    keyPasses: 0,
    progressivePassDataComplete: true,
    progressivePasses: 0,
    completedProgressivePasses: 0,
    defensiveDuelDataComplete: true,
    groundDefensiveDuels: 0,
    clearlyWonGroundDefensiveDuels: 0,
  };
  players.set(key, value);
  return value;
}

function addLineupAndSubstitutions(
  players: Map<string, MutablePlayer>,
  teamData: JsonRecord,
  match: Match,
  teamId: string,
  teamName: string,
  playerById: Map<string, Player>,
  fileName: string,
): void {
  const formation = asRecord(teamData.formation);
  const lineupData = formation?.lineup ?? teamData.lineup;
  if (!Array.isArray(lineupData)) {
    if (teamData.hasFormation === 0) return;
    throw new WyscoutProviderError("invalid_source_data", `${fileName} team data has no lineup array.`);
  }
  const lineup = requiredArray(lineupData, fileName);
  const substitutionsData = formation?.substitutions ?? teamData.substitutions ?? [];
  const substitutions = requiredArray(substitutionsData === "null" ? [] : substitutionsData, fileName);
  const minutesByPlayer = new Map<string, number>();
  for (const item of lineup) {
    const playerId = fieldId(item, "playerId", fileName);
    minutesByPlayer.set(playerId, 90);
  }
  for (const substitution of substitutions) {
    const minute = substitutionMinute(substitution, fileName);
    const incomingId = nestedPlayerId(substitution.playerIn);
    const outgoingId = nestedPlayerId(substitution.playerOut);
    if (!outgoingId || !incomingId || outgoingId === "0") throw new WyscoutProviderError("invalid_source_data", `${fileName} contains a substitution without both player IDs.`);
    if (!minutesByPlayer.has(outgoingId)) throw new WyscoutProviderError("invalid_source_data", `${fileName} substitution references a player outside the starting lineup.`);
    minutesByPlayer.set(outgoingId, Math.min(minutesByPlayer.get(outgoingId)!, minute));
    if (incomingId === "0") continue;
    if (minutesByPlayer.has(incomingId)) throw new WyscoutProviderError("invalid_source_data", `${fileName} substitution incoming player is already on the pitch.`);
    minutesByPlayer.set(incomingId, 90 - minute);
  }
  for (const [playerId, minutes] of minutesByPlayer) {
    const player = playerById.get(playerId);
    if (!player) throw new WyscoutProviderError("invalid_source_data", `${fileName} references unknown player ID ${playerId}.`);
    const profile = addMutablePlayer(players, player, teamId, teamName, match);
    profile.minutes += minutes;
    if (minutes > 0) profile.appearanceMatchIds.add(match.id);
  }
}

function tagsOf(event: JsonRecord): Set<string> {
  if (!Array.isArray(event.tags)) return new Set();
  return new Set(event.tags.flatMap((value) => {
    const tag = asRecord(value);
    const tagId = id(tag?.id);
    return tagId ? [tagId] : [];
  }));
}

function passProgression(startX: number, endX: number): boolean {
  const advancedMeters = (endX - startX) * 1.05;
  if (advancedMeters <= 0) return false;

  const startsInOwnHalf = startX < 50;
  const endsInOwnHalf = endX < 50;
  const thresholdMeters = startsInOwnHalf && endsInOwnHalf
    ? 30
    : startsInOwnHalf !== endsInOwnHalf
      ? 15
      : 10;
  return advancedMeters >= thresholdMeters;
}

function passCoordinates(event: JsonRecord): { startX: number; endX: number } | undefined {
  if (!Array.isArray(event.positions) || event.positions.length < 2) return undefined;
  const start = asRecord(event.positions[0]);
  const end = asRecord(event.positions[1]);
  const startX = start?.x;
  const endX = end?.x;
  if (typeof startX !== "number" || typeof endX !== "number") return undefined;
  if (!Number.isFinite(startX) || !Number.isFinite(endX) || startX < 0 || startX > 100 || endX < 0 || endX > 100) return undefined;
  return { startX, endX };
}

function supplementaryMetric(
  profile: MutablePlayer,
  key: SupplementaryMetricKey,
  value: number | null,
  sourceField: string,
): SupplementaryPerformanceMetric {
  const definition = SupplementaryCapabilityMetricDefinitions.find((metric) => metric.key === key);
  if (!definition) throw new Error(`Missing supplementary metric definition for ${key}.`);
  return {
    key,
    definition: definition.definition,
    value,
    unit: definition.unit,
    normalization: definition.normalization,
    sourceField,
    sampleMinutes: profile.minutes,
    sampleMatches: profile.appearanceMatchIds.size,
  };
}

function applyEvent(
  event: JsonRecord,
  matchById: Map<string, Match>,
  matchEventIds: Set<string>,
  teamById: Map<string, Team>,
  playerById: Map<string, Player>,
  playerByKey: Map<string, MutablePlayer>,
  fileName: string,
): void {
  const matchId = fieldId(event, "matchId", fileName);
  const match = matchById.get(matchId);
  if (!match) return;
  matchEventIds.add(matchId);
  const playerId = id(event.playerId);
  if (!playerId || playerId === "0") return;
  const player = playerById.get(playerId);
  if (!player) throw new WyscoutProviderError("invalid_source_data", `${fileName} event references unknown player ID ${playerId}.`);
  const teamId = fieldId(event, "teamId", fileName);
  const team = teamById.get(teamId);
  if (!team) throw new WyscoutProviderError("invalid_source_data", `${fileName} event references unknown team ID ${teamId}.`);
  const teamParticipated = Object.entries(match.teamsData).some(([teamKey, rawTeam]) => {
    const teamData = asRecord(rawTeam);
    return (id(teamData?.teamId) ?? teamKey) === teamId;
  });
  if (!teamParticipated) {
    throw new WyscoutProviderError("invalid_source_data", `${fileName} event references team ID ${teamId}, which did not participate in match ${matchId}.`);
  }
  const profile = addMutablePlayer(playerByKey, player, teamId, team.name, match);
  const eventName = typeof event.eventName === "string" ? event.eventName.trim().toLowerCase() : "";
  const subEventName = typeof event.subEventName === "string" ? event.subEventName.trim().toLowerCase() : "";
  const tagIds = tagsOf(event);
  if (eventName === "pass") {
    profile.passesAttempted += 1;
    if (tagIds.has("1801")) profile.passesCompleted += 1;
    const coordinates = passCoordinates(event);
    const completed = tagIds.has("1801");
    const failed = tagIds.has("1802");
    if (!coordinates || completed === failed) {
      profile.progressivePassDataComplete = false;
    } else if (passProgression(coordinates.startX, coordinates.endX)) {
      profile.progressivePasses += 1;
      if (completed) profile.completedProgressivePasses += 1;
    }
  }
  if (eventName === "duel" && subEventName === "ground defending duel") {
    const outcomeCount = ["701", "702", "703"].filter((outcome) => tagIds.has(outcome)).length;
    if (outcomeCount !== 1) {
      profile.defensiveDuelDataComplete = false;
    } else {
      profile.groundDefensiveDuels += 1;
      if (tagIds.has("703")) profile.clearlyWonGroundDefensiveDuels += 1;
    }
  }
  if (tagIds.has("301")) profile.assists += 1;
  if (tagIds.has("302")) profile.keyPasses += 1;
  if (eventName === "shot" && tagIds.has("101")) profile.goals += 1;
}

function buildPlayer(profile: MutablePlayer, retrievedAt: string, matchEventIds: Set<string>): PlayerProfile | undefined {
  if (profile.minutes <= 0) return undefined;
  const eventDataComplete = [...profile.appearanceMatchIds].every((matchId) => matchEventIds.has(matchId));
  const age = ageAt(profile.player.birthDate, profile.seasonEnd);
  const supplementaryMetrics: SupplementaryPerformanceMetric[] = [
    ...(eventDataComplete && profile.progressivePassDataComplete ? [
      supplementaryMetric(
        profile,
        "wyscoutProgressivePassesPer90",
        profile.progressivePasses / profile.minutes * 90,
        "positions[0].x → positions[1].x + tags 1801/1802；100 坐标点按 105 米换算（TactiScout 派生估计）",
      ),
      supplementaryMetric(
        profile,
        "wyscoutAccurateProgressivePassesPct",
        profile.progressivePasses === 0
          ? null
          : profile.completedProgressivePasses / profile.progressivePasses * 100,
        "渐进传球推算事件中统计 tag 1801；tag 1802 作为未完成（TactiScout 派生估计）",
      ),
    ] : []),
    ...(eventDataComplete && profile.defensiveDuelDataComplete ? [
      supplementaryMetric(
        profile,
        "wyscoutGroundDefensiveDuelsPer90",
        profile.groundDefensiveDuels / profile.minutes * 90,
        "eventName=Duel + subEventName=Ground defending duel；tags 701/702/703",
      ),
      supplementaryMetric(
        profile,
        "wyscoutClearlyWonGroundDefensiveDuelPct",
        profile.groundDefensiveDuels === 0
          ? null
          : profile.clearlyWonGroundDefensiveDuels / profile.groundDefensiveDuels * 100,
        "Ground defending duel outcome tags；703 / (701 + 702 + 703)，含中性 702",
      ),
    ] : []),
  ];
  return PlayerProfileSchema.parse({
    playerId: `wyscout:${profile.player.id}:team:${profile.teamId}:competition:${profile.competitionId}:season:${profile.season}`,
    externalPlayerId: profile.player.id,
    name: profile.player.name,
    team: profile.team,
    age,
    ...(age === null ? {} : {
      ageSource: `Wyscout Open Data player birthDate (age at ${profile.seasonEnd})`,
      ageVerifiedAt: profile.seasonEnd,
    }),
    position: profile.player.position,
    competition: profile.competition,
    season: profile.season,
    minutes: profile.minutes,
    appearanceMatchCount: profile.appearanceMatchIds.size,
    stats: {
      goals: profile.goals,
      assists: profile.assists,
      passesAttempted: profile.passesAttempted,
      passesCompleted: profile.passesCompleted,
      longPasses: 0,
      carries: 0,
      pressures: 0,
      tackles: 0,
      interceptions: 0,
      shotAssists: profile.shotAssists,
      keyPasses: profile.keyPasses,
    },
    availableStats: eventDataComplete ? PLAYER_STATS : [],
    ...(supplementaryMetrics.length ? { supplementaryMetrics } : {}),
    eventDataComplete,
    sourceIdentity: {
      provider: "wyscout-open-data",
      playerId: profile.player.id,
      teamId: profile.teamId,
      competitionId: profile.competitionId,
      seasonId: profile.season,
      retrievedAt,
      isCurrentSeason: false,
    },
    source: SOURCE_NAME,
  });
}

export class WyscoutPlayerRepository implements PlayerRepository {
  readonly mode = "wyscout" as const;
  readonly sourceName = SOURCE_NAME;

  private readonly dataDirectory: string;
  private readonly competitionIds: Set<string>;
  private readonly now: () => Date;
  private cached?: Promise<PlayerProfile[]>;

  constructor(options: WyscoutRepositoryOptions) {
    if (!options.allowModelProcessing && !options.allowHistoricalReport) {
      throw new WyscoutProviderError("invalid_configuration", "Wyscout mode is disabled until model processing or historical report use is explicitly enabled.");
    }
    this.dataDirectory = path.resolve(options.dataDirectory);
    this.competitionIds = new Set((options.competitionIds ?? []).map((value) => value.trim()).filter(Boolean));
    this.now = options.now ?? (() => new Date());
  }

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    if (refresh) this.cached = undefined;
    this.cached ??= this.loadFiles();
    return this.cached;
  }

  private async loadFiles(): Promise<PlayerProfile[]> {
    const [competitionRows, teamRows, playerRows, matchFiles, eventFiles] = await Promise.all([
      readJsonArrayFile(path.join(this.dataDirectory, "competitions.json")),
      readJsonArrayFile(path.join(this.dataDirectory, "teams.json")),
      readJsonArrayFile(path.join(this.dataDirectory, "players.json")),
      matchingFiles(this.dataDirectory, "matches"),
      matchingFiles(this.dataDirectory, "events"),
    ]);
    if (matchFiles.length === 0) throw new WyscoutProviderError("missing_file", "Wyscout matches_*.json files are missing from the configured directory.");
    if (eventFiles.length === 0) throw new WyscoutProviderError("missing_file", "Wyscout events_*.json files are missing from the configured directory.");

    const competitions = new Map<string, Competition>();
    for (const row of competitionRows) {
      const item = {
        id: fieldId(row, "wyId", "competitions.json"),
        name: fieldText(row, "name", "competitions.json"),
        type: typeof row.type === "string" ? row.type.toLowerCase() : "",
      };
      if (item.type === "club") competitions.set(item.id, item);
    }
    const selectedCompetitionIds = this.competitionIds.size
      ? this.competitionIds
      : new Set(competitions.keys());
    const teamById = new Map<string, Team>(teamRows.map((row) => {
      const team = { id: fieldId(row, "wyId", "teams.json"), name: fieldText(row, "name", "teams.json") };
      return [team.id, team];
    }));
    const playerById = new Map<string, Player>(playerRows.map((row) => {
      const player = {
        id: fieldId(row, "wyId", "players.json"),
        name: nameOfPlayer(row),
        position: mapPosition(row),
        ...(typeof row.birthDate === "string" ? { birthDate: row.birthDate } : {}),
      };
      return [player.id, player];
    }));

    const matches = new Map<string, Match>();
    const matchFileSuffixes = new Set<string>();
    const players = new Map<string, MutablePlayer>();
    const matchEventIds = new Set<string>();
    for (const filePath of matchFiles) {
      const fileName = path.basename(filePath);
      const suffix = suffixOf(filePath, "matches");
      const rows = await readJsonArrayFile(filePath);
      for (const row of rows) {
        const competitionId = fieldId(row, "competitionId", fileName);
        const competition = competitions.get(competitionId);
        if (!competition || !selectedCompetitionIds.has(competitionId)) continue;
        const match = matchFromRecord(row, competition, fileName);
        matches.set(match.id, match);
        matchFileSuffixes.add(suffix);
        for (const [teamKey, rawTeam] of Object.entries(match.teamsData)) {
          const teamData = asRecord(rawTeam);
          if (!teamData) throw new WyscoutProviderError("invalid_source_data", `${fileName} contains invalid team data.`);
          const teamId = id(teamData.teamId) ?? teamKey;
          const team = teamById.get(teamId);
          if (!team) throw new WyscoutProviderError("invalid_source_data", `${fileName} references unknown team ID ${teamId}.`);
          addLineupAndSubstitutions(players, teamData, match, teamId, team.name, playerById, fileName);
        }
      }
    }
    if (matches.size === 0) return [];

    const eventSuffixes = new Set(eventFiles.map((filePath) => suffixOf(filePath, "events")));
    if (!eventSuffixes.has("") && ![...matchFileSuffixes].every((suffix) => eventSuffixes.has(suffix))) {
      throw new WyscoutProviderError("missing_file", "Wyscout data is missing an events file for a selected matches file.");
    }
    for (const filePath of eventFiles) {
      const fileName = path.basename(filePath);
      const suffix = suffixOf(filePath, "events");
      if (suffix && !matchFileSuffixes.has(suffix)) continue;
      for await (const event of streamJsonObjectArray(filePath)) {
        applyEvent(event, matches, matchEventIds, teamById, playerById, players, fileName);
      }
    }

    const retrievedAt = this.now().toISOString();
    return [...players.values()].flatMap((player) => {
      const built = buildPlayer(player, retrievedAt, matchEventIds);
      return built ? [built] : [];
    });
  }
}
