import {
  PlayerProfileSchema,
  type PlayerProfile,
  type Position,
  type RawStatKey,
} from "../domain/schemas.js";
import type { PlayerRepository } from "./provider.js";

const FBREF_ORIGIN = "https://fbref.com";
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ACCESS_FAILURE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const FAILURE_COOLDOWN_MS = 60 * 1000;
const MIN_REQUEST_GAP_MS = 1_000;

const pages = [
  { kind: "standard", url: `${FBREF_ORIGIN}/en/comps/Big5/stats/players/Big-5-European-Leagues-Stats`, required: true },
  { kind: "passing", url: `${FBREF_ORIGIN}/en/comps/Big5/passing/players/Big-5-European-Leagues-Stats`, required: false },
  { kind: "defense", url: `${FBREF_ORIGIN}/en/comps/Big5/defense/players/Big-5-European-Leagues-Stats`, required: false },
  { kind: "possession", url: `${FBREF_ORIGIN}/en/comps/Big5/possession/players/Big-5-European-Leagues-Stats`, required: false },
] as const;

const statPageLabels: Partial<Record<PageKind, string>> = {
  passing: "传球",
  defense: "防守",
  possession: "持球",
};

type PageKind = typeof pages[number]["kind"];
type StatValues = Partial<Record<RawStatKey, number>>;

interface FbrefPlayerRow {
  playerId: string;
  sourceUrl: string;
  name: string;
  teamId: string;
  team: string;
  competitionId: string;
  competition: string;
  position: Position;
  age: number | null;
  minutes: number;
  stats: StatValues;
  availableStats: Set<RawStatKey>;
}

interface ParsedStandardRows {
  players: Map<string, FbrefPlayerRow>;
  season: string;
  unclassifiedPositionRows: number;
  unassignedTeamRows: number;
}

interface HtmlCell {
  text: string;
  html: string;
}

interface CacheEntry {
  expiresAt: number;
  promise: Promise<PlayerProfile[]>;
}

export type FbrefProviderErrorCode = "invalid_configuration" | "network" | "blocked" | "rate_limit" | "request_failed" | "invalid_html";

export class FbrefProviderError extends Error {
  constructor(readonly code: FbrefProviderErrorCode, message: string) {
    super(message);
    this.name = "FbrefProviderError";
  }
}

export interface FbrefRepositoryOptions {
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
  now?: () => Date;
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/gi, (entity, code: string) => {
    const normalized = code.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "apos" || normalized === "#39") return "'";
    if (normalized === "gt") return ">";
    if (normalized === "lt") return "<";
    if (normalized === "nbsp" || normalized === "#160") return " ";
    if (normalized === "quot") return '"';
    const numeric = normalized.startsWith("#x") ? Number.parseInt(normalized.slice(2), 16) : Number.parseInt(normalized.slice(1), 10);
    try {
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
    } catch {
      return entity;
    }
  });
}

