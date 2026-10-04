import { DatabaseSync, type StatementSync } from "node:sqlite";

export const ReepPlayerBridgeKeys = [
  { provider: "skillcorner", namespace: "player" },
  { provider: "sportmonks", namespace: "player" },
  { provider: "statsbomb", namespace: "offline_player" },
  { provider: "wyscout", namespace: "player" },
] as const;

const SourceProviderKeys = {
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
  redirectStatus: "resolved" | "de_corroborated" | "withheld";
}

export interface ReepIdentityResolution {
  status: ReepResolutionStatus;
  releaseStamp: string;
  source: { provider: string; namespace: string; externalId: string };
  reepId?: string;
  matchedBridges: ReepMatchedBridge[];
  linkedBridges: ReepBridge[];
}

interface StoredBridge {
  sourceReepId: string;
  canonicalReepId: string | null;
  redirectStatus: "resolved" | "de_corroborated" | "withheld";
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
  private closed = false;
  readonly releaseStamp: string;

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath, { readOnly: true });
    let sourceLookup: StatementSync | undefined;
    let canonicalLookup: StatementSync | undefined;
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
      this.sourceLookup = sourceLookup;
      this.canonicalLookup = canonicalLookup;
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
      if (redirectStatus !== "resolved" && redirectStatus !== "de_corroborated" && redirectStatus !== "withheld") {
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

  close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}
