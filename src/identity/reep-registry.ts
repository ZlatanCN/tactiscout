import { DatabaseSync, type StatementSync } from "node:sqlite";

export const ReepPlayerBridgeKeys = [
  { provider: "skillcorner", namespace: "player" },
  { provider: "sportmonks", namespace: "player" },
  { provider: "statsbomb", namespace: "offline_player" },
  { provider: "wyscout", namespace: "player" },
  { provider: "api_football", namespace: "player" },
] as const;

const SourceProviderKeys = {
  "api-football": { provider: "api_football", namespace: "player" },
  "skillcorner-open-data": { provider: "skillcorner", namespace: "player" },
  "sportmonks": { provider: "sportmonks", namespace: "player" },
  "statsbomb-open-data": { provider: "statsbomb", namespace: "offline_player" },
  "wyscout-open-data": { provider: "wyscout", namespace: "player" },
} as const;

export type ReepResolutionStatus =
  | "resolved"
  | "ambiguous"
  | "not_found"
  | "de_corroborated"
  | "withheld"
  | "target_not_published"
  | "unsupported_provider";

export interface ReepBridge {
  provider: string;
  namespace: string;
  externalId: string;
  rung: string | null;
  upstreamStatus: string | null;
}

export interface ReepMatchedBridge extends ReepBridge {
  sourceReepId: string;
  canonicalReepId: string | null;
  redirectStatus: "resolved" | "de_corroborated" | "withheld" | "target_not_published";
}

export interface ReepIdentityResolution {
  status: ReepResolutionStatus;
  releaseStamp: string;
  source: { provider: string; namespace: string; externalId: string };
  reepId?: string;
  matchedBridges: ReepMatchedBridge[];
  linkedBridges: ReepBridge[];
}

export type ReepPlayerEloResolutionStatus =
  | "resolved"
  | "source_not_found"
  | "source_unavailable"
  | "source_ambiguous"
  | "source_inactive"
  | "target_not_found"
  | "target_ambiguous";

export interface ReepPlayerEloResolution {
  status: ReepPlayerEloResolutionStatus;
  releaseStamp: string;
  source: { provider: string; namespace: string; externalId: string };
  reepId?: string;
  apiFootballPlayerId?: string;
  sourceRungs: string[];
  apiFootballRungs: string[];
}

interface StoredBridge {
  sourceReepId: string;
  canonicalReepId: string | null;
  redirectStatus: "resolved" | "de_corroborated" | "withheld" | "target_not_published";
  rung: string | null;
  upstreamStatus: string | null;
}

interface StoredLinkedBridge {
  provider: string;
  namespace: string;
  externalId: string;
  rung: string | null;
  upstreamStatus: string | null;
}

function requiredText(row: Record<string, unknown>, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`Reep identity index has invalid ${key} data.`);
  return value;
}

function nullableText(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`Reep identity index has invalid ${key} data.`);
  return value;
}

