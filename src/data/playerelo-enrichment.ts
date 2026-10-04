import type { PlayerEloSignal } from "../domain/schemas.js";
import { normalizeSearchText } from "../domain/text-matching.js";
import type { PlayerProfile } from "../domain/schemas.js";
import { PlayerEloClient } from "./playerelo-client.js";

export interface PlayerEloEnrichmentResult {
  signalsByPlayerId: Record<string, PlayerEloSignal>;
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
  let failedCandidates = 0;

  for (const player of players) {
    const normalizedName = normalizeSearchText(player.name);
    if (!normalizedName) continue;
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
    // The list endpoint does not expose a total count. A full page may hide duplicate identities.
    if (matches.length >= 100) continue;
    const exactMatches = [...new Map(matches
      .filter((match) => normalizeSearchText(match.player_name) === normalizedName)
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
      identityMatch: "unique_normalized_name",
      retrievedAt: now().toISOString(),
    };
  }

  return {
    signalsByPlayerId,
    checkedCandidates: players.length,
    matchedCandidates: Object.keys(signalsByPlayerId).length,
    failedCandidates,
  };
}
