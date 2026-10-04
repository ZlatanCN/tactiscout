import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  HistoricalArchiveCoverage,
  HistoricalArchiveSample,
  PlayerProfile,
} from "../domain/schemas.js";
import { SupplementaryCapabilityMetricDefinitions } from "../domain/schemas.js";
import { ReepIdentityRegistry } from "../identity/reep-registry.js";
import { WyscoutPlayerRepository } from "./wyscout-provider.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const wyscoutAttribution = "Wyscout Open Data, Pappalardo et al. 2019, doi:10.1038/s41597-019-0247-7; report metrics are source-selected or explicitly defined TactiScout derivations.";
const wyscoutPaperUrl = "https://doi.org/10.1038/s41597-019-0247-7";
const wyscoutLicenseUrl = "https://creativecommons.org/licenses/by/4.0/";

const emptyCoverage = (status: HistoricalArchiveCoverage["status"], disabledReason: HistoricalArchiveCoverage["disabledReason"] = null): HistoricalArchiveCoverage => ({
  status,
  disabledReason,
  checkedCandidates: 0,
  mappedCandidates: 0,
  matchedCandidates: 0,
  failedCandidates: 0,
});

export interface HistoricalArchiveEnrichmentResult {
  samplesByPlayerId: Record<string, HistoricalArchiveSample[]>;
  coverage: HistoricalArchiveCoverage;
}

export interface ConfiguredHistoricalArchive {
  coverage: HistoricalArchiveCoverage;
  enrich(players: PlayerProfile[]): Promise<HistoricalArchiveEnrichmentResult>;
}

export type HistoricalArchiveSetup =
  | { status: "disabled"; coverage: HistoricalArchiveCoverage }
  | { status: "ready"; coverage: HistoricalArchiveCoverage; enrich: ConfiguredHistoricalArchive["enrich"] };

function absolutePath(environmentValue: string | undefined, defaultPath: string): string {
  return path.resolve(projectRoot, environmentValue?.trim() || defaultPath);
}

function fileExists(filePath: string): boolean {
  return existsSync(filePath);
}

function hasMatchingDataFile(directory: string, pattern: RegExp): boolean {
  try {
    return readdirSync(directory).some((name) => pattern.test(name));
  } catch {
    return false;
  }
}

function metricsFor(profile: PlayerProfile): HistoricalArchiveSample["metrics"] {
  const rawDefinitions: Record<string, { label: string; unit: string; definition: string; sourceField: string }> = {
    goals: { label: "进球", unit: "球", definition: "该历史赛季事件样本中的进球总数。", sourceField: "shot events · tag 101" },
    assists: { label: "助攻", unit: "次", definition: "该历史赛季事件样本中的助攻总数。", sourceField: "events · tag 301" },
    passesAttempted: { label: "传球尝试", unit: "次", definition: "该历史赛季事件样本中的传球尝试总数。", sourceField: "pass events" },
    passesCompleted: { label: "完成传球", unit: "次", definition: "该历史赛季事件样本中带有 Wyscout 成功标签的传球总数。", sourceField: "pass events · tag 1801" },
    keyPasses: { label: "关键传球", unit: "次", definition: "旧版 Wyscout 事件标签 302；不等同于射门助攻。", sourceField: "events · tag 302" },
  };
  const availableStats = new Set(profile.availableStats ?? []);
  const rawMetrics = Object.entries(rawDefinitions).flatMap(([key, definition]) => {
    if (!availableStats.has(key as keyof PlayerProfile["stats"])) return [];
    const value = profile.stats[key as keyof PlayerProfile["stats"]];
    return typeof value === "number" ? [{ key, ...definition, value }] : [];
  });
  const supplementaryMetrics = (profile.supplementaryMetrics ?? []).flatMap((metric) => {
    if (metric.value === null) return [];
    const label = SupplementaryCapabilityMetricDefinitions.find((item) => item.key === metric.key)?.label ?? metric.key;
    return [{ key: metric.key, label, value: metric.value, unit: metric.unit, definition: metric.definition, sourceField: metric.sourceField }];
  });
  return [...rawMetrics, ...supplementaryMetrics];
}

function makeSample(
  archivePlayer: PlayerProfile,
  identityLink: HistoricalArchiveSample["identityLink"],
): HistoricalArchiveSample {
  const archivePlayerId = archivePlayer.sourceIdentity?.playerId ?? archivePlayer.externalPlayerId;
  if (!archivePlayerId) throw new Error("Wyscout archive record has no source player ID.");
  return {
    provider: "Wyscout Open Data",
    providerPlayerId: archivePlayerId,
    playerName: archivePlayer.name,
    team: archivePlayer.team,
    competition: archivePlayer.competition,
    season: archivePlayer.season,
    minutes: archivePlayer.minutes,
    metrics: metricsFor(archivePlayer),
    license: "CC BY 4.0",
    licenseUrl: wyscoutLicenseUrl,
    attribution: wyscoutAttribution,
    sourceUrl: wyscoutPaperUrl,
    identityLink,
  };
}

