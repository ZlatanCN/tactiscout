import "dotenv/config";
import { randomUUID } from "node:crypto";
import { configuredRecruitmentConversation, type RecruitmentTraceEvent } from "../agent/conversation.js";
import { dataRepository } from "../agent/graph.js";
import { createLocalKnowledgeBase } from "../knowledge/index.js";

const defaultMessage = "为巴萨找一名 23 岁以下、能踢中场、推进和前场压迫能力强的球员。";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
}

function options(name: string): string[] {
  return process.argv.flatMap((argument, index) => argument === name && process.argv[index + 1]
    ? [process.argv[index + 1]!]
    : []);
}

function safeEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "invalid URL";
  }
}

type ConversationResponse = Awaited<ReturnType<ReturnType<typeof configuredRecruitmentConversation>["turn"]>>;

function evaluateTrace(input: {
  events: RecruitmentTraceEvent[];
  response: ConversationResponse;
  defaultScenario: boolean;
  requireClarificationResume: boolean;
  firstTurnResponse: ConversationResponse;
  firstTurnToolCallCount: number;
  continuedAfterAnswer: boolean;
  answersUsed: number;
  expectedPosition?: string;
  threadId: string;
}) {
  const { events, response } = input;
  const decisions = events.filter((event) => event.phase === "decision");
  const tools = events.filter((event) => event.phase === "tool");
  const toolNames = tools.map((event) => event.toolName);
  const requiredOrder = ["search_methodology", "search_candidates", "evaluate_candidates", "search_player_reports"] as const;
  const requiredOrderPresent = requiredOrder.every((tool, index) => {
    const previousIndex = index === 0 ? -1 : toolNames.lastIndexOf(requiredOrder[index - 1]! as (typeof toolNames)[number]);
    return toolNames.findIndex((name) => name === tool) > previousIndex;
  });
  const candidateSearches = tools.filter((event) => event.toolName === "search_candidates");
  const candidateScopesValid = candidateSearches.every((event) => event.phase === "tool"
    && event.filters.competition === null
    && event.filters.season === null
    && event.filters.minimumMinutes === 0);
  const broadMidfieldSearch = candidateSearches.some((event) => event.phase === "tool" && event.filters.position === null);
  const report = response.report;
  const checks = {
    completed: response.status === "completed"
      || (input.requireClarificationResume && input.answersUsed > 0 && input.continuedAfterAnswer),
    usedMultipleModelActions: decisions.filter((event) => event.ok).length > 1,
    ...(input.defaultScenario ? {
      requiredToolOrder: requiredOrderPresent,
      atLeastOneCandidateSearch: candidateSearches.length > 0,
      noInferredCompetitionSeasonOrMinutesFilters: candidateSearches.length > 0 && candidateScopesValid,
      broadMidfieldWasNotNarrowedToOneSubposition: broadMidfieldSearch,
      targetTeamCaptured: Boolean(report?.targetTeam?.toLocaleLowerCase().includes("barcelona")),
      evaluatedCandidates: Boolean(report && report.evidenceCoverage.evaluatedCandidateCount > 0),
      didNotHitDecisionOrPolicyLoopLimit: Boolean(report && !report.limitations.some((item) => /安全步数上限|连续重复.*动作/.test(item))),
      methodSourceRetrieved: Boolean(report && report.knowledgeCoverage.methodologyChunksRetrieved > 0),
      candidateReportSearchPerformed: Boolean(report?.knowledgeCoverage.playerReportSearchPerformed),
      atLeastOneEvidenceBackedRecommendation: Boolean(report && report.recommendations.length > 0 && report.recommendations.every((candidate) => candidate.focusEvidenceKeys.length > 0
        && candidate.focusEvidenceKeys.every((key) => candidate.evidence.some((evidence) => evidence.key === key)))),
    } : {}),
    ...(input.requireClarificationResume ? {
      clarificationAfterInvestigation: input.firstTurnResponse.status === "needs_input"
        && input.firstTurnToolCallCount > 0
        && Boolean(input.firstTurnResponse.message.trim() && input.firstTurnResponse.question?.reason.trim()),
      resumedSameCase: input.firstTurnResponse.status === "needs_input" && input.answersUsed > 0 && response.threadId === input.threadId,
      continuedAfterAnswer: input.answersUsed > 0 && input.continuedAfterAnswer,
    } : {}),
    ...(input.expectedPosition ? {
      searchedExpectedPosition: candidateSearches.some((event) => event.phase === "tool" && event.filters.position === input.expectedPosition),
      recommendationsMatchExpectedPosition: Boolean(!report || report.recommendations.every((candidate) => candidate.player.position === input.expectedPosition)),
    } : {}),
  };
  return { checks, allPassed: Object.values(checks).every(Boolean) };
}

