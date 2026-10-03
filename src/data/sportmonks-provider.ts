import {
  PlayerProfileSchema,
  type PlayerProfile,
  type Position,
  type RawStatKey,
} from "../domain/schemas.js";
import type { PlayerRepository } from "./provider.js";

const API_ORIGIN = "https://api.sportmonks.com";
const FOOTBALL_API_PREFIX = "/v3/football";
const TEAM_PAGE_SIZE = 50;
const TEAM_PAGE_LIMIT = 100;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_PARALLEL_TEAM_REQUESTS = 4;

const sportmonksRawStats = [
  "goals",
  "assists",
  "passesAttempted",
  "passesCompleted",
  "longPasses",
  "tackles",
  "interceptions",
] as const satisfies readonly RawStatKey[];

const statisticTypeIds = {
  goals: 52,
  assists: 79,
  passesAttempted: 80,
  passesCompleted: 81,
  accuratePasses: 116,
  longPasses: 122,
  tackles: 78,
  interceptions: 100,
  minutesPlayed: 119,
} as const;

type RecordValue = Record<string, unknown>;

interface SportmonksPayload {
  data: unknown;
  pagination?: unknown;
}

export type SportmonksProviderErrorCode =
  | "invalid_configuration"
  | "authentication"
  | "plan_coverage"
  | "rate_limit"
  | "request_failed"
  | "network"
  | "invalid_response";

export class SportmonksProviderError extends Error {
  constructor(readonly code: SportmonksProviderErrorCode, message: string) {
    super(message);
    this.name = "SportmonksProviderError";
  }
}

export interface SportmonksRepositoryOptions {
  token: string;
  seasonIds: string[];
  coveredStatisticTypeIds: number[];
  allowModelProcessing: boolean;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
  now?: () => Date;
}

interface SeasonInfo {
  id: string;
  name: string;
  competitionId: string;
  competitionName: string;
  isCurrent: boolean;
}

interface TeamInfo {
  id: string;
  name: string;
  type?: string;
}

function asRecord(value: unknown): RecordValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RecordValue
    : undefined;
}

