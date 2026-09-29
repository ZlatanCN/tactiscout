export type Position = "GK" | "CB" | "LB" | "RB" | "LWB" | "RWB" | "DM" | "CM" | "AM" | "LW" | "RW" | "ST";
export type InPossessionRole = "progression" | "retention" | "creation";
export type OutOfPossessionRole = "pressing" | "defensive_disruption";
export type RolePhase = "in_possession" | "out_of_possession";

export interface ScoutRequest {
  targetTeam: string;
  query?: string;
  position: Position;
  maxAge?: number;
  inPossessionRoles: InPossessionRole[];
  outOfPossessionRoles: OutOfPossessionRole[];
  topK: number;
  includeUnknownAge: boolean;
}

export interface BriefDraft {
  targetTeam: string | null;
  position: Position | null;
  maxAge: number | null;
  inPossessionRoles: InPossessionRole[];
  outOfPossessionRoles: OutOfPossessionRole[];
}

export interface ParseBriefResponse {
  draft: BriefDraft;
  missingFields: Array<"targetTeam" | "position">;
}

export interface RoleAssessment {
  phase: RolePhase;
  role: InPossessionRole | OutOfPossessionRole;
  fit: number;
  evidence: string[];
  unsupportedAttributes: string[];
}

export interface Candidate {
  player: {
    playerId: string;
    externalPlayerId?: string;
    name: string;
    team: string;
    age: number | null;
    ageSource?: string;
    ageVerifiedAt?: string;
    position: Position;
    competition: string;
    season: string;
    minutes: number;
    source: string;
  };
  per90: {
    goals: number;
    assists: number;
    passesAttempted: number;
    passCompletionPct: number;
    longPasses: number;
    carries: number;
    pressures: number;
    tacklesInterceptions: number;
    shotAssists: number;
  };
  inPossessionFit: number | null;
  outOfPossessionFit: number | null;
  tacticalFit: number;
  score: number;
  roleAssessments: RoleAssessment[];
  reasons: string[];
  risks: string[];
}

export interface ScoutResponse {
  targetTeam: string;
  requirements: {
    targetTeam: string;
    position: Position;
    maxAge?: number;
    inPossessionRoles: InPossessionRole[];
    outOfPossessionRoles: OutOfPossessionRole[];
    includeUnknownAge: boolean;
    topK: number;
  };
  dataSource: string;
  datasetMode: "demo" | "statsbomb";
  candidates: Candidate[];
  review: {
    evidenceCompleteness: number;
    evidenceCoverage: number;
    findings: string[];
    retryRecommended: boolean;
  };
  caveats: string[];
}

export interface DatasetStatus {
  mode: "demo" | "statsbomb";
  source: string;
}