const message = option("--message") ?? defaultMessage;
const resumeAnswers = options("--answer");
const expectedPosition = option("--expected-position");
const events: RecruitmentTraceEvent[] = [];
const conversation = configuredRecruitmentConversation(dataRepository, createLocalKnowledgeBase(), (event) => {
  events.push(event);
  process.stderr.write(`[trace] ${JSON.stringify(event)}\n`);
});
const threadId = `local-eval-${randomUUID()}`;
const startedAt = performance.now();

function summarizeError(error: unknown): Array<{ name: string; code?: string }> {
  const summaries: Array<{ name: string; code?: string }> = [];
  let current = error;
  for (let depth = 0; depth < 4 && current; depth += 1) {
    const record = typeof current === "object" ? current as { name?: unknown; code?: unknown; cause?: unknown } : {};
    const code = typeof record.code === "string" && /^[A-Z0-9_-]{1,40}$/i.test(record.code) ? record.code : undefined;
    summaries.push({ name: typeof record.name === "string" ? record.name : "Error", ...(code ? { code } : {}) });
    current = record.cause;
  }
  return summaries;
}

try {
  const firstTurnResponse = await conversation.turn({ threadId, message });
  let response = firstTurnResponse;
  const firstTurnStatus = firstTurnResponse.status;
  const firstTurnToolCallCount = events.filter((event) => event.phase === "tool").length;
  const firstTurnEventCount = events.length;
  let answersUsed = 0;
  for (const answer of resumeAnswers) {
    if (response.status !== "needs_input") break;
    response = await conversation.turn({ threadId, message: answer, expectsExistingState: true });
    answersUsed += 1;
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  const evaluation = evaluateTrace({
    events,
    response,
    defaultScenario: message === defaultMessage && resumeAnswers.length === 0,
    requireClarificationResume: resumeAnswers.length > 0,
    firstTurnResponse,
    firstTurnToolCallCount,
    continuedAfterAnswer: events.slice(firstTurnEventCount).some((event) => event.phase === "decision" || event.phase === "tool"),
    answersUsed,
    ...(expectedPosition ? { expectedPosition } : {}),
    threadId,
  });
  const output = {
    scenario: message === defaultMessage ? "barcelona-under-23-midfielder" : "custom",
    model: process.env.OPENAI_MODEL ?? null,
    endpoint: safeEndpoint(process.env.OPENAI_BASE_URL),
    apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
    repository: { mode: dataRepository.mode, source: dataRepository.sourceName },
    firstTurnStatus,
    finalStatus: response.status,
    resumedSameCase: firstTurnStatus === "needs_input" && response.threadId === threadId,
    clarificationAnswersUsed: answersUsed,
    elapsedMs,
    decisionCount: events.filter((event) => event.phase === "decision").length,
    toolCallCount: events.filter((event) => event.phase === "tool").length,
    checks: evaluation.checks,
    report: response.report ? {
      targetTeam: response.report.targetTeam,
      evaluatedCandidateCount: response.report.evidenceCoverage.evaluatedCandidateCount,
      methodologyChunksRetrieved: response.report.knowledgeCoverage.methodologyChunksRetrieved,
      playerReportChunksRetrieved: response.report.knowledgeCoverage.playerReportChunksRetrieved,
      recommendations: response.report.recommendations.map((candidate) => ({
        name: candidate.player.name,
        evidenceKeys: candidate.focusEvidenceKeys,
      })),
      limitations: response.report.limitations,
    } : null,
    trace: events,
    allPassed: evaluation.allPassed,
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  if (!evaluation.allPassed) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({
    evaluationFailed: true,
    elapsedMs: Math.round(performance.now() - startedAt),
    errors: summarizeError(error),
    trace: events,
  }, null, 2)}\n`);
  process.exitCode = 1;
}
