import assert from "node:assert/strict";
import test from "node:test";
import { assessRoles, toPer90 } from "../src/agent/scoring.js";
import { SportmonksPlayerRepository, SportmonksProviderError } from "../src/data/sportmonks-provider.js";
import { positionMatches } from "../src/domain/positions.js";
import type { PlayerProfile } from "../src/domain/schemas.js";

const fixedNow = new Date("2026-10-04T12:00:00.000Z");

function fixtureFetch() {
  const requests: Array<{ url: URL; authorization: string | null }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = input instanceof URL ? input : new URL(String(input));
    requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
    const path = url.pathname;
    if (path === "/v3/football/seasons/10") {
      return jsonResponse({ data: { id: 10, name: "2026/27", league_id: 8, is_current: 1, league: { name: "Example League" } } });
    }
    if (path === "/v3/football/teams/seasons/10") {
      const page = url.searchParams.get("page");
      return page === "1"
        ? jsonResponse({ data: [{ id: 101, name: "Northbridge", type: "domestic" }], pagination: { current_page: 1, has_more: true } })
        : jsonResponse({ data: [{ id: 202, name: "Harbor City", type: "domestic" }], pagination: { current_page: 2, has_more: false } });
    }
    if (path === "/v3/football/squads/teams/101") {
      return jsonResponse({ data: [
        {
          player_id: 77,
          position_id: 27,
          detailed_position_id: 151,
          detailedPosition: { name: "Centre Forward" },
          start: "2024-07-01",
          end: null,
          player: { id: 77, name: "Jonas Vale", date_of_birth: "2003-02-02" },
        },
        {
          player_id: 78,
          position_id: 25,
          position: { name: "Defender" },
          start: "2020-01-01",
          end: "2025-06-30",
          player: { id: 78, name: "Former Player", date_of_birth: "2000-04-12" },
        },
      ] });
    }
    if (path === "/v3/football/squads/seasons/10/teams/101") {
      return jsonResponse({ data: [{
        player_id: 77,
        season_id: 10,
        details: [
          { type_id: 52, value: { total: 9 } },
          { type_id: 79, value: { total: 2 } },
          { type_id: 80, value: { total: 120 } },
          { type_id: 81, value: { total: 90 } },
          { type_id: 122, value: { total: 10 } },
          { type_id: 78, value: { total: 3 } },
          { type_id: 119, value: { total: 900 } },
        ],
      }] });
    }
    if (path === "/v3/football/squads/teams/202") {
      return jsonResponse({ data: [{
        player_id: 99,
        position_id: 25,
        position: { name: "Defender" },
        start: "2025-01-01",
        end: null,
        player: { id: 99, name: "Broad Position Player", date_of_birth: null },
      }] });
    }
    if (path === "/v3/football/squads/seasons/10/teams/202") return jsonResponse({ data: [] });
    return jsonResponse({ message: "unexpected request" }, 404);
  };
  return { fetchImpl, requests };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function repository(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof SportmonksPlayerRepository>[0]> = {}) {
  return new SportmonksPlayerRepository({
    token: "test-token",
    seasonIds: ["10"],
    coveredStatisticTypeIds: [52, 79, 80, 81, 78, 100, 119, 122],
    allowModelProcessing: true,
    fetchImpl,
    now: () => fixedNow,
    ...extra,
  });
}

