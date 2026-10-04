import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SupplementaryCapabilityMetricDefinitions,
  PlayerProfileSchema,
  type DatasetMode,
  type DatasetSnapshotStatus,
  type PlayerProfile,
  type Position,
  type Requirements,
  type SupplementaryPerformanceMetric,
} from "../domain/schemas.js";
import { positionMatches } from "../domain/positions.js";
import { normalizeSearchText } from "../domain/text-matching.js";
import { SportmonksPlayerRepository, SportmonksProviderError } from "./sportmonks-provider.js";
import { SkillCornerPlayerRepository } from "./skillcorner-provider.js";
import { WyscoutPlayerRepository } from "./wyscout-provider.js";
import { FbrefPlayerRepository, FbrefProviderError } from "./fbref-provider.js";
import { CuratedDatasetRepository } from "../dataset/curated-repository.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const demoFile = path.join(projectRoot, "data", "demo-players.json");

export interface PlayerRepository {
  readonly mode: DatasetMode;
  readonly sourceName: string;
  getDatasetStatus?(): Promise<DatasetSnapshotStatus>;
  loadPlayers?(refresh?: boolean): Promise<PlayerProfile[]>;
  searchCandidates?(query: PlayerSearchQuery): Promise<PlayerSearchPage>;
  inspectTeam?(teamName: string): Promise<PlayerProfile[]>;
  getPlayersByIds?(playerIds: readonly string[]): Promise<PlayerProfile[]>;
  getComparisonPlayers?(players: readonly PlayerProfile[]): Promise<PlayerProfile[]>;
}

export async function loadAllPlayers(repository: PlayerRepository, refresh = false): Promise<PlayerProfile[]> {
  if (!repository.loadPlayers) {
    throw new Error(`${repository.sourceName} supports scoped queries but does not expose a full-catalog load.`);
  }
  return repository.loadPlayers(refresh);
}

export interface PlayerSearchQuery {
  playerName: string | null;
  position: Position | null;
  maxAge: number | null;
  minimumMinutes: number;
  competition: string | null;
  season: string | null;
  offset: number;
  limit: number;
}

export interface PlayerSearchPage {
  players: PlayerProfile[];
  totalRecords: number | null;
  offset: number;
  nextOffset: number | null;
  appliedFilters: PlayerSearchFilter[];
}

export type PlayerSearchFilter = "playerName" | "position" | "maxAge" | "minimumMinutes" | "competition" | "season";

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
  shotMetricsComplete: boolean;
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
  nonPenaltyXg: number;
  nonPenaltyShots: number;
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

