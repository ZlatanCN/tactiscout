import { z } from "zod/v4";

const baseUrl = "https://data-api.playerelo.football";

const idSchema = z.union([z.string().min(1), z.number().int()]).transform(String);
const nullableTextSchema = z.string().nullable().optional();
const nullableNumberSchema = z.number().finite().nullable().optional();
const nullableIdSchema = idSchema.nullable().optional();

const playerSummarySchema = z.object({
  player_id: idSchema,
  player_name: z.string().min(1),
  elo: z.number().finite(),
  position: nullableTextSchema,
  position_group: nullableTextSchema,
  current_team: nullableTextSchema,
  current_team_id: nullableIdSchema,
  current_league: nullableTextSchema,
  current_league_id: nullableIdSchema,
  ear_label: nullableTextSchema,
});

const playerRecordSchema = playerSummarySchema.extend({
  player_type: nullableTextSchema,
  current_rank: z.number().int().nullable().optional(),
  games_played: z.number().int().nonnegative().nullable().optional(),
  total_minutes: z.number().finite().nonnegative().nullable().optional(),
  ear_career: nullableNumberSchema,
  ear_label_12m: nullableTextSchema,
  ear_12m: nullableNumberSchema,
  ear_label_180: nullableTextSchema,
  ear_180: nullableNumberSchema,
});

const historyItemSchema = z.object({
  date: z.string().min(1),
  elo: z.number().finite(),
  ear: nullableNumberSchema,
});

export type PlayerEloPlayerSummary = z.infer<typeof playerSummarySchema>;
export type PlayerEloPlayerRecord = z.infer<typeof playerRecordSchema> & { retrievedAt: string };
export type PlayerEloHistoryItem = z.infer<typeof historyItemSchema>;

export type PlayerEloClientErrorCode =
  | "invalid_configuration"
  | "permission_required"
  | "authentication"
  | "not_found"
  | "rate_limit"
  | "request_failed"
  | "timeout"
  | "network"
  | "invalid_response";

export class PlayerEloClientError extends Error {
  constructor(readonly code: PlayerEloClientErrorCode, message: string) {
    super(message);
    this.name = "PlayerEloClientError";
  }
}

export interface PlayerEloClientOptions {
  apiKey: string;
  /** Must represent confirmed permission to send these records to the configured model. */
  allowModelProcessing: boolean;
  /** Must represent confirmed permission to display returned records in the product. */
  allowReportDisplay: boolean;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface PlayerEloPageOptions {
  limit?: number;
  offset?: number;
}

/**
 * Read-only PlayerElo API client. It does not cache or persist responses and
 * intentionally exposes no transfer-fit, prospect-score, or market-value API.
 */
export class PlayerEloClient {
  private readonly requestTimeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: PlayerEloClientOptions) {
    if (!options.apiKey.trim()) {
      throw new PlayerEloClientError("invalid_configuration", "PlayerElo API key is not configured.");
    }
    if (!options.allowModelProcessing || !options.allowReportDisplay) {
      throw new PlayerEloClientError(
        "permission_required",
        "PlayerElo lookups are disabled until model-processing and report-display permissions are explicitly confirmed.",
      );
    }
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    if (!Number.isInteger(this.requestTimeoutMs) || this.requestTimeoutMs < 1) {
      throw new PlayerEloClientError("invalid_configuration", "PlayerElo request timeout must be a positive integer in milliseconds.");
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async searchPlayers(name: string, page: PlayerEloPageOptions = {}): Promise<PlayerEloPlayerSummary[]> {
    const query = name.trim();
    if (!query) throw new PlayerEloClientError("invalid_configuration", "A player name is required for PlayerElo search.");
    return this.listPlayers(`/v1/players?${this.pageQuery({ ...page, search: query })}`);
  }

  async listLeaguePlayers(leagueId: string, page: PlayerEloPageOptions = {}): Promise<PlayerEloPlayerSummary[]> {
    const id = leagueId.trim();
    if (!id) throw new PlayerEloClientError("invalid_configuration", "A PlayerElo league ID is required.");
    return this.listPlayers(`/v1/leagues/${encodeURIComponent(id)}/players?${this.pageQuery(page)}`);
  }

  async getPlayer(playerId: string): Promise<PlayerEloPlayerRecord> {
    const id = playerId.trim();
    if (!id) throw new PlayerEloClientError("invalid_configuration", "A PlayerElo player ID is required.");
    const value = await this.requestJson(`/v1/players/${encodeURIComponent(id)}`);
    const parsed = playerRecordSchema.safeParse(value);
    if (!parsed.success) {
      throw new PlayerEloClientError("invalid_response", "PlayerElo returned a player record with an unsupported shape.");
    }
    return { ...parsed.data, retrievedAt: this.now().toISOString() };
  }

  async getPlayerHistory(playerId: string, from?: string, to?: string): Promise<PlayerEloHistoryItem[]> {
    const id = playerId.trim();
    if (!id) throw new PlayerEloClientError("invalid_configuration", "A PlayerElo player ID is required.");
    const query = new URLSearchParams();
    if (from) query.set("frm", from);
    if (to) query.set("to", to);
    const suffix = query.size ? `?${query.toString()}` : "";
    const value = await this.requestJson(`/v1/players/${encodeURIComponent(id)}/history${suffix}`);
    const parsed = z.array(historyItemSchema).safeParse(value);
    if (!parsed.success) {
      throw new PlayerEloClientError("invalid_response", "PlayerElo returned rating history with an unsupported shape.");
    }
    return parsed.data;
  }

  private pageQuery(options: PlayerEloPageOptions & { search?: string }): string {
    const limit = options.limit ?? 20;
    const offset = options.offset ?? 0;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) {
      throw new PlayerEloClientError("invalid_configuration", "PlayerElo pagination requires limit 1–100 and a non-negative integer offset.");
    }
    const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (options.search) query.set("search", options.search);
    return query.toString();
  }

  private async listPlayers(path: string): Promise<PlayerEloPlayerSummary[]> {
    const value = await this.requestJson(path);
    const parsed = z.array(playerSummarySchema).safeParse(value);
    if (!parsed.success) {
      throw new PlayerEloClientError("invalid_response", "PlayerElo returned a player list with an unsupported shape.");
    }
    return parsed.data;
  }

  private async requestJson(path: string): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${baseUrl}${path}`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs),
      });
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError") {
        throw new PlayerEloClientError("timeout", "PlayerElo request timed out.");
      }
      throw new PlayerEloClientError("network", "PlayerElo could not be reached.");
    }

    if (response.status === 401 || response.status === 403) {
      throw new PlayerEloClientError("authentication", "PlayerElo rejected the configured API key.");
    }
    if (response.status === 404) {
      throw new PlayerEloClientError("not_found", "PlayerElo did not find the requested player or league.");
    }
    if (response.status === 429) {
      throw new PlayerEloClientError("rate_limit", "PlayerElo request limit or monthly quota was reached.");
    }
    if (!response.ok) {
      throw new PlayerEloClientError("request_failed", `PlayerElo returned HTTP ${response.status}.`);
    }

    try {
      return await response.json() as unknown;
    } catch {
      throw new PlayerEloClientError("invalid_response", "PlayerElo returned invalid JSON.");
    }
  }
}
