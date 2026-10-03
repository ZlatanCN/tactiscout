import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PlayerProfileSchema,
  type DatasetMode,
  type PlayerProfile,
  type Position,
  type Requirements,
} from "../domain/schemas.js";
import { positionMatches } from "../domain/positions.js";
import { SportmonksPlayerRepository, SportmonksProviderError } from "./sportmonks-provider.js";
import { SkillCornerPlayerRepository } from "./skillcorner-provider.js";
import { WyscoutPlayerRepository } from "./wyscout-provider.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const demoFile = path.join(projectRoot, "data", "demo-players.json");

export interface PlayerRepository {
  readonly mode: DatasetMode;
  readonly sourceName: string;
  loadPlayers(refresh?: boolean): Promise<PlayerProfile[]>;
}

interface DemoDataset {
  source: string;
  players: Array<Omit<PlayerProfile, "source">>;
}

interface MutablePlayer {
  playerId: string;
  sourcePlayerId: string;
  sourceTeamId?: string;
  competitionId: string;
  seasonId: string;
  name: string;
  team: string;
  position: Position;
  competition: string;
  season: string;
  minutes: number;
  eventDataComplete: boolean;
  appearances: Set<string>;
  goals: number;
  assists: number;
  passesAttempted: number;
  passesCompleted: number;
  longPasses: number;
  carries: number;
  pressures: number;
  tackles: number;
  interceptions: number;
  shotAssists: number;
  keyPasses: number;
}

interface DemographicEntry {
  age?: number;
  dateOfBirth?: string;
  source?: string;
  verifiedAt?: string;
}

function dataRoot(): string {
  const configured = process.env.TACTISCOUT_STATSBOMB_DIR;
  if (!configured) return path.join(projectRoot, "data", "statsbomb-open-data", "data");
  const resolved = path.resolve(configured);
  return path.basename(resolved) === "data" ? resolved : path.join(resolved, "data");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function walkJsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return walkJsonFiles(fullPath);
    return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
  }));
  return nested.flat();
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" ? value as Record<string, any> : {};
}