function calculateLineupMinutes(positions: unknown[], matchEndMinute: number): { minutes: number; complete: boolean } {
  if (!positions.length) return { minutes: 0, complete: false };
  let minutes = 0;
  let previousEnd: number | undefined;
  let complete = true;
  for (const rawPosition of positions) {
    const position = asRecord(rawPosition);
    const from = clockMinutes(position.from);
    let to = clockMinutes(position.to);
    if (to === undefined && position.end_reason === "Final Whistle" && matchEndMinute > 0) to = matchEndMinute;
    if (from === undefined || to === undefined || to <= from) {
      complete = false;
      continue;
    }
    if (previousEnd !== undefined && Math.abs(from - previousEnd) > 1 / 60) complete = false;
    minutes += to - from;
    previousEnd = to;
  }
  return { minutes, complete };
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

function getMutable(players: Map<string, MutablePlayer>, key: string, seed: Omit<MutablePlayer, "appearances" | "goals" | "assists" | "passesAttempted" | "passesCompleted" | "longPasses" | "carries" | "pressures" | "tackles" | "interceptions" | "shotAssists" | "keyPasses" | "nonPenaltyXg" | "nonPenaltyShots">): MutablePlayer {
  const existing = players.get(key);
  if (existing) return existing;
  const created: MutablePlayer = {
    ...seed, appearances: new Set(), goals: 0, assists: 0, passesAttempted: 0,
    passesCompleted: 0, longPasses: 0, carries: 0, pressures: 0, tackles: 0,
    interceptions: 0, shotAssists: 0, keyPasses: 0, nonPenaltyXg: 0, nonPenaltyShots: 0,
  };
  players.set(key, created);
  return created;
}

function nonPenaltyShotXg(rawEvent: unknown): number | undefined {
  const event = asRecord(rawEvent);
  if (event.type?.name !== "Shot" || !Number.isInteger(event.period) || event.period < 1 || event.period > 4) return undefined;
  const shot = asRecord(event.shot);
  const shotType = asRecord(shot.type).name;
  const xg = shot.statsbomb_xg;
  if (typeof shotType !== "string" || !shotType.trim() || shotType === "Penalty") return undefined;
  if (typeof xg !== "number" || !Number.isFinite(xg) || xg < 0 || xg > 1) return undefined;
  if (event.player?.id === undefined || event.player?.id === null) return undefined;
  if (typeof event.team?.name !== "string" || !event.team.name.trim()) return undefined;
  return xg;
}

function hasCompleteStatsBombShotQuality(events: unknown[]): boolean {
  return events.every((rawEvent) => {
    const event = asRecord(rawEvent);
    if (event.type?.name !== "Shot") return true;
    const period = event.period;
    if (!Number.isInteger(period) || period < 1 || period > 5) return false;
    if (period === 5) return true;

    const shot = asRecord(event.shot);
    const shotType = asRecord(shot.type).name;
    if (typeof shotType !== "string" || !shotType.trim()) return false;
    if (shotType === "Penalty") return true;
    return nonPenaltyShotXg(rawEvent) !== undefined;
  });
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
  const completeLineupCoverageByScope = new Map<string, boolean>();

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
      const scopeKey = `${compId}:${seasonId}`;
      completeLineupCoverageByScope.set(scopeKey, completeLineupCoverageByScope.get(scopeKey) ?? true);
      const eventFile = eventsById.get(matchId);
      const eventRows = eventFile ? await readJson<unknown>(eventFile).catch(() => undefined) : undefined;
      const eventDataAvailable = Array.isArray(eventRows) && eventRows.length > 0;
      const events = asList(eventRows);
      const shotMetricsComplete = eventDataAvailable && hasCompleteStatsBombShotQuality(events);
      const matchEndMinute = events.reduce((latest, rawEvent) => {
        const event = asRecord(rawEvent);
        const minute = event.minute;
        const second = event.second ?? 0;
        if (!Number.isInteger(event.period) || event.period < 1 || event.period > 4
          || typeof minute !== "number" || typeof second !== "number"
          || !Number.isFinite(minute) || !Number.isFinite(second)) return latest;
        return Math.max(latest, minute + second / 60);
      }, 0);
      const lineupFile = lineupsById.get(matchId);
      let lineups: any[] = [];
      if (lineupFile) lineups = asList(await readJson<unknown>(lineupFile).catch(() => []));
      const lineupFileComplete = lineups.length === 2 && lineups.every((teamLineup) => {
        const lineup = asRecord(teamLineup).lineup;
        return Array.isArray(lineup)
          && lineup.length > 0
          && lineup.every((player) => asRecord(player).player_id !== undefined && asRecord(player).player_id !== null);
      });
      if (!lineupFileComplete) completeLineupCoverageByScope.set(scopeKey, false);
      const lineupPlayerKeys = new Set<string>();
      const playersWithCompleteMinutes = new Set<string>();
      if (lineupFile) {
        for (const teamLineup of lineups) {
          const teamData = asRecord(teamLineup);
          const team = String(teamData.team_name ?? "Unknown team");
          for (const rawPlayer of asList(teamData.lineup)) {
            const player = asRecord(rawPlayer);
            const id = String(player.player_id ?? "");
            const playerName = String(player.player_name ?? "Unknown player");
            const positions = asList(player.positions);
            if (id) lineupPlayerKeys.add(`${id}:${team}`);
            const position = choosePosition(positions);
            if (!id || !position) continue;
            const { minutes, complete: minuteDataComplete } = calculateLineupMinutes(positions, matchEndMinute);
            const teamId = teamData.team_id ?? asRecord(teamData.team).id;
            const recordId = [id, compId, season, team].join(":");
            const item = getMutable(players, recordId, {
              playerId: recordId, sourcePlayerId: id, ...(teamId === undefined ? {} : { sourceTeamId: String(teamId) }),
              competitionId: compId, seasonId, name: playerName, team, position, competition, season, minutes: 0, eventDataComplete: true,
              shotMetricsComplete: true,
            });
            item.eventDataComplete &&= eventDataAvailable;
            item.shotMetricsComplete &&= shotMetricsComplete && minuteDataComplete;
            item.minutes += minutes;
            item.appearances.add(matchId);
            if (minuteDataComplete) playersWithCompleteMinutes.add(`${id}:${team}`);
          }
        }
      }

      if (!eventDataAvailable) continue;
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
          shotMetricsComplete: true,
        });
        const lineupKey = `${id}:${team}`;
        const hasLineupEntry = lineupPlayerKeys.has(lineupKey);
        item.shotMetricsComplete &&= shotMetricsComplete && hasLineupEntry && playersWithCompleteMinutes.has(lineupKey);
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
        if (type === "Shot") {
          if (event.shot?.outcome?.name === "Goal") item.goals += 1;
          const xg = nonPenaltyShotXg(rawEvent);
          if (xg !== undefined && hasLineupEntry && playersWithCompleteMinutes.has(lineupKey)) {
            item.nonPenaltyXg += xg;
            item.nonPenaltyShots += 1;
          }
        }
      }
    }
  }

  return [...players.values()].flatMap((item) => {
    if (!item.playerId || item.minutes <= 0) return [];
    const completeLineupCoverage = completeLineupCoverageByScope.get(`${item.competitionId}:${item.seasonId}`) ?? false;
    const supplementaryMetrics: SupplementaryPerformanceMetric[] = item.shotMetricsComplete && completeLineupCoverage
      ? ([
        ["statsbombNonPenaltyXgPer90", item.nonPenaltyXg * 90 / item.minutes],
        ["statsbombNonPenaltyXgPerShot", item.nonPenaltyShots > 0 ? item.nonPenaltyXg / item.nonPenaltyShots : null],
      ] as const).map(([key, value]) => {
        const definition = SupplementaryCapabilityMetricDefinitions.find((metric) => metric.key === key);
        if (!definition) throw new Error(`Missing supplementary metric definition for ${key}.`);
        return {
          key,
          definition: definition.definition,
          value,
          unit: definition.unit,
          normalization: definition.normalization,
          sourceField: "shot.statsbomb_xg",
          sampleMinutes: item.minutes,
          sampleMatches: item.appearances.size,
          sampleAttempts: item.nonPenaltyShots,
        };
      })
      : [];
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
      ...(supplementaryMetrics.length ? { supplementaryMetrics } : {}),
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

function matchesPlayerSearch(player: PlayerProfile, query: PlayerSearchQuery): boolean {
  if (query.playerName && !normalizeSearchText(player.name).includes(normalizeSearchText(query.playerName))) return false;
  if (query.position && !positionMatches(player.position, query.position)) return false;
  if (player.minutes < query.minimumMinutes) return false;
  if (query.maxAge !== null && (player.age === null || player.age > query.maxAge)) return false;
  if (query.competition && !normalizeSearchText(player.competition).includes(normalizeSearchText(query.competition))) return false;
  if (query.season && !normalizeSearchText(player.season).includes(normalizeSearchText(query.season))) return false;
  return true;
}

function searchLoadedPlayers(players: readonly PlayerProfile[], query: PlayerSearchQuery): PlayerSearchPage {
  const matching = players.filter((player) => matchesPlayerSearch(player, query));
  const page = matching.slice(query.offset, query.offset + query.limit);
  const appliedFilters: PlayerSearchFilter[] = [];
  if (query.playerName) appliedFilters.push("playerName");
  if (query.position) appliedFilters.push("position");
  if (query.maxAge !== null) appliedFilters.push("maxAge");
  if (query.minimumMinutes > 0) appliedFilters.push("minimumMinutes");
  if (query.competition) appliedFilters.push("competition");
  if (query.season) appliedFilters.push("season");
  return {
    players: page,
    totalRecords: matching.length,
    offset: query.offset,
    nextOffset: query.offset + page.length < matching.length ? query.offset + page.length : null,
    appliedFilters,
  };
}

function withLocalQueries(repository: PlayerRepository): PlayerRepository {
  return {
    mode: repository.mode,
    sourceName: repository.sourceName,
    ...(repository.loadPlayers ? { loadPlayers: (refresh?: boolean) => repository.loadPlayers!(refresh) } : {}),
    ...(repository.getDatasetStatus ? { getDatasetStatus: () => repository.getDatasetStatus!() } : {}),
    searchCandidates: async (query) => repository.searchCandidates
      ? repository.searchCandidates(query)
      : searchLoadedPlayers(await loadAllPlayers(repository), query),
    inspectTeam: async (teamName) => {
      if (repository.inspectTeam) return repository.inspectTeam(teamName);
      const key = normalizeSearchText(teamName);
      const players = await loadAllPlayers(repository);
      return players.filter((player) => {
        const team = normalizeSearchText(player.team);
        return team === key || (key.length >= 4 && team.includes(key)) || (team.length >= 4 && key.includes(team));
      });
    },
    getPlayersByIds: async (playerIds) => {
      if (repository.getPlayersByIds) return repository.getPlayersByIds(playerIds);
      const wanted = new Set(playerIds);
      return (await loadAllPlayers(repository)).filter((player) => wanted.has(player.playerId));
    },
    getComparisonPlayers: async (players) => repository.getComparisonPlayers
      ? repository.getComparisonPlayers(players)
      : loadAllPlayers(repository),
  };
}

export async function searchPlayerPage(repository: PlayerRepository, query: PlayerSearchQuery): Promise<PlayerSearchPage> {
  const page = repository.searchCandidates
    ? repository.searchCandidates(query)
    : searchLoadedPlayers(await loadAllPlayers(repository), query);
  const result = await page;
  if (result.offset !== query.offset) {
    throw new Error(`Player source returned offset ${result.offset} for requested offset ${query.offset}.`);
  }
  if (result.players.length > query.limit) {
    throw new Error(`Player source returned ${result.players.length} records for a page limit of ${query.limit}.`);
  }
  if (result.totalRecords !== null && (!Number.isInteger(result.totalRecords) || result.totalRecords < 0)) {
    throw new Error("Player source returned an invalid matching-record count.");
  }
  if (new Set(result.players.map((player) => player.playerId)).size !== result.players.length) {
    throw new Error("Player source returned duplicate player IDs within one candidate page.");
  }
  const requiredFilters: PlayerSearchFilter[] = [];
  if (query.playerName) requiredFilters.push("playerName");
  if (query.position) requiredFilters.push("position");
  if (query.maxAge !== null) requiredFilters.push("maxAge");
  if (query.minimumMinutes > 0) requiredFilters.push("minimumMinutes");
  if (query.competition) requiredFilters.push("competition");
  if (query.season) requiredFilters.push("season");
  const unapplied = requiredFilters.filter((filter) => !result.appliedFilters.includes(filter));
  if (unapplied.length) {
    throw new Error(`Player source could not apply requested search filter${unapplied.length === 1 ? "" : "s"}: ${unapplied.join(", ")}.`);
  }
  if (result.players.some((player) => !matchesPlayerSearch(player, query))) {
    throw new Error("Player source returned a candidate that does not satisfy the requested search filters.");
  }
  const expectedNextOffset = query.offset + result.players.length;
  if (result.nextOffset !== null && (result.players.length === 0 || result.nextOffset !== expectedNextOffset)) {
    throw new Error("Player source returned a non-contiguous candidate-page cursor.");
  }
  if (result.totalRecords !== null && result.players.length > 0) {
    if (result.totalRecords < expectedNextOffset) {
      throw new Error("Player source returned fewer total records than this candidate page contains.");
    }
    const moreRecordsRemain = expectedNextOffset < result.totalRecords;
    if (moreRecordsRemain !== (result.nextOffset !== null)) {
      throw new Error("Player source returned a next-page cursor inconsistent with its matching-record count.");
    }
  }
  return result;
}

export async function inspectTeamPlayers(repository: PlayerRepository, teamName: string): Promise<PlayerProfile[]> {
  if (repository.inspectTeam) return repository.inspectTeam(teamName);
  const key = normalizeSearchText(teamName);
  return (await loadAllPlayers(repository)).filter((player) => {
    const team = normalizeSearchText(player.team);
    return team === key || (key.length >= 4 && team.includes(key)) || (team.length >= 4 && key.includes(team));
  });
}

export async function loadPlayersByIds(repository: PlayerRepository, playerIds: readonly string[]): Promise<PlayerProfile[]> {
  if (repository.getPlayersByIds) return repository.getPlayersByIds(playerIds);
  const wanted = new Set(playerIds);
  return (await loadAllPlayers(repository)).filter((player) => wanted.has(player.playerId));
}

export async function loadComparisonPlayers(repository: PlayerRepository, players: readonly PlayerProfile[]): Promise<PlayerProfile[]> {
  if (players.length === 0) return [];
  return repository.getComparisonPlayers
    ? repository.getComparisonPlayers(players)
    : loadAllPlayers(repository);
}

export function createRepository(): PlayerRepository {
  const mode = (process.env.TACTISCOUT_DATA_MODE ?? "demo").trim().toLowerCase();
  if (mode === "fbref") {
    const cacheLifetimeText = process.env.TACTISCOUT_FBREF_CACHE_TTL_MS;
    const cacheTtlMs = cacheLifetimeText === undefined || cacheLifetimeText.trim() === ""
      ? undefined
      : Number(cacheLifetimeText);
    if (cacheLifetimeText !== undefined && cacheLifetimeText.trim() !== "" && !Number.isFinite(cacheTtlMs)) {
      throw new FbrefProviderError("invalid_configuration", "TACTISCOUT_FBREF_CACHE_TTL_MS must be a non-negative number of milliseconds.");
    }
    return withLocalQueries(new FbrefPlayerRepository({ ...(cacheTtlMs === undefined ? {} : { cacheTtlMs }) }));
  }
  if (mode === "statsbomb") {
    return withLocalQueries(new StatsBombRepository());
  }
  if (mode === "demo") return withLocalQueries(new DemoPlayerRepository());
  if (mode === "sportmonks") {
    const cacheLifetimeText = process.env.TACTISCOUT_SPORTMONKS_CACHE_TTL_MS;
    const cacheTtlMs = cacheLifetimeText === undefined || cacheLifetimeText.trim() === ""
      ? undefined
      : Number(cacheLifetimeText);
    if (cacheLifetimeText !== undefined && cacheLifetimeText.trim() !== "" && !Number.isFinite(cacheTtlMs)) {
      throw new SportmonksProviderError("invalid_configuration", "TACTISCOUT_SPORTMONKS_CACHE_TTL_MS must be a non-negative number of milliseconds.");
    }
    return withLocalQueries(new SportmonksPlayerRepository({
      token: process.env.SPORTMONKS_API_TOKEN ?? "",
      seasonIds: (process.env.TACTISCOUT_SPORTMONKS_SEASON_IDS ?? "").split(","),
      coveredStatisticTypeIds: (process.env.TACTISCOUT_SPORTMONKS_COVERED_STATISTIC_TYPE_IDS ?? "")
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
        .map(Number),
      allowModelProcessing: process.env.TACTISCOUT_SPORTMONKS_AI_PROCESSING_ALLOWED === "true",
      ...(cacheTtlMs === undefined ? {} : { cacheTtlMs }),
    }));
  }
  if (mode === "skillcorner") {
    return withLocalQueries(new SkillCornerPlayerRepository({
      aggregatesDirectory: process.env.TACTISCOUT_SKILLCORNER_AGGREGATES_DIR
        ?? path.join(projectRoot, ".data", "skillcorner-open-data", "aggregates"),
      allowLocalStorage: process.env.TACTISCOUT_SKILLCORNER_LOCAL_STORAGE_ALLOWED === "true",
      allowModelProcessing: process.env.TACTISCOUT_SKILLCORNER_AI_PROCESSING_ALLOWED === "true",
      allowReportDisplay: process.env.TACTISCOUT_SKILLCORNER_REPORT_DISPLAY_ALLOWED === "true",
    }));
  }
  if (mode === "wyscout") {
    return withLocalQueries(new WyscoutPlayerRepository({
      dataDirectory: process.env.TACTISCOUT_WYSCOUT_DIR
        ?? path.join(projectRoot, ".data", "wyscout-open-data"),
      allowModelProcessing: process.env.TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED === "true",
      competitionIds: (process.env.TACTISCOUT_WYSCOUT_COMPETITION_IDS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    }));
  }
  if (mode === "curated") {
    return withLocalQueries(new CuratedDatasetRepository({
      filePath: process.env.TACTISCOUT_DATASET_FILE
        ? path.resolve(process.env.TACTISCOUT_DATASET_FILE)
        : path.join(projectRoot, ".data", "tactiscout-datasets", "latest.json"),
      allowModelProcessing: process.env.TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED === "true",
    }));
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