export class ReepIdentityRegistry {
  private readonly database: DatabaseSync;
  private readonly sourceLookup!: StatementSync;
  private readonly canonicalLookup!: StatementSync;
  private readonly targetOwnerLookup!: StatementSync;
  private closed = false;
  readonly releaseStamp: string;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath, { readOnly: true });
    let sourceLookup: StatementSync | undefined;
    let canonicalLookup: StatementSync | undefined;
    let targetOwnerLookup: StatementSync | undefined;
    try {
      const result = this.database.prepare(
        "SELECT value FROM metadata WHERE key = 'release_stamp'",
      );
      const release = result.get() as { value?: string } | undefined;
      if (!release?.value) throw new Error("Reep identity index has no release stamp.");
      this.releaseStamp = release.value;
      sourceLookup = this.database.prepare(
        `SELECT source_reep_id AS sourceReepId,
                canonical_reep_id AS canonicalReepId,
                redirect_status AS redirectStatus,
                rung,
                upstream_status AS upstreamStatus
         FROM bridges
         WHERE provider = ? AND namespace = ? AND external_id = ?
         ORDER BY source_reep_id, redirect_status, rung`,
      );
      canonicalLookup = this.database.prepare(
        `SELECT DISTINCT provider, namespace, external_id AS externalId, rung, upstream_status AS upstreamStatus
         FROM bridges
         WHERE canonical_reep_id = ? AND redirect_status = 'resolved'
         ORDER BY provider, namespace, external_id, rung`,
      );
      targetOwnerLookup = this.database.prepare(
        `SELECT DISTINCT canonical_reep_id AS canonicalReepId, upstream_status AS upstreamStatus
         FROM bridges
         WHERE provider = 'api_football' AND namespace = 'player' AND external_id = ?
           AND redirect_status = 'resolved'
         ORDER BY canonical_reep_id`,
      );
      this.sourceLookup = sourceLookup;
      this.canonicalLookup = canonicalLookup;
      this.targetOwnerLookup = targetOwnerLookup;
    } catch (error) {
      this.database.close();
      throw new Error(`Invalid Reep identity index at ${databasePath}.`, { cause: error });
    }
  }

  resolveExact(provider: string, namespace: string, externalId: string): ReepIdentityResolution {
    const source = { provider, namespace, externalId };
    const rawRows = this.sourceLookup.all(provider, namespace, externalId);
    const rows: StoredBridge[] = rawRows.map((row) => {
      const redirectStatus = requiredText(row, "redirectStatus");
      if (redirectStatus !== "resolved" && redirectStatus !== "de_corroborated" && redirectStatus !== "withheld" && redirectStatus !== "target_not_published") {
        throw new Error("Reep identity index has an unknown redirect status.");
      }
      return {
        sourceReepId: requiredText(row, "sourceReepId"),
        canonicalReepId: nullableText(row, "canonicalReepId"),
        redirectStatus,
        rung: nullableText(row, "rung"),
        upstreamStatus: nullableText(row, "upstreamStatus"),
      };
    });
    const matchedBridges: ReepMatchedBridge[] = rows.map((row) => ({
      ...source,
      sourceReepId: row.sourceReepId,
      canonicalReepId: row.canonicalReepId,
      redirectStatus: row.redirectStatus,
      rung: row.rung,
      upstreamStatus: row.upstreamStatus,
    }));

    if (rows.length === 0) {
      return { status: "not_found", releaseStamp: this.releaseStamp, source, matchedBridges, linkedBridges: [] };
    }

    const canonicalIds = [...new Set(rows.flatMap((row) => row.canonicalReepId ? [row.canonicalReepId] : []))];
    const blockedStatuses = [...new Set(rows.map((row) => row.redirectStatus).filter((status) => status !== "resolved"))];
    if (canonicalIds.length > 1 || (canonicalIds.length === 1 && blockedStatuses.length > 0)) {
      return { status: "ambiguous", releaseStamp: this.releaseStamp, source, matchedBridges, linkedBridges: [] };
    }
    if (canonicalIds.length === 0) {
      const status = blockedStatuses.length === 1 ? blockedStatuses[0]! : "ambiguous";
      return { status, releaseStamp: this.releaseStamp, source, matchedBridges, linkedBridges: [] };
    }

    const reepId = canonicalIds[0]!;
    const rawLinkedRows = this.canonicalLookup.all(reepId);
    const linkedRows: StoredLinkedBridge[] = rawLinkedRows.map((row) => ({
      provider: requiredText(row, "provider"),
      namespace: requiredText(row, "namespace"),
      externalId: requiredText(row, "externalId"),
      rung: nullableText(row, "rung"),
      upstreamStatus: nullableText(row, "upstreamStatus"),
    }));
    const linkedBridges: ReepBridge[] = linkedRows.map((row) => ({
      provider: row.provider,
      namespace: row.namespace,
      externalId: row.externalId,
      rung: row.rung,
      upstreamStatus: row.upstreamStatus,
    }));

    return { status: "resolved", releaseStamp: this.releaseStamp, source, reepId, matchedBridges, linkedBridges };
  }

  resolveSourceProvider(sourceProvider: string, externalId: string): ReepIdentityResolution {
    const bridgeKey = SourceProviderKeys[sourceProvider as keyof typeof SourceProviderKeys];
    if (!bridgeKey) {
      return {
        status: "unsupported_provider",
        releaseStamp: this.releaseStamp,
        source: { provider: sourceProvider, namespace: "", externalId },
        matchedBridges: [],
        linkedBridges: [],
      };
    }
    return this.resolveExact(bridgeKey.provider, bridgeKey.namespace, externalId);
  }

  resolvePlayerEloId(sourceProvider: string, externalId: string): ReepPlayerEloResolution {
    const identity = this.resolveSourceProvider(sourceProvider, externalId);
    const source = identity.source;
    const unavailable = (status: ReepPlayerEloResolutionStatus): ReepPlayerEloResolution => ({
      status,
      releaseStamp: this.releaseStamp,
      source,
      sourceRungs: [],
      apiFootballRungs: [],
    });

    if (identity.status === "not_found") return unavailable("source_not_found");
    if (identity.status === "unsupported_provider") return unavailable("source_unavailable");
    if (identity.status !== "resolved" || !identity.reepId) return unavailable("source_ambiguous");

    const activeSourceBridges = identity.matchedBridges.filter(isCurrentUpstreamBridge);
    if (activeSourceBridges.length === 0) return unavailable("source_inactive");

    const apiFootballBridges = identity.linkedBridges.filter((bridge) =>
      bridge.provider === "api_football"
      && bridge.namespace === "player"
      && isCurrentUpstreamBridge(bridge),
    );
    const apiFootballIds = [...new Set(apiFootballBridges.map((bridge) => bridge.externalId))];
    if (apiFootballIds.length === 0) return unavailable("target_not_found");
    if (apiFootballIds.length !== 1) return unavailable("target_ambiguous");

    const apiFootballPlayerId = apiFootballIds[0]!;
    const owners = this.targetOwnerLookup.all(apiFootballPlayerId) as Array<{
      canonicalReepId: string | null;
      upstreamStatus: string | null;
    }>;
    const currentOwners = [...new Set(owners
      .filter((owner) => isCurrentUpstreamBridge({ upstreamStatus: owner.upstreamStatus }))
      .flatMap((owner) => owner.canonicalReepId ? [owner.canonicalReepId] : []))];
    if (currentOwners.length !== 1 || currentOwners[0] !== identity.reepId) {
      return unavailable("target_ambiguous");
    }

    return {
      status: "resolved",
      releaseStamp: this.releaseStamp,
      source,
      reepId: identity.reepId,
      apiFootballPlayerId,
      sourceRungs: [...new Set(activeSourceBridges.flatMap((bridge) => bridge.rung ? [bridge.rung] : []))].sort(),
      apiFootballRungs: [...new Set(apiFootballBridges
        .filter((bridge) => bridge.externalId === apiFootballPlayerId)
        .flatMap((bridge) => bridge.rung ? [bridge.rung] : []))].sort(),
    };
  }

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

function isCurrentUpstreamBridge(bridge: { upstreamStatus: string | null }): boolean {
  const status = bridge.upstreamStatus?.trim().toLowerCase();
  return status === undefined || status === "" || status === "active";
}
