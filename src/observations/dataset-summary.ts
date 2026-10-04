import {
  PlayerObservationDatasetSummarySchema,
  PlayerObservationDimensionDefinitions,
  PlayerObservationDimensionSchema,
  type PlayerObservation,
  type PlayerObservationDatasetSummary,
} from "./schemas.js";

function coverageCounts(values: Array<string | null>): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

export function summarizePlayerObservationDataset(
  observations: readonly PlayerObservation[],
): PlayerObservationDatasetSummary {
  const dimensionCoverage = PlayerObservationDimensionSchema.options.map((dimension) => ({
    dimension,
    label: PlayerObservationDimensionDefinitions[dimension].label,
    recordCount: observations.filter((observation) => observation.ratings.some((rating) => rating.dimension === dimension)).length,
  }));

  const summary = {
    observationRecords: observations.length,
    matchScopedRecords: observations.filter((observation) => Boolean(
      observation.competition?.trim() && observation.season?.trim() && observation.match?.trim(),
    )).length,
    recordsWithRatings: observations.filter((observation) => observation.ratings.length > 0).length,
    ratingEntries: observations.reduce((total, observation) => total + observation.ratings.length, 0),
    observerCount: new Set(observations.map((observation) => observation.observer.trim()).filter(Boolean)).size,
    aiProcessingAllowedRecords: observations.filter((observation) => observation.allowAiProcessing).length,
    indexedRecords: observations.filter((observation) => observation.indexStatus === "indexed").length,
    indexFailedRecords: observations.filter((observation) => observation.indexStatus === "index_failed").length,
    localOnlyRecords: observations.filter((observation) => observation.indexStatus === "local_only").length,
    competitionCoverage: coverageCounts(observations.map((observation) => observation.competition)),
    seasonCoverage: coverageCounts(observations.map((observation) => observation.season)),
    dimensionCoverage,
    latestObservedAt: observations.map((observation) => observation.observedAt).sort().at(-1) ?? null,
  };

  return PlayerObservationDatasetSummarySchema.parse(summary);
}