function asList(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function clockMinutes(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parts = value.split(":");
  if (parts.length === 3) {
    return Number(parts[0]) * 60 + Number(parts[1]) + Number(parts[2]) / 60;
  }
  if (parts.length === 2) return Number(parts[0]) + Number(parts[1]) / 60;
  return undefined;
}

function mapPosition(value: unknown): Position | undefined {
  const name = typeof value === "string" ? value.toLowerCase() : "";
  if (name.includes("goalkeeper")) return "GK";
  if (name.includes("centre back") || name.includes("center back") || name.includes("center centre back") || name.includes("defensive centre back")) return "CB";
  if (name.includes("left back")) return "LB";
  if (name.includes("right back")) return "RB";
  if (name.includes("left wing back")) return "LWB";
  if (name.includes("right wing back")) return "RWB";
  if (name.includes("defensive midfield") || name.includes("holding midfield")) return "DM";
  if (name.includes("attacking midfield")) return "AM";
  if (name.includes("central midfield") || name.includes("centre midfield") || name.includes("center midfield")) return "CM";
  if (name.includes("centre forward") || name.includes("center forward") || name.includes("striker")) return "ST";
  if (name.includes("left wing") || name.includes("left winger")) return "LW";
  if (name.includes("right wing") || name.includes("right winger")) return "RW";
  if (name.includes("defender")) return "DEF";
  if (name.includes("attacker") || name === "forward") return "ATT";
  if (name.includes("midfield")) return "MID";
  return undefined;
}

function choosePosition(positions: unknown[]): Position | undefined {
  const counts = new Map<Position, number>();
  for (const raw of positions) {
    const entry = asRecord(raw);
    const position = mapPosition(asRecord(entry.position).name ?? entry.position);
    if (position) counts.set(position, (counts.get(position) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function fileIndex(files: string[]): Map<string, string> {
  return new Map(files.map((file) => [path.basename(file, ".json"), file]));
}

async function loadDemographics(): Promise<Map<string, { age: number; source?: string; verifiedAt?: string }>> {
  const file = process.env.TACTISCOUT_DEMOGRAPHICS_FILE;
  if (!file) return new Map();
  try {
    const raw = await readJson<Record<string, DemographicEntry | number>>(path.resolve(file));
    return new Map(Object.entries(raw).flatMap(([id, value]) => {
      const entry = typeof value === "number" ? { age: value } : value;
      let age = entry.age;
      if (age === undefined && entry.dateOfBirth) {
        const birth = new Date(entry.dateOfBirth);
        if (!Number.isNaN(birth.getTime())) {
          const now = new Date();
          age = now.getFullYear() - birth.getFullYear();
          if (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate())) age -= 1;
        }
      }
      return age === undefined ? [] : [[id, { age, source: entry.source, verifiedAt: entry.verifiedAt }] as const];
    }));
  } catch {
    return new Map();
  }
}

function matchRows(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  const record = asRecord(value);
  if (record.match_id !== undefined) return [record];
  return Array.isArray(record.matches) ? record.matches : [];
}

function getMutable(players: Map<string, MutablePlayer>, key: string, seed: Omit<MutablePlayer, "appearances" | "goals" | "assists" | "passesAttempted" | "passesCompleted" | "longPasses" | "carries" | "pressures" | "tackles" | "interceptions" | "shotAssists" | "keyPasses">): MutablePlayer {
  const existing = players.get(key);
  if (existing) return existing;
  const created: MutablePlayer = {
    ...seed, appearances: new Set(), goals: 0, assists: 0, passesAttempted: 0,
    passesCompleted: 0, longPasses: 0, carries: 0, pressures: 0, tackles: 0,
    interceptions: 0, shotAssists: 0, keyPasses: 0,
  };
  players.set(key, created);
  return created;
}

async function loadStatsBombPlayers(): Promise<PlayerProfile[]> {
  const root = dataRoot();
  const retrievedAt = new Date().toISOString();
  const [matchFiles, eventFiles, lineupFiles, demographics] = await Promise.all([
    walkJsonFiles(path.join(root, "matches")),
    walkJsonFiles(path.join(root, "events")),
    walkJsonFiles(path.join(root, "lineups")),
    loadDemographics(),
  ]);
  const eventsById = fileIndex(eventFiles);
  const lineupsById = fileIndex(lineupFiles);
  const competitions = await readJson<any[]>(path.join(root, "competitions.json")).catch(() => []);
  const competitionNames = new Map(asList(competitions).map((item) => [String(item.competition_id), String(item.competition_name ?? "StatsBomb Open Data")]));
  const selectedCompetitions = new Set((process.env.TACTISCOUT_STATSBOMB_COMPETITION_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  const selectedSeasons = new Set((process.env.TACTISCOUT_STATSBOMB_SEASON_IDS ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  const players = new Map<string, MutablePlayer>();

  for (const matchFile of matchFiles) {
    const matches = matchRows(await readJson<unknown>(matchFile).catch(() => null));
    const relativeParts = path.relative(path.join(root, "matches"), matchFile).split(path.sep);
    for (const match of matches) {
      const matchId = String(match.match_id ?? path.basename(matchFile, ".json"));
      const compId = String(match.competition?.competition_id ?? match.competition_id ?? relativeParts[0] ?? "");
      const seasonFallback = relativeParts.length >= 3 ? relativeParts[1] : path.basename(matchFile, ".json");
      const seasonId = String(match.season?.season_id ?? match.season_id ?? seasonFallback ?? "");
      const season = String(match.season?.season_name ?? seasonId ?? "unknown");
      const competition = String(match.competition?.competition_name ?? competitionNames.get(compId) ?? "StatsBomb Open Data");
      if (selectedCompetitions.size && !selectedCompetitions.has(compId)) continue;
      if (selectedSeasons.size && !selectedSeasons.has(seasonId)) continue;
      const eventFile = eventsById.get(matchId);
      const eventRows = eventFile ? await readJson<unknown>(eventFile).catch(() => undefined) : undefined;
      const eventDataAvailable = Array.isArray(eventRows) && eventRows.length > 0;
      const lineupFile = lineupsById.get(matchId);
      if (lineupFile) {
        const lineups = asList(await readJson<unknown>(lineupFile).catch(() => []));
        for (const teamLineup of lineups) {
          const teamData = asRecord(teamLineup);
          const team = String(teamData.team_name ?? "Unknown team");
          for (const rawPlayer of asList(teamData.lineup)) {
            const player = asRecord(rawPlayer);
            const id = String(player.player_id ?? "");
            const playerName = String(player.player_name ?? "Unknown player");
            const positions = asList(player.positions);
            const position = choosePosition(positions);
            if (!id || !position) continue;
            let minutes = 0;
            for (const stint of positions) {
              const segment = asRecord(stint);
              const from = clockMinutes(segment.from) ?? 0;
              const to = clockMinutes(segment.to);
              if (to !== undefined && to > from) minutes += to - from;
            }
            const teamId = teamData.team_id ?? asRecord(teamData.team).id;
            const recordId = [id, compId, season, team].join(":");
            const item = getMutable(players, recordId, {
              playerId: recordId, sourcePlayerId: id, ...(teamId === undefined ? {} : { sourceTeamId: String(teamId) }),
              competitionId: compId, seasonId, name: playerName, team, position, competition, season, minutes: 0, eventDataComplete: true,
            });
            item.eventDataComplete &&= eventDataAvailable;
            item.minutes += minutes;
            item.appearances.add(matchId);
          }
        }
      }

      if (!eventDataAvailable) continue;
      const events = asList(eventRows);
      for (const rawEvent of events) {
        const event = asRecord(rawEvent);
        const playerId = event.player?.id ?? event.player_id;
        if (playerId === undefined || playerId === null) continue;
        const id = String(playerId);
        const team = String(event.team?.name ?? "Unknown team");
        const playerName = String(event.player?.name ?? "Unknown player");
        const position = mapPosition(event.position?.name) ?? "CM";
        const recordId = [id, compId, season, team].join(":");
        const item = getMutable(players, recordId, {
          playerId: recordId, sourcePlayerId: id, competitionId: compId, seasonId, name: playerName, team, position, competition, season, minutes: 0, eventDataComplete: true,
        });
        const type = String(event.type?.name ?? "");
        const pass = asRecord(event.pass);
        if (type === "Pass") {
          item.passesAttempted += 1;
          if (!pass.outcome) item.passesCompleted += 1;
          if (Number(pass.length) >= 30) item.longPasses += 1;
          if (pass.shot_assist || pass.goal_assist) item.shotAssists += 1;
          if (pass.goal_assist) item.assists += 1;
        }
        if (type === "Carry") item.carries += 1;
        if (type === "Pressure") item.pressures += 1;
        if (type === "Duel" && event.duel?.type?.name === "Tackle") item.tackles += 1;
        if (type === "Interception") item.interceptions += 1;
        if (type === "Shot" && event.shot?.outcome?.name === "Goal") item.goals += 1;
      }
    }
  }

  return [...players.values()].flatMap((item) => {
    if (!item.playerId || item.minutes <= 0) return [];
    return [PlayerProfileSchema.parse({
      ...item,
      externalPlayerId: item.sourcePlayerId,
      age: demographics.get(item.sourcePlayerId)?.age ?? null,
      ageSource: demographics.get(item.sourcePlayerId)?.source,
      ageVerifiedAt: demographics.get(item.sourcePlayerId)?.verifiedAt,
      sourceIdentity: {
        provider: "statsbomb-open-data",
        playerId: item.sourcePlayerId,
        ...(item.sourceTeamId ? { teamId: item.sourceTeamId } : {}),
        competitionId: item.competitionId,
        seasonId: item.seasonId,
        retrievedAt,
      },
      stats: {
        goals: item.goals, assists: item.assists, passesAttempted: item.passesAttempted,
        passesCompleted: item.passesCompleted, longPasses: item.longPasses, carries: item.carries,
        pressures: item.pressures, tackles: item.tackles, interceptions: item.interceptions,
        shotAssists: item.shotAssists, keyPasses: item.keyPasses,
      },
      availableStats: ["goals", "assists", "passesAttempted", "passesCompleted", "longPasses", "carries", "pressures", "tackles", "interceptions", "shotAssists"],
      eventDataComplete: item.eventDataComplete,
      source: "StatsBomb Open Data",
    })];
  });
}

export class DemoPlayerRepository implements PlayerRepository {
  readonly mode = "demo" as const;
  readonly sourceName = "Fictional TactiScout demo data";
  private cached?: Promise<PlayerProfile[]>;

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    if (refresh) this.cached = undefined;
    this.cached ??= readJson<DemoDataset>(demoFile).then((dataset) => dataset.players.map((player) => ({ ...player, source: dataset.source })));
    return this.cached;
  }
}

export class StatsBombRepository implements PlayerRepository {
  readonly mode = "statsbomb" as const;
  readonly sourceName = "StatsBomb Open Data";
  private cached?: Promise<PlayerProfile[]>;

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    if (refresh) this.cached = undefined;
    this.cached ??= loadStatsBombPlayers();
    return this.cached;
  }
}

export function createRepository(): PlayerRepository {
  const mode = (process.env.TACTISCOUT_DATA_MODE ?? "demo").trim().toLowerCase();
  if (mode === "statsbomb") return new StatsBombRepository();
  if (mode === "demo") return new DemoPlayerRepository();
  if (mode === "sportmonks") {
    const cacheLifetimeText = process.env.TACTISCOUT_SPORTMONKS_CACHE_TTL_MS;
    const cacheTtlMs = cacheLifetimeText === undefined || cacheLifetimeText.trim() === ""
      ? undefined
      : Number(cacheLifetimeText);
    if (cacheLifetimeText !== undefined && cacheLifetimeText.trim() !== "" && !Number.isFinite(cacheTtlMs)) {
      throw new SportmonksProviderError("invalid_configuration", "TACTISCOUT_SPORTMONKS_CACHE_TTL_MS must be a non-negative number of milliseconds.");
    }
    return new SportmonksPlayerRepository({
      token: process.env.SPORTMONKS_API_TOKEN ?? "",
      seasonIds: (process.env.TACTISCOUT_SPORTMONKS_SEASON_IDS ?? "").split(","),
      coveredStatisticTypeIds: (process.env.TACTISCOUT_SPORTMONKS_COVERED_STATISTIC_TYPE_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map(Number),
      allowModelProcessing: process.env.TACTISCOUT_SPORTMONKS_AI_PROCESSING_ALLOWED === "true",
      ...(cacheTtlMs === undefined ? {} : { cacheTtlMs }),
    });
  }
  if (mode === "skillcorner") {
    return new SkillCornerPlayerRepository({
      aggregatesDirectory: process.env.TACTISCOUT_SKILLCORNER_AGGREGATES_DIR
        ?? path.join(projectRoot, ".data", "skillcorner-open-data", "aggregates"),
      allowLocalStorage: process.env.TACTISCOUT_SKILLCORNER_LOCAL_STORAGE_ALLOWED === "true",
      allowModelProcessing: process.env.TACTISCOUT_SKILLCORNER_AI_PROCESSING_ALLOWED === "true",
      allowReportDisplay: process.env.TACTISCOUT_SKILLCORNER_REPORT_DISPLAY_ALLOWED === "true",
    });
  }
  if (mode === "wyscout") {
    return new WyscoutPlayerRepository({
      dataDirectory: process.env.TACTISCOUT_WYSCOUT_DIR
        ?? path.join(projectRoot, ".data", "wyscout-open-data"),
      allowModelProcessing: process.env.TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED === "true",
      competitionIds: (process.env.TACTISCOUT_WYSCOUT_COMPETITION_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    });
  }
  throw new SportmonksProviderError("invalid_configuration", `Unknown TACTISCOUT_DATA_MODE: ${mode}.`);
}

export function filterEligiblePlayers(players: PlayerProfile[], input: Pick<Requirements, "position" | "maxAge" | "includeUnknownAge">): PlayerProfile[] {
  return players.filter((player) => {
    if (player.eventDataComplete === false) return false;
    if (input.position && !positionMatches(player.position, input.position)) return false;
    if (input.maxAge !== undefined) {
      if (player.age === null && !input.includeUnknownAge) return false;
      if (player.age !== null && player.age > input.maxAge) return false;
    }
    return true;
  });
}