function asArray(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function idString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  return undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isTrue(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function mapPosition(value: unknown): Position | undefined {
  const name = typeof value === "string" ? value.trim().toLowerCase().replaceAll("_", " ").replaceAll("-", " ") : "";
  if (name.includes("goalkeeper") || name === "keeper") return "GK";
  if (name.includes("centre back") || name.includes("center back") || name.includes("centre defender") || name.includes("center defender")) return "CB";
  if (name.includes("left wing back")) return "LWB";
  if (name.includes("right wing back")) return "RWB";
  if (name.includes("left back")) return "LB";
  if (name.includes("right back")) return "RB";
  if (name.includes("defensive midfield") || name.includes("holding midfield")) return "DM";
  if (name.includes("attacking midfield")) return "AM";
  if (name.includes("central midfield") || name.includes("centre midfield") || name.includes("center midfield")) return "CM";
  if (name.includes("centre forward") || name.includes("center forward") || name === "striker") return "ST";
  if (name.includes("left wing") || name.includes("left winger")) return "LW";
  if (name.includes("right wing") || name.includes("right winger")) return "RW";
  if (name === "defender" || name === "defence" || name === "defense") return "DEF";
  if (name === "midfielder" || name === "midfield") return "MID";
  if (name === "attacker" || name === "forward") return "ATT";
  return undefined;
}

function mapBroadPositionId(value: unknown): Position | undefined {
  switch (value) {
    case 24: return "GK";
    case 25: return "DEF";
    case 26: return "MID";
    case 27: return "ATT";
    default: return undefined;
  }
}

function mapSquadPosition(squad: RecordValue, player: RecordValue): Position | undefined {
  const direct = mapPosition(asRecord(squad.detailedPosition)?.name)
    ?? mapPosition(asRecord(squad.position)?.name)
    ?? mapPosition(asRecord(player.detailedPosition)?.name)
    ?? mapPosition(asRecord(player.position)?.name);
  if (direct) return direct;
  return mapBroadPositionId(squad.position_id ?? player.position_id);
}

function parseSeason(payload: SportmonksPayload, requestedId: string): SeasonInfo {
  const season = asRecord(payload.data);
  const id = idString(season?.id);
  const name = nonEmptyString(season?.name);
  const competitionId = idString(season?.league_id);
  const competitionName = nonEmptyString(asRecord(season?.league)?.name);
  if (!season || id !== requestedId || !name || !competitionId || season.is_current === undefined) {
    throw new SportmonksProviderError("invalid_response", `Sportmonks returned incomplete season metadata for season ${requestedId}.`);
  }
  return {
    id,
    name,
    competitionId,
    competitionName: competitionName ?? `Sportmonks league ${competitionId}`,
    isCurrent: isTrue(season.is_current),
  };
}

function parseTeams(payload: SportmonksPayload, seasonId: string, page: number): TeamInfo[] {
  const teams = asArray(payload.data);
  const pagination = asRecord(payload.pagination);
  if (!teams || !pagination || typeof pagination.has_more !== "boolean") {
    throw new SportmonksProviderError("invalid_response", `Sportmonks returned an incomplete team page for season ${seasonId}.`);
  }
  if (pagination.current_page !== undefined && pagination.current_page !== page) {
    throw new SportmonksProviderError("invalid_response", `Sportmonks returned an unexpected page for season ${seasonId}.`);
  }
  return teams.flatMap((value) => {
    const team = asRecord(value);
    const id = idString(team?.id);
    const name = nonEmptyString(team?.name);
    const type = nonEmptyString(team?.type);
    if (!team || !id || !name) {
      throw new SportmonksProviderError("invalid_response", `Sportmonks returned a team without its required identity in season ${seasonId}.`);
    }
    if (type && type !== "domestic") return [];
    return [{ id, name, ...(type ? { type } : {}) }];
  });
}

function numericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const record = asRecord(value);
  if (!record) return undefined;
  for (const key of ["total", "value", "count"]) {
    const numeric = record[key];
    if (typeof numeric === "number" && Number.isFinite(numeric)) return numeric;
  }
  return undefined;
}

function statisticDetails(row: RecordValue | undefined): Map<number, number> | undefined {
  if (!row) return undefined;
  const details = asArray(row.details);
  if (!details) return undefined;
  const stats = new Map<number, number>();
  for (const rawDetail of details) {
    const detail = asRecord(rawDetail);
    const typeId = typeof detail?.type_id === "number" ? detail.type_id : undefined;
    const value = numericValue(detail?.value);
    if (typeId !== undefined && value !== undefined) stats.set(typeId, value);
  }
  return stats;
}

function valueForType(stats: Map<number, number>, coveredTypeIds: Set<number>, typeId: number, fallbackId?: number): number {
  if (coveredTypeIds.has(typeId) && stats.has(typeId)) return stats.get(typeId)!;
  if (fallbackId !== undefined && coveredTypeIds.has(fallbackId) && stats.has(fallbackId)) return stats.get(fallbackId)!;
  return 0;
}

function ageAt(dateOfBirth: string, now: Date): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime()) || birth.toISOString().slice(0, 10) !== dateOfBirth) return null;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const birthdayHasNotPassed = now.getUTCMonth() < birth.getUTCMonth()
    || (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());
  if (birthdayHasNotPassed) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function parseSquadPlayer(
  rawSquad: unknown,
  statsRow: RecordValue | undefined,
  season: SeasonInfo,
  team: TeamInfo,
  retrievedAt: string,
  coveredTypeIds: Set<number>,
): PlayerProfile | undefined {
  const squad = asRecord(rawSquad);
  const player = asRecord(squad?.player);
  if (!squad || !player) {
    throw new SportmonksProviderError("invalid_response", `Sportmonks returned an incomplete squad player for team ${team.id}.`);
  }
  const playerId = idString(squad.player_id ?? player.id);
  const name = nonEmptyString(player.display_name) ?? nonEmptyString(player.name) ?? nonEmptyString(player.common_name);
  const position = mapSquadPosition(squad, player);
  if (!playerId || !name || !position) return undefined;

  const stats = statisticDetails(statsRow);
  const ageText = nonEmptyString(player.date_of_birth);
  const date = new Date(retrievedAt);
  const age = ageText ? ageAt(ageText, date) : null;
  const coveredRawStats = sportmonksRawStats.filter((key) => {
    const typeIds = key === "passesCompleted"
      ? [statisticTypeIds.passesCompleted, statisticTypeIds.accuratePasses]
      : [statisticTypeIds[key as keyof typeof statisticTypeIds]];
    return typeIds.some((typeId) => coveredTypeIds.has(typeId));
  });
  const mappedStats = {
    goals: stats && coveredTypeIds.has(statisticTypeIds.goals) ? valueForType(stats, coveredTypeIds, statisticTypeIds.goals) : 0,
    assists: stats && coveredTypeIds.has(statisticTypeIds.assists) ? valueForType(stats, coveredTypeIds, statisticTypeIds.assists) : 0,
    passesAttempted: stats && coveredTypeIds.has(statisticTypeIds.passesAttempted) ? valueForType(stats, coveredTypeIds, statisticTypeIds.passesAttempted) : 0,
    passesCompleted: stats && (coveredTypeIds.has(statisticTypeIds.passesCompleted) || coveredTypeIds.has(statisticTypeIds.accuratePasses))
      ? valueForType(stats, coveredTypeIds, statisticTypeIds.passesCompleted, statisticTypeIds.accuratePasses) : 0,
    longPasses: stats && coveredTypeIds.has(statisticTypeIds.longPasses) ? valueForType(stats, coveredTypeIds, statisticTypeIds.longPasses) : 0,
    carries: 0,
    pressures: 0,
    tackles: stats && coveredTypeIds.has(statisticTypeIds.tackles) ? valueForType(stats, coveredTypeIds, statisticTypeIds.tackles) : 0,
    interceptions: stats && coveredTypeIds.has(statisticTypeIds.interceptions) ? valueForType(stats, coveredTypeIds, statisticTypeIds.interceptions) : 0,
    shotAssists: 0,
  };
  const minutes = stats && coveredTypeIds.has(statisticTypeIds.minutesPlayed)
    ? valueForType(stats, coveredTypeIds, statisticTypeIds.minutesPlayed)
    : 0;
  const availableStats = stats ? coveredRawStats : [];
  return PlayerProfileSchema.parse({
    playerId: `sportmonks:${playerId}:team:${team.id}:season:${season.id}`,
    externalPlayerId: `sportmonks:${playerId}`,
    name,
    team: team.name,
    age,
    ...(ageText && age !== null ? { ageSource: "Sportmonks date_of_birth", ageVerifiedAt: retrievedAt } : {}),
    position,
    competition: season.competitionName,
    season: season.name,
    minutes,
    stats: mappedStats,
    availableStats,
    sourceIdentity: {
      provider: "sportmonks",
      playerId,
      teamId: team.id,
      competitionId: season.competitionId,
      seasonId: season.id,
      retrievedAt,
      isCurrentSeason: season.isCurrent,
    },
    source: "Sportmonks Football API",
  });
}

