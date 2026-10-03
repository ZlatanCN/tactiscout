import type { RecruitmentTraceEvent } from "../agent/conversation.js";
import type { ToolActionName } from "../agent/recruitment-actions.js";
import type { ConversationTurnResponse, Position } from "../domain/schemas.js";

export type EvaluationScenario = {
  id: string;
  message: string;
  answers: string[];
  kind: "shortlist";
  targetTeamAliases: readonly string[];
  requiredTools: readonly ToolActionName[];
  requireBroadPositionSearch: boolean;
  expectedMaxAge: number;
} | {
  id: string;
  message: string;
  answers: string[];
  kind: "clarification-resume";
  targetTeamAliases: readonly string[];
  expectedPosition: Position;
} | {
  id: "custom";
  message: string;
  answers: string[];
  kind: "custom";
  requireClarificationResume: boolean;
  expectedPosition?: Position;
};

export const localAgentEvaluationScenarios: readonly EvaluationScenario[] = [
  {
    id: "barcelona-under-23-midfielder",
    message: "为巴萨找一名 23 岁以下、能踢中场、推进和前场压迫能力强的球员。",
    answers: [],
    kind: "shortlist",
    targetTeamAliases: ["巴萨", "Barcelona", "FC Barcelona"],
    requiredTools: ["search_methodology", "search_candidates"],
    requireBroadPositionSearch: true,
    expectedMaxAge: 23,
  },
  {
    id: "bayern-kane-replacement",
    message: "为拜仁寻找凯恩的替代者。",
    answers: ["按中锋职责，优先未来接班。"],
    kind: "clarification-resume",
    targetTeamAliases: ["拜仁", "Bayern", "FC Bayern"],
    expectedPosition: "ST",
  },
];

export interface ScenarioEvaluationInput {
  scenario: EvaluationScenario;
  events: RecruitmentTraceEvent[];
  firstTurnResponse: ConversationTurnResponse;
  response: ConversationTurnResponse;
  firstTurnEvents: RecruitmentTraceEvent[];
  continuedEvents: RecruitmentTraceEvent[];
  answersUsed: number;
  threadId: string;
}

export interface ScenarioEvaluation {
  checks: Record<string, boolean>;
  allPassed: boolean;
}

function isToolEvent(event: RecruitmentTraceEvent): event is Extract<RecruitmentTraceEvent, { phase: "tool" }> {
  return event.phase === "tool";
}

function isDecisionEvent(event: RecruitmentTraceEvent): event is Extract<RecruitmentTraceEvent, { phase: "decision" }> {
  return event.phase === "decision";
}

function includesInOrder(actual: ToolActionName[], expected: readonly ToolActionName[]): boolean {
  let nextExpected = 0;
  for (const value of actual) {
    if (value === expected[nextExpected]) nextExpected += 1;
    if (nextExpected === expected.length) return true;
  }
  return expected.length === 0;
}

function recommendationsUseTheirEvidence(response: ConversationTurnResponse): boolean {
  return !response.report || response.report.recommendations.every((recommendation) => (
    recommendation.focusEvidenceKeys.length > 0
    && recommendation.focusEvidenceKeys.every((key) => recommendation.evidence.some((evidence) => evidence.key === key))
  ));
}