function textContent(html: string): string {
  return decodeEntities(html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

function attributeValue(tag: string, attribute: string): string | undefined {
  const escaped = attribute.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? "") : undefined;
}

function absoluteHref(html: string, baseUrl: string): string | undefined {
  const anchor = html.match(/<a\b[^>]*>/i)?.[0];
  const href = anchor ? attributeValue(anchor, "href") : undefined;
  if (!href) return undefined;
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function pageTable(html: string, tableId: string): string {
  // FBref has historically placed some tables inside HTML comments. Unwrap comments
  // before locating a table so this parser handles both layouts without a browser.
  const visibleHtml = html.replace(/<!--[\s\S]*?-->/g, (comment) => comment.slice(4, -3));
  const escaped = tableId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = visibleHtml.match(new RegExp(`<table\\b(?=[^>]*\\bid=["']${escaped}["'])[^>]*>[\\s\\S]*?<\\/table>`, "i"));
  if (!match) throw new FbrefProviderError("invalid_html", `FBref page did not contain the expected ${tableId} table.`);
  return match[0];
}

function tableRows(tableHtml: string, baseUrl: string): Map<string, HtmlCell>[] {
  const tbody = tableHtml.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!tbody) throw new FbrefProviderError("invalid_html", "FBref player table did not contain a body.");
  const rows: Map<string, HtmlCell>[] = [];
  for (const rowMatch of tbody.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    if (/\bclass\s*=\s*["'][^"']*\bthead\b/i.test(rowMatch[1] ?? "")) continue;
    const cells = new Map<string, HtmlCell>();
    for (const cellMatch of (rowMatch[2] ?? "").matchAll(/<(?:th|td)\b([^>]*)>([\s\S]*?)<\/(?:th|td)>/gi)) {
      const dataStat = attributeValue(`<td ${cellMatch[1] ?? ""}>`, "data-stat");
      if (!dataStat) continue;
      const innerHtml = cellMatch[2] ?? "";
      const cell: HtmlCell = {
        text: textContent(innerHtml),
        html: innerHtml,
      };
      // Keep the first duplicate column. FBref tables can include visually hidden
      // responsive duplicates; the first one carries the same semantic field.
      if (!cells.has(dataStat)) cells.set(dataStat, cell);
    }
    if (cells.size) rows.push(cells);
  }
  return rows;
}

function cellText(row: Map<string, HtmlCell>, key: string): string | undefined {
  const value = row.get(key)?.text;
  return value ? value.trim() : undefined;
}

function cellLink(row: Map<string, HtmlCell>, key: string, baseUrl: string): string | undefined {
  const cell = row.get(key);
  return cell ? absoluteHref(cell.html, baseUrl) : undefined;
}

function numericCell(row: Map<string, HtmlCell>, key: string): number | undefined {
  const raw = cellText(row, key);
  if (!raw || raw === "—" || raw === "-") return undefined;
  const value = Number(raw.replaceAll(",", ""));
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function playerIdFromHref(href: string | undefined): string | undefined {
  return href?.match(/\/players\/([a-z\d]+)(?:\/|$)/i)?.[1];
}

function teamIdFromHref(href: string | undefined): string | undefined {
  return href?.match(/\/squads\/([a-z\d]+)(?:\/|$)/i)?.[1];
}

function competitionIdFromHref(href: string | undefined, label: string | undefined): string {
  return href?.match(/\/comps\/([^/]+)(?:\/|$)/i)?.[1] ?? label?.toLowerCase().replace(/[^a-z\d]+/g, "-") ?? "unknown";
}

function positionFromText(value: string | undefined): Position | undefined {
  const positions = (value ?? "").toUpperCase().split(/[\s,/]+/);
  for (const code of positions) {
    if (code === "GK") return "GK";
    if (code === "DF") return "DEF";
    if (code === "MF") return "MID";
    if (code === "FW") return "ATT";
  }
  return undefined;
}

function ageFromBirthDate(value: string | undefined, now: Date): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const birthDate = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(birthDate.getTime())) return null;
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < birthDate.getUTCMonth()
    || (now.getUTCMonth() === birthDate.getUTCMonth() && now.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age >= 15 && age <= 60 ? age : null;
}

function seasonFromHtml(html: string, now: Date): string {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const heading = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "";
  const season = textContent(`${title} ${heading}`).match(/\b(20\d{2})[-–](20\d{2})\b/);
  if (season) return `${season[1]}-${season[2]}`;
  const startYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${startYear}-${startYear + 1}`;
}

function canonicalStatField(kind: PageKind, row: Map<string, HtmlCell>, profile: FbrefPlayerRow): void {
  const fields: Array<[RawStatKey, string[]]> = kind === "standard"
    ? [["goals", ["goals"]], ["assists", ["assists"]]]
    : kind === "passing"
      ? [
        ["passesAttempted", ["passes"]],
        ["passesCompleted", ["passes_completed"]],
        ["longPasses", ["passes_completed_long", "long_passes_completed"]],
        ["shotAssists", ["assisted_shots"]],
        ["keyPasses", ["key_passes"]],
      ]
      : kind === "defense"
        ? [["pressures", ["pressures"]], ["tackles", ["tackles"]], ["interceptions", ["interceptions"]]]
        : [["carries", ["carries"]]];

  for (const [stat, candidates] of fields) {
    for (const field of candidates) {
      const value = numericCell(row, field);
      if (value === undefined) continue;
      profile.stats[stat] = value;
      profile.availableStats.add(stat);
      break;
    }
  }
}

function parseStandardRows(html: string, retrievedAt: Date, now: Date): ParsedStandardRows {
  const baseUrl = pages[0].url;
  const rows = tableRows(pageTable(html, "stats_standard"), baseUrl);
  const players = new Map<string, FbrefPlayerRow>();
  let unclassifiedPositionRows = 0;
  let unassignedTeamRows = 0;
  for (const row of rows) {
    const playerHref = cellLink(row, "player", baseUrl);
    const playerId = playerIdFromHref(playerHref);
    const teamHref = cellLink(row, "team", baseUrl) ?? cellLink(row, "squad", baseUrl);
    const teamId = teamIdFromHref(teamHref);
    const competition = cellText(row, "comp")?.replace(/^[a-z]{3}\s+/i, "");
    const competitionId = competitionIdFromHref(cellLink(row, "comp", baseUrl), competition);
    const name = cellText(row, "player");
    const team = cellText(row, "team") ?? cellText(row, "squad");
    const minutes = numericCell(row, "minutes");
    if (!playerId || !playerHref || !name || !competition || minutes === undefined || minutes <= 0) continue;
    if (!teamId || !team) {
      unassignedTeamRows += 1;
      continue;
    }
    const position = positionFromText(cellText(row, "position"));
    if (!position) {
      unclassifiedPositionRows += 1;
      continue;
    }
    const key = `${playerId}:${teamId}:${competitionId}`;
    const profile: FbrefPlayerRow = {
      playerId,
      sourceUrl: playerHref,
      name,
      teamId,
      team,
      competitionId,
      competition,
      position,
      age: ageFromBirthDate(cellText(row, "born"), now),
      minutes,
      stats: {},
      availableStats: new Set(),
    };
    canonicalStatField("standard", row, profile);
    players.set(key, profile);
  }
  if (!players.size) throw new FbrefProviderError("invalid_html", "FBref standard table contained no identifiable player-season rows.");
  return { players, season: seasonFromHtml(html, now), unclassifiedPositionRows, unassignedTeamRows };
}

function addSupplementaryRows(kind: Exclude<PageKind, "standard">, html: string, players: Map<string, FbrefPlayerRow>): void {
  const baseUrl = pages.find((page) => page.kind === kind)!.url;
  const tableId = `stats_${kind}`;
  const rows = tableRows(pageTable(html, tableId), baseUrl);
  for (const row of rows) {
    const playerId = playerIdFromHref(cellLink(row, "player", baseUrl));
    const teamId = teamIdFromHref(cellLink(row, "team", baseUrl) ?? cellLink(row, "squad", baseUrl));
    const competition = cellText(row, "comp")?.replace(/^[a-z]{3}\s+/i, "");
    const competitionId = competitionIdFromHref(cellLink(row, "comp", baseUrl), competition);
    if (!playerId || !teamId) continue;
    const player = players.get(`${playerId}:${teamId}:${competitionId}`);
    if (player) canonicalStatField(kind, row, player);
  }
}

async function getPage(fetchImpl: typeof fetch, url: string): Promise<string> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { "user-agent": "TactiScout/0.1 (local football scouting research prototype)" },
      signal: AbortSignal.timeout(25_000),
      redirect: "follow",
    });
  } catch {
    throw new FbrefProviderError("network", "FBref could not be reached from this server; no alternate endpoint or proxy was tried.");
  }
  if (response.status === 403) throw new FbrefProviderError("blocked", `FBref denied ${url} with HTTP 403. Automatic retries are disabled.`);
  if (response.status === 429) throw new FbrefProviderError("rate_limit", `FBref rate-limited ${url} with HTTP 429. The application stopped without retrying.`);
  if (!response.ok) throw new FbrefProviderError("request_failed", `FBref returned HTTP ${response.status} for a player statistics page.`);
  const html = await response.text();
  if (!html.trim() || /<title[^>]*>\s*(?:just a moment|access denied|robot check)/i.test(html)) {
    throw new FbrefProviderError("blocked", "FBref returned an access-check page instead of player statistics. No challenge was bypassed.");
  }
  return html;
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export class FbrefPlayerRepository implements PlayerRepository {
  readonly mode = "fbref" as const;
  readonly sourceName = "FBref · 五大联赛球员统计";
  private cached?: CacheEntry;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtlMs: number;
  private readonly now: () => Date;

  constructor(options: FbrefRepositoryOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.now = options.now ?? (() => new Date());
    if (!Number.isFinite(this.cacheTtlMs) || this.cacheTtlMs < 0) {
      throw new FbrefProviderError("invalid_configuration", "FBref cache lifetime must be a non-negative number of milliseconds.");
    }
  }

  loadPlayers(refresh = false): Promise<PlayerProfile[]> {
    const nowMs = this.now().getTime();
    // The graph's evidence-review loop may ask to refresh its source snapshot.
    // FBref is deliberately reused within the cache window so a retry cannot
    // create another burst of page requests.
    void refresh;
    if (this.cached && this.cached.expiresAt > nowMs) return this.cached.promise;

    const entry: CacheEntry = { expiresAt: nowMs + this.cacheTtlMs, promise: Promise.resolve([]) };
    entry.promise = this.fetchPlayers().catch((error: unknown) => {
      if (this.cached === entry) {
        const accessDenied = error instanceof FbrefProviderError && (error.code === "blocked" || error.code === "rate_limit");
        entry.expiresAt = this.now().getTime() + (accessDenied ? ACCESS_FAILURE_COOLDOWN_MS : FAILURE_COOLDOWN_MS);
      }
      throw error;
    });
    this.cached = entry;
    return entry.promise;
  }

  private async fetchPlayers(): Promise<PlayerProfile[]> {
    const retrievedAt = this.now();
    const unavailablePages = new Set<PageKind>();
    let parsed: ParsedStandardRows | undefined;
    let lastRequestFinishedAt: number | undefined;
    for (const page of pages) {
      if (lastRequestFinishedAt !== undefined) {
        const elapsed = Date.now() - lastRequestFinishedAt;
        if (elapsed < MIN_REQUEST_GAP_MS) await wait(MIN_REQUEST_GAP_MS - elapsed);
      }
      let html: string;
      try {
        html = await getPage(this.fetchImpl, page.url);
      } catch (error) {
        lastRequestFinishedAt = Date.now();
        if (page.required
          || error instanceof FbrefProviderError && (error.code === "blocked" || error.code === "rate_limit")) throw error;
        unavailablePages.add(page.kind);
        continue;
      }
      lastRequestFinishedAt = Date.now();
      if (page.kind === "standard") {
        parsed = parseStandardRows(html, retrievedAt, retrievedAt);
        continue;
      }
      try {
        if (!parsed) throw new FbrefProviderError("invalid_html", "FBref standard player statistics are unavailable.");
        addSupplementaryRows(page.kind, html, parsed.players);
      } catch {
        // Optional table markup can change independently. Keep only verified columns;
        // absent metrics stay out of availableStats and therefore cannot score as zero.
        unavailablePages.add(page.kind);
      }
    }
    if (!parsed) throw new FbrefProviderError("invalid_html", "FBref standard player statistics are unavailable.");
    const unavailablePageLabels = [...unavailablePages].map((kind) => statPageLabels[kind] ?? kind);
    const parserLimitations = [
      parsed.unclassifiedPositionRows ? `${parsed.unclassifiedPositionRows} 条位置无法识别的来源记录未纳入候选池` : undefined,
      parsed.unassignedTeamRows ? `${parsed.unassignedTeamRows} 条没有单一球队归属的来源记录未纳入候选池` : undefined,
    ].filter((note): note is string => Boolean(note));
    const sourceNotes = [...unavailablePageLabels.map((label) => `${label}统计页未读取`), ...parserLimitations];

    return [...parsed.players.values()].map((player) => PlayerProfileSchema.parse({
      playerId: `${player.playerId}:${player.teamId}:${player.competitionId}`,
      externalPlayerId: player.playerId,
      name: player.name,
      team: player.team,
      age: player.age,
      ...(player.age === null ? {} : { ageSource: "FBref player birth date", ageVerifiedAt: retrievedAt.toISOString() }),
      position: player.position,
      competition: player.competition,
      season: parsed.season,
      minutes: player.minutes,
      stats: {
        goals: player.stats.goals ?? 0,
        assists: player.stats.assists ?? 0,
        passesAttempted: player.stats.passesAttempted ?? 0,
        passesCompleted: player.stats.passesCompleted ?? 0,
        longPasses: player.stats.longPasses ?? 0,
        carries: player.stats.carries ?? 0,
        pressures: player.stats.pressures ?? 0,
        tackles: player.stats.tackles ?? 0,
        interceptions: player.stats.interceptions ?? 0,
        shotAssists: player.stats.shotAssists ?? 0,
        keyPasses: player.stats.keyPasses ?? 0,
      },
      availableStats: [...player.availableStats],
      sourceIdentity: {
        provider: "fbref",
        playerId: player.playerId,
        teamId: player.teamId,
        competitionId: player.competitionId,
        seasonId: parsed.season,
        retrievedAt: retrievedAt.toISOString(),
        isCurrentSeason: true,
      },
      sourceUrl: player.sourceUrl,
      source: `FBref · 五大联赛球员统计${sourceNotes.length ? `（${sourceNotes.join("；")}）` : ""}`,
    }));
  }
}