function squadRecordIsCurrent(squad: unknown, today: string): boolean {
  const record = asRecord(squad);
  if (!record) return false;
  const start = nonEmptyString(record.start)?.slice(0, 10);
  const end = nonEmptyString(record.end)?.slice(0, 10);
  if (start && /^\d{4}-\d{2}-\d{2}$/.test(start) && start > today) return false;
  if (end && /^\d{4}-\d{2}-\d{2}$/.test(end) && end < today) return false;
  return true;
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

export class SportmonksPlayerRepository implements PlayerRepository {
  readonly mode = "sportmonks" as const;
  readonly sourceName = "Sportmonks Football API";

  private readonly token: string;
  private readonly seasonIds: string[];
  private readonly coveredTypeIds: Set<number>;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;
  private cached?: Promise<PlayerProfile[]>;
  private cacheCreatedAt = 0;

  constructor(options: SportmonksRepositoryOptions) {
    this.token = options.token.trim();
    this.seasonIds = [...new Set(options.seasonIds.map((id) => id.trim()).filter(Boolean))];
    this.coveredTypeIds = new Set(options.coveredStatisticTypeIds);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? (() => new Date());
    if (!this.token) throw new SportmonksProviderError("invalid_configuration", "Sportmonks provider requires a server-side API token.");
    if (this.seasonIds.length === 0 || this.seasonIds.some((id) => !/^\d+$/.test(id))) {
      throw new SportmonksProviderError("invalid_configuration", "Sportmonks provider requires one or more numeric season IDs.");
    }
    const knownTypeIds = new Set<number>(Object.values(statisticTypeIds));
    if (this.coveredTypeIds.size === 0 || [...this.coveredTypeIds].some((id) => !Number.isSafeInteger(id) || !knownTypeIds.has(id))) {
      throw new SportmonksProviderError("invalid_configuration", "Configure only statistic type IDs verified for the Sportmonks account and supported by this adapter.");
    }
    if (!this.coveredTypeIds.has(statisticTypeIds.minutesPlayed)) {
      throw new SportmonksProviderError("invalid_configuration", "Sportmonks player statistics require a confirmed minutes-played field (type ID 119).");
    }
    if (!options.allowModelProcessing) {
      throw new SportmonksProviderError("invalid_configuration", "Sportmonks data is disabled until model-processing permission is confirmed and explicitly enabled.");
    }
    if (!Number.isFinite(this.cacheTtlMs) || this.cacheTtlMs < 0) {
      throw new SportmonksProviderError("invalid_configuration", "Sportmonks cache lifetime must be a non-negative number of milliseconds.");
    }
  }

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    if (refresh) this.cached = undefined;
    const now = this.now().getTime();
    if (this.cached && this.cacheTtlMs > 0 && now - this.cacheCreatedAt < this.cacheTtlMs) return this.cached;
    const pending = this.loadFreshPlayers();
    this.cached = pending;
    this.cacheCreatedAt = now;
    pending.catch(() => {
      if (this.cached === pending) this.cached = undefined;
    });
    return pending;
  }

  private async request(path: string, query: Record<string, string> = {}): Promise<SportmonksPayload> {
    const url = new URL(`${FOOTBALL_API_PREFIX}${path}`, API_ORIGIN);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Authorization: this.token, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new SportmonksProviderError("network", "Sportmonks request failed before a response was received.");
    }
    if (response.status === 401) throw new SportmonksProviderError("authentication", "Sportmonks rejected the configured API token.");
    if (response.status === 403) throw new SportmonksProviderError("plan_coverage", "Sportmonks denied this league or data feed under the configured plan.");
    if (response.status === 429) throw new SportmonksProviderError("rate_limit", "Sportmonks rate limit was reached; try again after its reset window.");
    if (!response.ok) throw new SportmonksProviderError("request_failed", `Sportmonks returned HTTP ${response.status}.`);
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new SportmonksProviderError("invalid_response", "Sportmonks returned invalid JSON.");
    }
    const record = asRecord(payload);
    if (!record || !Object.hasOwn(record, "data")) {
      throw new SportmonksProviderError("invalid_response", "Sportmonks response did not contain a data field.");
    }
    return { data: record.data, ...(Object.hasOwn(record, "pagination") ? { pagination: record.pagination } : {}) };
  }

  private async loadSeasonTeams(seasonId: string): Promise<TeamInfo[]> {
    const allTeams: TeamInfo[] = [];
    for (let page = 1; page <= TEAM_PAGE_LIMIT; page += 1) {
      const payload = await this.request(`/teams/seasons/${seasonId}`, {
        per_page: String(TEAM_PAGE_SIZE),
        page: String(page),
      });
      const teams = parseTeams(payload, seasonId, page);
      allTeams.push(...teams);
      const hasMore = asRecord(payload.pagination)?.has_more;
      if (hasMore === false) return allTeams;
    }
    throw new SportmonksProviderError("invalid_response", `Sportmonks team pagination exceeded the safety limit for season ${seasonId}.`);
  }

  private async loadSeasonInfo(seasonId: string): Promise<SeasonInfo> {
    const payload = await this.request(`/seasons/${seasonId}`, { include: "league" });
    const season = parseSeason(payload, seasonId);
    if (!season.isCurrent) {
      throw new SportmonksProviderError("invalid_configuration", `Sportmonks season ${seasonId} is not marked current; this provider mode only builds a current-season player pool.`);
    }
    return season;
  }

  private async loadTeamPlayers(season: SeasonInfo, team: TeamInfo, retrievedAt: string): Promise<PlayerProfile[]> {
    const [currentSquad, seasonStats] = await Promise.all([
      this.request(`/squads/teams/${team.id}`, { include: "player;position;detailedPosition" }),
      this.request(`/squads/seasons/${season.id}/teams/${team.id}`, { include: "details" }),
    ]);
    const squadRows = asArray(currentSquad.data);
    const statisticRows = asArray(seasonStats.data);
    if (!squadRows || !statisticRows) {
      throw new SportmonksProviderError("invalid_response", `Sportmonks returned a malformed squad for team ${team.id}, season ${season.id}.`);
    }
    const statistics = new Map<string, RecordValue>();
    for (const row of statisticRows) {
      const record = asRecord(row);
      const playerId = idString(record?.player_id);
      if (!record || !playerId) {
        throw new SportmonksProviderError("invalid_response", `Sportmonks returned a season statistic without a player ID for team ${team.id}.`);
      }
      if (statistics.has(playerId)) {
        throw new SportmonksProviderError("invalid_response", `Sportmonks returned duplicate season statistics for player ${playerId} on team ${team.id}.`);
      }
      statistics.set(playerId, record);
    }
    const today = retrievedAt.slice(0, 10);
    const profiles = squadRows.filter((row) => squadRecordIsCurrent(row, today)).flatMap((row) => {
      const squad = asRecord(row);
      const playerId = idString(squad?.player_id);
      if (!playerId) throw new SportmonksProviderError("invalid_response", `Sportmonks returned a squad record without a player ID for team ${team.id}.`);
      const profile = parseSquadPlayer(row, statistics.get(playerId), season, team, retrievedAt, this.coveredTypeIds);
      return profile ? [profile] : [];
    });
    return profiles;
  }

  private async loadFreshPlayers(): Promise<PlayerProfile[]> {
    const retrievedAt = this.now().toISOString();
    const playersById = new Map<string, PlayerProfile>();
    for (const seasonId of this.seasonIds) {
      const season = await this.loadSeasonInfo(seasonId);
      const teams = await this.loadSeasonTeams(season.id);
      const teamPlayers = await mapConcurrent(teams, MAX_PARALLEL_TEAM_REQUESTS, (team) => this.loadTeamPlayers(season, team, retrievedAt));
      for (const player of teamPlayers.flat()) playersById.set(player.playerId, player);
    }
    return [...playersById.values()];
  }
}

export const sportmonksDefaults = {
  cacheTtlMs: DEFAULT_CACHE_TTL_MS,
};