export function createConfiguredHistoricalArchive(): HistoricalArchiveSetup {
  if (process.env.TACTISCOUT_WYSCOUT_HISTORICAL_REPORT_DISPLAY_ALLOWED !== "true") {
    return { status: "disabled", coverage: emptyCoverage("disabled", "report_display_not_allowed") };
  }
  if (process.env.TACTISCOUT_WYSCOUT_HISTORICAL_LOCAL_RETENTION_ALLOWED !== "true") {
    return { status: "disabled", coverage: emptyCoverage("disabled", "local_retention_not_allowed") };
  }

  const identityIndexPath = absolutePath(process.env.TACTISCOUT_REEP_IDENTITY_DB_PATH, ".data/reep/identity.sqlite");
  if (!fileExists(identityIndexPath)) {
    return { status: "disabled", coverage: emptyCoverage("disabled", "reep_index_missing") };
  }

  const dataDirectory = absolutePath(process.env.TACTISCOUT_WYSCOUT_ARCHIVE_DIR ?? process.env.TACTISCOUT_WYSCOUT_DIR, ".data/wyscout-open-data");
  const requiredFiles = ["competitions.json", "teams.json", "players.json"];
  if (!requiredFiles.every((name) => fileExists(path.join(dataDirectory, name)))) {
    return { status: "disabled", coverage: emptyCoverage("disabled", "wyscout_archive_missing") };
  }
  const hasMatchFiles = hasMatchingDataFile(dataDirectory, /^matches(?:_.*)?\.json$/);
  const hasEventFiles = hasMatchingDataFile(dataDirectory, /^events(?:_.*)?\.json$/);
  if (!hasMatchFiles || !hasEventFiles) {
    return { status: "disabled", coverage: emptyCoverage("disabled", "wyscout_archive_missing") };
  }

  const archiveRepository = new WyscoutPlayerRepository({
    dataDirectory,
    allowModelProcessing: false,
    allowHistoricalReport: true,
  });
  const coverage = emptyCoverage("not_run");
  return {
    status: "ready",
    coverage,
    async enrich(players) {
      const samplesByPlayerId: Record<string, HistoricalArchiveSample[]> = {};
      const resultCoverage: HistoricalArchiveCoverage = {
        ...coverage,
        checkedCandidates: players.length,
      };
      if (players.length === 0) return { samplesByPlayerId, coverage: resultCoverage };

      let registry: ReepIdentityRegistry | undefined;
      try {
        registry = new ReepIdentityRegistry(identityIndexPath);
        const resolved = new Map<string, {
          player: PlayerProfile;
          reepId: string;
          sourceRung: string | null;
          sourceUpstreamStatus: string | null;
          archiveBridges: Map<string, { rung: string | null; upstreamStatus: string | null }>;
        }>();

        for (const player of players) {
          const sourceIdentity = player.sourceIdentity;
          if (!sourceIdentity || sourceIdentity.provider === "wyscout-open-data") continue;
          const identity = registry.resolveSourceProvider(sourceIdentity.provider, sourceIdentity.playerId);
          if (identity.status !== "resolved" || !identity.reepId) continue;
          const archiveBridges = new Map(identity.linkedBridges
            .filter((bridge) => bridge.provider === "wyscout" && bridge.namespace === "player")
            .map((bridge) => [bridge.externalId, { rung: bridge.rung, upstreamStatus: bridge.upstreamStatus }]));
          if (archiveBridges.size === 0) continue;
          resultCoverage.mappedCandidates += 1;
          const sourceBridge = identity.matchedBridges.find((bridge) => bridge.redirectStatus === "resolved");
          resolved.set(player.playerId, {
            player,
            reepId: identity.reepId,
            sourceRung: sourceBridge?.rung ?? null,
            sourceUpstreamStatus: sourceBridge?.upstreamStatus ?? null,
            archiveBridges,
          });
        }

        if (resolved.size === 0) {
          return { samplesByPlayerId, coverage: { ...resultCoverage, status: "partial" } };
        }

        const archiveProfiles = await archiveRepository.loadPlayers();
        const externalIds = new Set([...resolved.values()].flatMap(({ archiveBridges }) => [...archiveBridges.keys()]));
        const profilesByExternalId = new Map<string, PlayerProfile[]>();
        for (const profile of archiveProfiles) {
          const externalId = profile.sourceIdentity?.provider === "wyscout-open-data"
            ? profile.sourceIdentity.playerId
            : profile.externalPlayerId;
          if (!externalId || !externalIds.has(externalId)) continue;
          const profiles = profilesByExternalId.get(externalId) ?? [];
          profiles.push(profile);
          profilesByExternalId.set(externalId, profiles);
        }

        for (const [playerId, candidate] of resolved) {
          const linkedSamples = [...candidate.archiveBridges].flatMap(([archiveId, bridge]) =>
            (profilesByExternalId.get(archiveId) ?? []).map((profile) => makeSample(profile, {
              reepReleaseStamp: registry!.releaseStamp,
              reepId: candidate.reepId,
              sourceProvider: candidate.player.sourceIdentity!.provider,
              sourcePlayerId: candidate.player.sourceIdentity!.playerId,
              sourceRung: candidate.sourceRung,
              archiveRung: bridge.rung,
              sourceUpstreamStatus: candidate.sourceUpstreamStatus,
              archiveUpstreamStatus: bridge.upstreamStatus,
            })));
          const uniqueSamples = [...new Map(linkedSamples.map((sample) => [
            `${sample.providerPlayerId}:${sample.competition}:${sample.season}:${sample.team}`,
            sample,
          ])).values()]
            .sort((left, right) => right.minutes - left.minutes)
            .slice(0, 12);
          if (uniqueSamples.length) {
            samplesByPlayerId[playerId] = uniqueSamples;
            resultCoverage.matchedCandidates += 1;
          }
        }

        const partial = resultCoverage.mappedCandidates < resultCoverage.checkedCandidates
          || resultCoverage.matchedCandidates < resultCoverage.mappedCandidates;
        return {
          samplesByPlayerId,
          coverage: { ...resultCoverage, status: partial ? "partial" : "complete" },
        };
      } catch {
        return {
          samplesByPlayerId,
          coverage: {
            ...resultCoverage,
            status: "failed",
            failedCandidates: players.length,
          },
        };
      } finally {
        registry?.close();
      }
    },
  };
}
