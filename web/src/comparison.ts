import type { PlayerRecommendation } from "../../src/domain/schemas.js";

export interface EvidenceComparisonRow {
  key: string;
  label: string;
  values: Array<PlayerRecommendation["evidence"][number] | undefined>;
}

const maximumComparedPlayers = 3;

export function toggleComparedPlayer(selectedIds: string[], playerId: string): string[] {
  if (selectedIds.includes(playerId)) return selectedIds.filter((id) => id !== playerId);
  if (selectedIds.length >= maximumComparedPlayers) return selectedIds;
  return [...selectedIds, playerId];
}

export function buildEvidenceComparison(recommendations: PlayerRecommendation[]): EvidenceComparisonRow[] {
  const rows = new Map<string, EvidenceComparisonRow>();
  recommendations.forEach((recommendation, candidateIndex) => {
    recommendation.evidence.forEach((evidence) => {
      let row = rows.get(evidence.key);
      if (!row) {
        row = { key: evidence.key, label: evidence.label, values: Array(recommendations.length).fill(undefined) };
        rows.set(evidence.key, row);
      }
      row.values[candidateIndex] = evidence;
    });
  });
  return [...rows.values()];
}
