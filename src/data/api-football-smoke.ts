type JsonRecord = Record<string, unknown>;

export interface ApiFootballSmokeOptions {
  apiKey: string;
  leagueId: number;
  season: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface ApiFootballFieldCoverage {
  field: string;
  playersWithValue: number;
  playersOnPage: number;
}

export interface ApiFootballSmokeResult {
  checkedAt: string;
  plan: string | null;
  remainingRequestsToday: number | null;
  league: {
    id: number;
    name: string | null;
    season: number;
    current: boolean | null;
    playersCovered: boolean | null;
    fixturePlayerStatisticsCovered: boolean | null;
  };
  outcome: "season_or_league_unavailable" | "player_statistics_unavailable" | "page_received" | "empty_page";
  firstPage: {
    page: number | null;
    totalPages: number | null;
    returnedPlayers: number;
    playersWithStatistics: number;
    fieldCoverage: ApiFootballFieldCoverage[];
  } | null;
}

export class ApiFootballSmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiFootballSmokeError";
  }
}

interface ApiResponse {
  body: JsonRecord;
  remainingRequestsToday: number | null;
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayOfRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasProviderErrors(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  return value !== undefined && value !== null && value !== false && value !== "";
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getRemainingQuota(headers: Headers): number | null {
  return numberValue(headers.get("x-ratelimit-requests-remaining"));
}

function getRemainingQuotaFromStatus(response: JsonRecord): number | null {
  const requests = isRecord(response.requests) ? response.requests : {};
  const dailyLimit = numberValue(requests.limit_day);
  const usedToday = numberValue(requests.current);
  return dailyLimit !== null && usedToday !== null ? Math.max(0, dailyLimit - usedToday) : null;
}

async function requestApi(
  path: string,
  options: Required<Pick<ApiFootballSmokeOptions, "apiKey" | "requestTimeoutMs" | "fetchImpl">>,
): Promise<ApiResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.requestTimeoutMs);
  try {
    const response = await options.fetchImpl(`https://v3.football.api-sports.io${path}`, {
      headers: { "x-apisports-key": options.apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      const problem = response.status === 401 || response.status === 403
        ? "API-Football rejected the key or account access."
        : response.status === 429
          ? "API-Football quota or rate limit was reached. No request was retried."
          : `API-Football returned HTTP ${response.status}.`;
      throw new ApiFootballSmokeError(problem);
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiFootballSmokeError("API-Football returned invalid JSON.");
    }
    if (!isRecord(body) || hasProviderErrors(body.errors) || !("response" in body)) {
      throw new ApiFootballSmokeError("API-Football reported an API error or an unsupported response shape.");
    }
    return { body, remainingRequestsToday: getRemainingQuota(response.headers) };
  } catch (error) {
    if (error instanceof ApiFootballSmokeError) throw error;
    if (controller.signal.aborted) throw new ApiFootballSmokeError("API-Football request timed out.");
    throw new ApiFootballSmokeError("API-Football could not be reached.");
  } finally {
    clearTimeout(timeout);
  }
}

function seasonRecordForLeague(response: unknown, leagueId: number, season: number): { league: JsonRecord; season: JsonRecord } | null {
  for (const item of arrayOfRecords(response)) {
    const league = isRecord(item.league) ? item.league : null;
    if (numberValue(league?.id) !== leagueId) continue;
    const seasonItem = arrayOfRecords(item.seasons).find((candidate) => numberValue(candidate.year) === season);
    if (league && seasonItem) return { league, season: seasonItem };
  }
  return null;
}

function collectFieldCoverage(players: JsonRecord[]): { fields: ApiFootballFieldCoverage[]; playersWithStatistics: number } {
  const counts = new Map<string, number>();
  let playersWithStatistics = 0;
  for (const player of players) {
    const metricFields = new Set<string>();
    for (const statistics of arrayOfRecords(player.statistics)) {
      for (const [group, value] of Object.entries(statistics)) {
        if (group === "league" || group === "team") continue;
        addPresentFields(value, group, metricFields);
      }
    }
    if (metricFields.size > 0) playersWithStatistics += 1;
    for (const field of metricFields) counts.set(field, (counts.get(field) ?? 0) + 1);
  }
  return {
    fields: [...counts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([field, playersWithValue]) => ({ field, playersWithValue, playersOnPage: players.length })),
    playersWithStatistics,
  };
}

function addPresentFields(value: unknown, prefix: string, fields: Set<string>): void {
  if (!isRecord(value)) {
    if (value !== null && value !== undefined) fields.add(prefix);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    const path = `${prefix}.${key}`;
    if (isRecord(child)) addPresentFields(child, path, fields);
    else if (child !== null && child !== undefined) fields.add(path);
  }
}

export async function runApiFootballSmoke(options: ApiFootballSmokeOptions): Promise<ApiFootballSmokeResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new ApiFootballSmokeError("Set API_FOOTBALL_API_KEY locally before running this smoke.");
  if (!Number.isSafeInteger(options.leagueId) || options.leagueId < 1) {
    throw new ApiFootballSmokeError("League ID must be a positive integer.");
  }
  if (!Number.isSafeInteger(options.season) || options.season < 1900 || options.season > 9999) {
    throw new ApiFootballSmokeError("Season must be a four-digit year.");
  }
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  if (!Number.isSafeInteger(requestTimeoutMs) || requestTimeoutMs < 1) {
    throw new ApiFootballSmokeError("Request timeout must be a positive number of milliseconds.");
  }
  const common = {
    apiKey,
    requestTimeoutMs,
    fetchImpl: options.fetchImpl ?? fetch,
  };
  const status = await requestApi("/status", common);
  let remainingRequestsToday = status.remainingRequestsToday;
  const statusResponse = isRecord(status.body.response) ? status.body.response : {};
  remainingRequestsToday ??= getRemainingQuotaFromStatus(statusResponse);
  const subscription = isRecord(statusResponse.subscription) ? statusResponse.subscription : {};
  const plan = stringValue(subscription.plan);

  const leagueQuery = new URLSearchParams({ id: String(options.leagueId), season: String(options.season) });
  const leagueResponse = await requestApi(`/leagues?${leagueQuery}`, common);
  remainingRequestsToday = leagueResponse.remainingRequestsToday ?? remainingRequestsToday;
  const selected = seasonRecordForLeague(leagueResponse.body.response, options.leagueId, options.season);
  const now = (options.now ?? (() => new Date()))().toISOString();
  const base: Omit<ApiFootballSmokeResult, "outcome" | "firstPage"> = {
    checkedAt: now,
    plan,
    remainingRequestsToday,
    league: {
      id: options.leagueId,
      name: stringValue(selected?.league.name),
      season: options.season,
      current: typeof selected?.season.current === "boolean" ? selected.season.current : null,
      playersCovered: typeof selected?.season.coverage === "object"
        && selected.season.coverage !== null
        && "players" in selected.season.coverage
        ? selected.season.coverage.players === true
        : null,
      fixturePlayerStatisticsCovered: (() => {
        const coverage = isRecord(selected?.season.coverage) ? selected.season.coverage : {};
        const fixtures = isRecord(coverage.fixtures) ? coverage.fixtures : {};
        return typeof fixtures.statistics_players === "boolean" ? fixtures.statistics_players : null;
      })(),
    },
  };

  if (!selected) return { ...base, outcome: "season_or_league_unavailable", firstPage: null };
  if (base.league.playersCovered !== true) {
    return { ...base, outcome: "player_statistics_unavailable", firstPage: null };
  }

  const playersQuery = new URLSearchParams({
    league: String(options.leagueId),
    season: String(options.season),
    page: "1",
  });
  const playersResponse = await requestApi(`/players?${playersQuery}`, common);
  remainingRequestsToday = playersResponse.remainingRequestsToday ?? remainingRequestsToday;
  const returnedPlayers = arrayOfRecords(playersResponse.body.response);
  const paging = isRecord(playersResponse.body.paging) ? playersResponse.body.paging : {};
  const { fields: fieldCoverage, playersWithStatistics } = collectFieldCoverage(returnedPlayers);
  const result: ApiFootballSmokeResult["firstPage"] = {
    page: numberValue(paging.current),
    totalPages: numberValue(paging.total),
    returnedPlayers: returnedPlayers.length,
    playersWithStatistics,
    fieldCoverage,
  };
  return {
    ...base,
    remainingRequestsToday,
    outcome: returnedPlayers.length > 0 ? "page_received" : "empty_page",
    firstPage: result,
  };
}
