import { existsSync } from "node:fs";
import path from "node:path";
import type { PlayerEloSignal } from "../domain/schemas.js";
import type { PlayerProfile } from "../domain/schemas.js";
import { ReepIdentityRegistry } from "../identity/reep-registry.js";
import { PlayerEloClient, type PlayerEloPlayerRecord } from "./playerelo-client.js";

export interface PlayerEloEnrichmentResult {
  signalsByPlayerId: Record<string, PlayerEloSignal>;
  identityUnavailableCandidates: number;
  directIdentityCandidates: number;
  crosswalkIdentityCandidates: number;
  checkedCandidates: number;
  matchedCandidates: number;
  failedCandidates: number;
}

export interface PlayerEloEnrichmentOptions {
  identityIndexPath?: string;
  now?: () => Date;
}

export async function enrichPlayerEloSignals(
  client: PlayerEloClient,
  players: PlayerProfile[],
  options: PlayerEloEnrichmentOptions = {},
): Promise<PlayerEloEnrichmentResult> {
  const signalsByPlayerId: Record<string, PlayerEloSignal> = {};
  const lookups = new Map<string, Promise<PlayerEloPlayerRecord>>();
  const now = options.now ?? (() => new Date());
  const identityIndexPath = path.resolve(
    options.identityIndexPath ?? process.env.TACTISCOUT_REEP_IDENTITY_DB_PATH ?? ".data/reep/identity.sqlite",
  );
  let registry: ReepIdentityRegistry | undefined;
  if (existsSync(identityIndexPath)) registry = new ReepIdentityRegistry(identityIndexPath);

  let identityUnavailableCandidates = 0;
  let directIdentityCandidates = 0;
  let crosswalkIdentityCandidates = 0;
  let checkedCandidates = 0;
  let failedCandidates = 0;

  try {
    for (const player of players) {
      const sourceIdentity = player.sourceIdentity;
      if (!sourceIdentity?.provider || !sourceIdentity.playerId) {
        identityUnavailableCandidates += 1;
        continue;
      }

      const normalizedProvider = sourceIdentity.provider.toLowerCase().replace(/[^a-z0-9]/g, "");
      let playerEloId: string | undefined;
      let identityCrosswalk: PlayerEloSignal["identityCrosswalk"] = null;
      if (normalizedProvider === "apifootball") {
        playerEloId = sourceIdentity.playerId;
        directIdentityCandidates += 1;
      } else if (registry) {
        const resolution = registry.resolvePlayerEloId(sourceIdentity.provider, sourceIdentity.playerId);
        if (resolution.status === "resolved" && resolution.reepId && resolution.apiFootballPlayerId) {
          playerEloId = resolution.apiFootballPlayerId;
          identityCrosswalk = {
            provider: "Reep",
            releaseStamp: resolution.releaseStamp,
            canonicalId: resolution.reepId,
            sourceRungs: resolution.sourceRungs,
            apiFootballRungs: resolution.apiFootballRungs,
          };
          crosswalkIdentityCandidates += 1;
        }
      }

      if (!playerEloId) {
        identityUnavailableCandidates += 1;
        continue;
      }

      checkedCandidates += 1;
      let lookup = lookups.get(playerEloId);
      if (!lookup) {
        lookup = client.getPlayer(playerEloId);
        lookups.set(playerEloId, lookup);
      }

      let record: PlayerEloPlayerRecord;
      try {
        record = await lookup;
      } catch {
        failedCandidates += 1;
        continue;
      }
      if (record.player_id !== playerEloId) {
        failedCandidates += 1;
        continue;
      }

      signalsByPlayerId[player.playerId] = {
        provider: "PlayerElo",
        providerPlayerId: record.player_id,
        playerName: record.player_name,
        elo: record.elo,
        earLabel: record.ear_label ?? null,
        currentTeam: record.current_team ?? null,
        currentLeague: record.current_league ?? null,
        position: record.position_group ?? record.position ?? null,
        identityMatch: identityCrosswalk ? "reep_crosswalk" : "exact_provider_id",
        identitySourceProvider: sourceIdentity.provider,
        identitySourcePlayerId: sourceIdentity.playerId,
        identityCrosswalk,
        retrievedAt: now().toISOString(),
      };
    }
  } finally {
    registry?.close();
  }

  return {
    signalsByPlayerId,
    identityUnavailableCandidates,
    directIdentityCandidates,
    crosswalkIdentityCandidates,
    checkedCandidates,
    matchedCandidates: Object.keys(signalsByPlayerId).length,
    failedCandidates,
  };
}