test("Sportmonks adapter paginates teams, merges current roster with season stats, and preserves source identity", async () => {
  const { fetchImpl, requests } = fixtureFetch();
  const provider = repository(fetchImpl);

  const players = await provider.loadPlayers();
  const forward = players.find((player) => player.sourceIdentity?.playerId === "77");
  const broadDefender = players.find((player) => player.sourceIdentity?.playerId === "99");

  assert.equal(provider.mode, "sportmonks");
  assert.equal(players.length, 2, "expired squad records should not enter the current player pool");
  assert.ok(forward);
  assert.ok(broadDefender);
  assert.equal(forward.playerId, "sportmonks:77:team:101:season:10");
  assert.equal(forward.position, "ST");
  assert.equal(forward.competition, "Example League");
  assert.equal(forward.season, "2026/27");
  assert.equal(forward.age, 23);
  assert.equal(forward.stats.goals, 9);
  assert.equal(forward.stats.passesAttempted, 120);
  assert.equal(forward.stats.passesCompleted, 90);
  assert.deepEqual(forward.availableStats, ["goals", "assists", "passesAttempted", "passesCompleted", "longPasses", "tackles", "interceptions"]);
  assert.deepEqual(forward.sourceIdentity, {
    provider: "sportmonks",
    playerId: "77",
    teamId: "101",
    competitionId: "8",
    seasonId: "10",
    retrievedAt: fixedNow.toISOString(),
    isCurrentSeason: true,
  });
  assert.equal(broadDefender.position, "DEF", "broad position data must not be guessed as a centre-back");
  assert.deepEqual(broadDefender.availableStats, [], "a missing season-stat row must remain unavailable, not zero-valued evidence");

  const per90 = toPer90(forward);
  assert.equal(per90.longPasses, 1);
  assert.equal(per90.carries, null);
  assert.equal(per90.pressures, null);
  assert.equal(per90.shotAssists, null);
  assert.equal(per90.tacklesInterceptions, 0.3, "confirmed statistic coverage makes an omitted event count a measured zero");
  const roles = assessRoles({
    targetTeam: "Bayern Munich",
    position: "ST",
    inPossessionRoles: ["progression"],
    outOfPossessionRoles: ["pressing"],
    includeUnknownAge: false,
    topK: 3,
  }, forward);
  assert.deepEqual(roles.map((role) => role.fit), [null, null]);
  assert.match(roles[0]!.unsupportedAttributes.join(" "), /未提供带球数据/);
  assert.match(roles[1]!.unsupportedAttributes.join(" "), /未提供施压数据/);

  assert.ok(requests.some(({ url }) => url.pathname.endsWith("/teams/seasons/10") && url.searchParams.get("page") === "1"));
  assert.ok(requests.some(({ url }) => url.pathname.endsWith("/teams/seasons/10") && url.searchParams.get("page") === "2"));
  assert.ok(requests.every(({ authorization }) => authorization === "test-token"));
  assert.ok(requests.every(({ url }) => !url.searchParams.has("api_token")), "credentials must not enter request URLs");
});

test("Sportmonks rejects model processing by default and refuses historical seasons in current-roster mode", async () => {
  const { fetchImpl } = fixtureFetch();
  assert.throws(() => repository(fetchImpl, { allowModelProcessing: false }), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "invalid_configuration",
  );

  const historical = repository(async (input, init) => {
    const url = input instanceof URL ? input : new URL(String(input));
    assert.equal(new Headers(init?.headers).get("Authorization"), "test-token");
    return jsonResponse({ data: { id: 10, name: "2024/25", league_id: 8, is_current: 0, league: { name: "Example League" } } });
  });
  await assert.rejects(historical.loadPlayers(), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "invalid_configuration" && /not marked current/.test(error.message),
  );
});

test("Sportmonks authentication, entitlement, rate-limit, and network failures are not empty candidate results", async () => {
  for (const [status, expectedCode] of [[401, "authentication"], [403, "plan_coverage"], [429, "rate_limit"], [500, "request_failed"]] as const) {
    const failed = repository(async () => jsonResponse({ message: "provider error" }, status));
    await assert.rejects(failed.loadPlayers(), (error: unknown) =>
      error instanceof SportmonksProviderError && error.code === expectedCode,
    );
  }
  const networkFailure = repository(async () => { throw new Error("network offline"); });
  await assert.rejects(networkFailure.loadPlayers(), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "network",
  );
});

test("Sportmonks rejects incomplete pagination instead of silently truncating a season", async () => {
  const incomplete = repository(async (input, init) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.pathname === "/v3/football/seasons/10") {
      return jsonResponse({ data: { id: 10, name: "2026/27", league_id: 8, is_current: true, league: { name: "Example League" } } });
    }
    return jsonResponse({ data: [], pagination: { current_page: 1 } });
  });
  await assert.rejects(incomplete.loadPlayers(), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "invalid_response" && /team page/.test(error.message),
  );
});

