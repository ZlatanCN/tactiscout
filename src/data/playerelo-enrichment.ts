import type { PlayerEloSignal } from "../domain/schemas.js";
import { normalizeSearchText } from "../domain/text-matching.js";
import type { PlayerProfile } from "../domain/schemas.js";
import { PlayerEloClient } from "./playerelo-client.js";

export interface PlayerEloEnrichmentResult {
  signalsByPlayerId: Record<string, PlayerEloSignal>;
  identityUnavailableCandidates: number;
  checkedCandidates: number;
  matchedCandidates: number;
  failedCandidates: number;
}

export async function enrichPlayerEloSignals(
  client: PlayerEloClient,
  players: PlayerProfile[],
  now: () => Date = () => new Date(),
): Promise<PlayerEloEnrichmentResult> {
  const signalsByPlayerId: Record<string, PlayerEloSignal> = {};
  const lookups = new Map<string, ReturnType<PlayerEloClient["searchPlayers"]>>();
  let identityUnavailableCandidates = 0;
  let checkedCandidates = 0;
  let failedCandidates = 0;

  for (const player of players) {
    const sourceIdentity = player.sourceIdentity;
    const sourceProvider = sourceIdentity?.provider.toLowerCase().replace(/[^a-z0-9]/g, "");
    // PlayerElo documents player_id as the API-Football ID. Names are only used
    // to retrieve possible rows; they never establish the cross-provider identity.
    if (sourceProvider !== "apifootball" || !sourceIdentity?.playerId) {
      identityUnavailableCandidates += 1;
      continue;
    }
    const normalizedName = normalizeSearchText(player.name);
    if (!normalizedName) {
      identityUnavailableCandidates += 1;
      continue;
    }
    checkedCandidates += 1;
    let lookup = lookups.get(normalizedName);
    if (!lookup) {
      lookup = client.searchPlayers(player.name, { limit: 100, offset: 0 });
      lookups.set(normalizedName, lookup);
    }

    let matches;
    try {
      matches = await lookup;
    } catch {
      failedCandidates += 1;
      continue;
    }
    const exactMatches = [...new Map(matches
      .filter((match) => match.player_id === sourceIdentity.playerId)
      .map((match) => [match.player_id, match])).values()];
    if (exactMatches.length !== 1) continue;

    const match = exactMatches[0]!;
    signalsByPlayerId[player.playerId] = {
      provider: "PlayerElo",
      providerPlayerId: match.player_id,
      playerName: match.player_name,
      elo: match.elo,
      earLabel: match.ear_label ?? null,
      currentTeam: match.current_team ?? null,
      currentLeague: match.current_league ?? null,
      position: match.position_group ?? match.position ?? null,
      identityMatch: "exact_provider_id",
      identitySourceProvider: sourceIdentity.provider,
      identitySourcePlayerId: sourceIdentity.playerId,
      retrievedAt: now().toISOString(),
    };
  }

  return {
    signalsByPlayerId,
    identityUnavailableCandidates,
    checkedCandidates,
    matchedCandidates: Object.keys(signalsByPlayerId).length,
    failedCandidates,
  };
}