function stringArrayFilter(event: Extract<RecruitmentTraceEvent, { phase: "tool" }>, key: string): string[] {
  const value = event.filters[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

type CandidateSearchEvent = Extract<RecruitmentTraceEvent, { phase: "tool" }>;

function numberFilter(event: CandidateSearchEvent, key: string): number | null {
  const value = event.filters[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function candidateSearchPagesFollowCursors(events: CandidateSearchEvent[]): boolean {
  const successfulSearches = events.filter((event) => event.ok);
  if (successfulSearches.length === 0) return false;

  const searchesByScope = new Map<string, CandidateSearchEvent[]>();
  for (const event of successfulSearches) {
    const scopeKey = JSON.stringify({
      position: event.filters.position,
      maxAge: event.filters.maxAge,
      minimumMinutes: event.filters.minimumMinutes,
      competition: event.filters.competition,
      season: event.filters.season,
      playerNameFilterUsed: event.filters.playerNameFilterUsed,
    });
    searchesByScope.set(scopeKey, [...(searchesByScope.get(scopeKey) ?? []), event]);
  }

  for (const pages of searchesByScope.values()) {
    let expectedOffset = 0;
    for (const page of pages) {
      const offset = numberFilter(page, "offset");
      const matchCount = page.matchingRecordCount;
      const limit = numberFilter(page, "limit");
      const nextOffset = page.filters.nextOffset;
      if (offset !== expectedOffset || matchCount === undefined || !Number.isInteger(matchCount) || matchCount < 0 || limit === null) {
        return false;
      }
      if (page.resultCount < 0 || page.resultCount > limit || offset + page.resultCount > matchCount) return false;
      if (page.resultCount === 0 && matchCount > 0) return false;
      const calculatedNextOffset = offset + page.resultCount < matchCount ? offset + page.resultCount : null;
      if (nextOffset !== calculatedNextOffset) return false;
      if (pages.indexOf(page) < pages.length - 1 && calculatedNextOffset === null) return false;
      expectedOffset = calculatedNextOffset ?? expectedOffset;
    }
  }
  return true;
}

export function privacySafeTraceEvent(event: RecruitmentTraceEvent): Record<string, unknown> {
  const redactedKeys = ["targetTeam", "teamName", "query", "playerName", "playerNames", "searchedPlayerNames"] as const;
  if (event.phase === "decision") {
    const { targetTeam, ...safeEvent } = event;
    return { ...safeEvent, ...(targetTeam !== undefined ? { targetTeamProvided: Boolean(targetTeam) } : {}) };
  }

  const filters = { ...event.filters };
  for (const key of redactedKeys) {
    if (key in filters) {
      const value = filters[key];
      delete filters[key];
      filters[`${key}Provided`] = Array.isArray(value) ? value.length > 0 : Boolean(value);
    }
  }
  return { ...event, filters };
}

function reportMatchesTeam(response: ConversationTurnResponse, aliases: readonly string[]): boolean {
  if (!response.report) return false;
  const targetTeam = response.report.targetTeam?.toLocaleLowerCase();
  return Boolean(targetTeam && aliases.some((alias) => targetTeam.includes(alias.toLocaleLowerCase())));
}

function tracedTeamNames(events: RecruitmentTraceEvent[]): string[] {
  return events.flatMap((event) => {
    if (event.phase === "decision" && typeof event.targetTeam === "string") return [event.targetTeam];
    if (event.phase === "tool" && event.toolName === "inspect_team") {
      const teamName = event.filters.teamName;
      if (typeof teamName === "string") return [teamName];
    }
    return [];
  });
}

function traceMatchesTeam(events: RecruitmentTraceEvent[], aliases: readonly string[]): boolean {
  const traceTeams = tracedTeamNames(events);
  return traceTeams.length > 0 && traceTeams.every((targetTeam) => aliases.some((alias) => (
    targetTeam.toLocaleLowerCase().includes(alias.toLocaleLowerCase())
  )));
}

function targetTeamContextPreserved(
  response: ConversationTurnResponse,
  events: RecruitmentTraceEvent[],
  aliases: readonly string[],
): boolean {
  const reportMatches = response.report ? reportMatchesTeam(response, aliases) : false;
  const traceTeams = tracedTeamNames(events);
  const traceMatches = traceMatchesTeam(events, aliases);
  if (!response.report) return traceMatches;
  return reportMatches && (traceTeams.length === 0 || traceMatches);
}

function reportAvoidsLoopLimit(response: ConversationTurnResponse): boolean {
  return !response.report || !response.report.limitations.some((item) => /安全步数上限|连续重复.*动作/.test(item));
}

function investigatedBeforeQuestion(events: RecruitmentTraceEvent[]): boolean {
  const questionIndex = events.findIndex((event) => isDecisionEvent(event) && event.action === "ask_user");
  return questionIndex > 0 && events.slice(0, questionIndex).some((event) => isToolEvent(event) && event.ok);
}

function questionAddressesRoleAmbiguity(response: ConversationTurnResponse): boolean {
  const question = response.message;
  const asksAnotherDimension = /联赛|赛事|国籍|预算|年龄|身价|合同|薪资|市场/u.test(question);
  const addressesRole = /凯恩|替代者|接班人|替补|职责|角色|中锋|前锋|主力|首发|即战力|培养/u.test(question);
  const asksForAChoice = /还是|更偏向|优先|立即|即插即用|短期|长期|未来|潜力|培养|接班|主力|首发|哪种|什么样|什么类型/u.test(question);
  return !asksAnotherDimension && addressesRole && asksForAChoice;
}

function clarificationResumeChecks(
  input: ScenarioEvaluationInput,
  requireRoleAmbiguity: boolean,
): Record<string, boolean> {
  const { firstTurnResponse, response, firstTurnEvents, continuedEvents, answersUsed, threadId } = input;
  const asksAfterInvestigation = firstTurnResponse.status === "needs_input"
    && investigatedBeforeQuestion(firstTurnEvents)
    && Boolean(firstTurnResponse.message.trim() && firstTurnResponse.question?.reason.trim());
  const roleAmbiguityAddressed = !requireRoleAmbiguity || questionAddressesRoleAmbiguity(firstTurnResponse);
  return {
    questionFollowedInvestigation: asksAfterInvestigation && roleAmbiguityAddressed,
    ...(requireRoleAmbiguity ? { questionAddressesRoleAmbiguity: roleAmbiguityAddressed } : {}),
    resumedSameCase: firstTurnResponse.status === "needs_input"
      && answersUsed > 0
      && firstTurnResponse.threadId === threadId
      && response.threadId === threadId,
    continuedAfterAnswer: answersUsed > 0 && continuedEvents.some((event) => (
      (isDecisionEvent(event) || isToolEvent(event)) && event.ok
    )),
  };
}

function evidenceEvaluationsFollowCandidateDiscovery(events: RecruitmentTraceEvent[]): boolean {
  const discoveredIds = new Set<string>();
  let candidateSearchSucceeded = false;
  for (const event of events) {
    if (!isToolEvent(event) || !event.ok) continue;
    if (event.toolName === "search_candidates") {
      candidateSearchSucceeded = true;
      for (const id of stringArrayFilter(event, "candidateIds")) discoveredIds.add(id);
    }
    if (event.toolName === "evaluate_candidates" && event.resultCount > 0) {
      const evaluatedIds = stringArrayFilter(event, "evaluatedPlayerIds");
      if (!candidateSearchSucceeded || evaluatedIds.length === 0 || evaluatedIds.some((id) => !discoveredIds.has(id))) {
        return false;
      }
    }
  }
  return true;
}

function explicitEmptyPositionLimitation(response: ConversationTurnResponse, expectedPosition: Position): boolean {
  const positionNames = expectedPosition === "ST" ? ["ST", "中锋"] : [expectedPosition];
  return Boolean(response.report?.limitations.some((limitation) => {
    const hasPosition = positionNames.some((name) => limitation.toLocaleLowerCase().includes(name.toLocaleLowerCase()));
    const explainsAbsence = /没有|未找到|缺少|无可用|不足/.test(limitation);
    return hasPosition && explainsAbsence;
  }));
}

export function evaluateLocalAgentScenario(input: ScenarioEvaluationInput): ScenarioEvaluation {
  const { scenario, events, firstTurnResponse, response, threadId } = input;
  const toolEvents = events.filter(isToolEvent);
  const candidateSearches = toolEvents.filter((event) => event.toolName === "search_candidates");
  const successfulCandidateSearches = candidateSearches.filter((event) => event.ok);
  const evaluationEvents = toolEvents.filter((event) => event.toolName === "evaluate_candidates");
  const successfulEvidenceEvaluations = evaluationEvents.filter((event) => event.ok && event.resultCount > 0
    && stringArrayFilter(event, "evaluatedPlayerIds").length > 0);
  const evaluatedPlayerIds = new Set(successfulEvidenceEvaluations
    .flatMap((event) => stringArrayFilter(event, "evaluatedPlayerIds")));
  const successfulDecisions = events.filter((event) => isDecisionEvent(event) && event.ok).length;
  const report = response.report;
  const commonChecks = {
    usedMultipleModelActions: successfulDecisions > 1,
    finalStatusMatchesReport: response.status === "needs_input" ? report === null : report !== null,
    ...("targetTeamAliases" in scenario ? {
      targetTeamContextPreserved: targetTeamContextPreserved(response, events, scenario.targetTeamAliases),
    } : {}),
    recommendationsAreEvidenceBacked: recommendationsUseTheirEvidence(response),
    recommendationsWereEvaluated: Boolean(!report || report.recommendations.every((item) => (
      evaluatedPlayerIds.has(item.player.playerId)
    ))),
    evaluatedOnlyAfterCandidateDiscovery: !successfulEvidenceEvaluations.length
      || evidenceEvaluationsFollowCandidateDiscovery(events),
    didNotHitDecisionOrPolicyLoopLimit: reportAvoidsLoopLimit(response),
  };

  let checks: Record<string, boolean>;
  if (scenario.kind === "shortlist") {
    const actualTools = toolEvents.filter((event) => event.ok).map((event) => event.toolName);
    const scopesAvoidUnauthorizedFilters = candidateSearches.length > 0 && candidateSearches.every((event) => (
      event.filters.competition === null
      && event.filters.season === null
      && event.filters.minimumMinutes === 0
    ));
    const ageLimitApplied = candidateSearches.length > 0
      && candidateSearches.every((event) => event.filters.maxAge === scenario.expectedMaxAge);
    const broadPositionPreserved = !scenario.requireBroadPositionSearch || (candidateSearches.length > 0
      && candidateSearches.every((event) => event.filters.position === null));
    const candidateResultsFound = successfulCandidateSearches.some((event) => (event.matchingRecordCount ?? 0) > 0);
    const evaluationReturnedEvidence = successfulEvidenceEvaluations.length > 0;
    const candidateSearchDoesNotUseAnUnrequestedName = candidateSearches.length > 0
      && candidateSearches.every((event) => event.filters.playerNameFilterUsed === false);
    const candidatePagesFollowCursors = candidateSearchPagesFollowCursors(candidateSearches);
    const latestEvidenceEvaluation = successfulEvidenceEvaluations.at(-1);
    const latestEvidenceEvaluationIndex = latestEvidenceEvaluation ? events.lastIndexOf(latestEvidenceEvaluation) : -1;
    const successfulReportSearchAfterEvaluation = latestEvidenceEvaluationIndex >= 0 && events.some((event, index) => (
      index > latestEvidenceEvaluationIndex
      && isToolEvent(event)
      && event.toolName === "search_player_reports"
      && event.ok
    ));
    checks = {
      ...commonChecks,
      completedWithReport: response.status === "completed" && report !== null,
      requiredInvestigationToolsInOrder: includesInOrder(actualTools, scenario.requiredTools),
      noInferredCompetitionSeasonOrMinutesFilters: scopesAvoidUnauthorizedFilters,
      appliedUserAgeLimit: ageLimitApplied,
      broadPositionWasNotNarrowed: broadPositionPreserved,
      candidateSearchDoesNotUseAnUnrequestedName,
      candidatePagesFollowCursors,
      searchedMethodologyCorpus: toolEvents.some((event) => event.toolName === "search_methodology" && event.ok),
      evaluatedDiscoveredCandidates: !candidateResultsFound || evaluationReturnedEvidence,
      searchedReportsAfterEvaluatingEvidence: !evaluationReturnedEvidence
        || Boolean(report?.knowledgeCoverage.playerReportSearchPerformed && successfulReportSearchAfterEvaluation),
      didNotRecommendWithoutEvaluatedEvidence: Boolean(report && (evaluationReturnedEvidence
        || report.recommendations.length === 0)),
    };
  } else if (scenario.kind === "clarification-resume") {
    const postAnswerCandidateSearches = input.continuedEvents.filter((event): event is Extract<RecruitmentTraceEvent, { phase: "tool" }> => (
      isToolEvent(event) && event.toolName === "search_candidates"
    ));
    const constrainedPositionSearches = postAnswerCandidateSearches.filter((event) => (
      event.ok && event.filters.position === scenario.expectedPosition
    ));
    checks = {
      ...commonChecks,
      ...clarificationResumeChecks(input, true),
      searchedExpectedPositionAfterAnswer: postAnswerCandidateSearches.some((event) => (
        event.ok && event.filters.position === scenario.expectedPosition
      )),
      expectedPositionSearchStartedAtFirstPage: constrainedPositionSearches.length > 0
        && candidateSearchPagesFollowCursors(constrainedPositionSearches),
      recommendationsMatchExpectedPosition: report
        ? report.recommendations.every((recommendation) => recommendation.player.position === scenario.expectedPosition)
        : response.status === "needs_input",
      emptyExpectedPositionHandledHonestly: (() => {
        const constrainedSearches = postAnswerCandidateSearches.filter((event) => (
          event.ok && event.filters.position === scenario.expectedPosition
        ));
        if (constrainedSearches.length === 0 || constrainedSearches.some((event) => event.matchingRecordCount === undefined)) return false;
        const noCandidatesFound = constrainedSearches.every((event) => event.matchingRecordCount === 0);
        return !noCandidatesFound || response.status === "needs_input"
          || Boolean(report && report.recommendations.length === 0
            && explicitEmptyPositionLimitation(response, scenario.expectedPosition));
      })(),
    };
  } else {
    checks = {
      ...commonChecks,
      ...(scenario.requireClarificationResume ? {
        ...clarificationResumeChecks(input, false),
      } : {}),
      ...(scenario.expectedPosition ? {
        searchedExpectedPosition: candidateSearches.some((event) => event.filters.position === scenario.expectedPosition),
        recommendationsMatchExpectedPosition: !report || report.recommendations.every((recommendation) => (
          recommendation.player.position === scenario.expectedPosition
        )),
      } : {}),
    };
  }

  return { checks, allPassed: Object.values(checks).every(Boolean) };
}

export interface EvaluationRunSummaryInput {
  checks: Record<string, boolean>;
  elapsedMs: number;
}

export interface EvaluationRunSummary {
  runCount: number;
  passedRunCount: number;
  passRate: number;
  failedRunsByCheck: Record<string, number>;
  latencyMs: { p50: number; p95: number };
}

function nearestRankPercentile(values: number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)]!;
}

export function summarizeEvaluationRuns(runs: readonly EvaluationRunSummaryInput[]): EvaluationRunSummary {
  if (runs.length === 0) throw new Error("At least one evaluation run is required.");
  if (runs.some(({ checks }) => Object.keys(checks).length === 0)) {
    throw new Error("Every evaluation run must include at least one check.");
  }
  if (runs.some(({ elapsedMs }) => !Number.isFinite(elapsedMs) || elapsedMs < 0)) {
    throw new Error("Evaluation elapsed time must be a finite non-negative number.");
  }

  const checkNames = new Set(runs.flatMap(({ checks }) => Object.keys(checks)));
  const failedRunsByCheck: Record<string, number> = {};
  for (const name of checkNames) {
    const failedCount = runs.filter(({ checks }) => checks[name] !== true).length;
    if (failedCount > 0) failedRunsByCheck[name] = failedCount;
  }
  const passedRunCount = runs.filter(({ checks }) => [...checkNames].every((name) => checks[name] === true)).length;
  const elapsedTimes = runs.map(({ elapsedMs }) => elapsedMs);

  return {
    runCount: runs.length,
    passedRunCount,
    passRate: passedRunCount / runs.length,
    failedRunsByCheck,
    latencyMs: {
      p50: nearestRankPercentile(elapsedTimes, 0.5),
      p95: nearestRankPercentile(elapsedTimes, 0.95),
    },
  };
}