test("Sportmonks distinguishes a valid empty player pool from provider failures", async () => {
  const empty = repository(async (input) => {
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.pathname === "/v3/football/seasons/10") {
      return jsonResponse({ data: { id: 10, name: "2026/27", league_id: 8, is_current: true, league: { name: "Example League" } } });
    }
    if (url.pathname === "/v3/football/teams/seasons/10") {
      return jsonResponse({ data: [], pagination: { current_page: 1, has_more: false } });
    }
    return jsonResponse({ message: "unexpected request" }, 404);
  });
  assert.deepEqual(await empty.loadPlayers(), []);
});

test("Sportmonks marks only account-confirmed statistics as available", async () => {
  const { fetchImpl } = fixtureFetch();
  const provider = repository(fetchImpl, { coveredStatisticTypeIds: [52, 119] });
  const player = (await provider.loadPlayers()).find((candidate) => candidate.sourceIdentity?.playerId === "77");
  assert.ok(player);
  assert.deepEqual(player.availableStats, ["goals"]);
  assert.equal(toPer90(player).assists, null);
  assert.equal(toPer90(player).passesAttempted, null);
  assert.equal(toPer90(player).tacklesInterceptions, null);
});

test("Sportmonks accepts the confirmed accurate-passes statistic when successful-passes is not covered", async () => {
  const { fetchImpl: baseFetch } = fixtureFetch();
  const accuratePassFetch: typeof fetch = async (input, init) => {
    const response = await baseFetch(input, init);
    const url = input instanceof URL ? input : new URL(String(input));
    if (url.pathname !== "/v3/football/squads/seasons/10/teams/101") return response;
    const payload = await response.json() as { data: Array<{ details: Array<{ type_id: number; value: unknown }> }> };
    const details = payload.data[0]!.details.filter((detail) => detail.type_id !== 81);
    details.push({ type_id: 116, value: { total: 90 } });
    return jsonResponse({ data: [{ ...payload.data[0], details }] });
  };
  const provider = repository(accuratePassFetch, { coveredStatisticTypeIds: [52, 79, 80, 116, 119, 122, 78, 100] });
  const player = (await provider.loadPlayers()).find((candidate) => candidate.sourceIdentity?.playerId === "77");
  assert.ok(player);
  assert.equal(player.stats.passesCompleted, 90);
  assert.ok(player.availableStats?.includes("passesCompleted"));
});

test("Sportmonks requires explicit confirmed statistic coverage and minutes", () => {
  const { fetchImpl } = fixtureFetch();
  assert.throws(() => repository(fetchImpl, { coveredStatisticTypeIds: [] }), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "invalid_configuration",
  );
  assert.throws(() => repository(fetchImpl, { coveredStatisticTypeIds: [52] }), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "invalid_configuration" && /minutes-played/.test(error.message),
  );
  assert.throws(() => repository(fetchImpl, { coveredStatisticTypeIds: [119, 777] }), (error: unknown) =>
    error instanceof SportmonksProviderError && error.code === "invalid_configuration",
  );
});

test("broad position filters include detailed roles without relabeling broad source positions", () => {
  assert.equal(positionMatches("CB", "DEF"), true);
  assert.equal(positionMatches("DEF", "DEF"), true);
  assert.equal(positionMatches("DEF", "CB"), false);
  assert.equal(positionMatches("ST", "ATT"), true);
  assert.equal(positionMatches("DM", "MID"), true);
});

test("Sportmonks source identity stays separate from player names and provider numeric IDs", () => {
  const player: PlayerProfile = {
    playerId: "sportmonks:1:team:2:season:3",
    name: "Same Name",
    team: "Example",
    age: null,
    position: "CB",
    competition: "League",
    season: "2026/27",
    minutes: 0,
    stats: { goals: 0, assists: 0, passesAttempted: 0, passesCompleted: 0, longPasses: 0, carries: 0, pressures: 0, tackles: 0, interceptions: 0, shotAssists: 0 },
    sourceIdentity: {
      provider: "sportmonks",
      playerId: "1",
      teamId: "2",
      competitionId: "4",
      seasonId: "3",
      retrievedAt: fixedNow.toISOString(),
    },
    availableStats: [],
    source: "Sportmonks Football API",
  };
  assert.equal(player.playerId, "sportmonks:1:team:2:season:3");
  assert.notEqual(player.sourceIdentity?.playerId, player.playerId);
});
