import "dotenv/config";
import { randomUUID } from "node:crypto";
import { configuredRecruitmentConversation, type RecruitmentTraceEvent } from "../agent/conversation.js";
import { dataRepository } from "../agent/graph.js";
import { PositionSchema } from "../domain/schemas.js";
import { createLocalKnowledgeBase } from "../knowledge/index.js";
import {
  evaluateLocalAgentScenario,
  localAgentEvaluationScenarios,
  privacySafeTraceEvent,
  summarizeEvaluationRuns,
  type EvaluationScenario,
} from "./harness-evaluation.js";

const defaultScenario = localAgentEvaluationScenarios[0]!;
const usage = [
  "用法：",
  "  pnpm eval:local-agent",
  "  pnpm eval:local-agent -- --scenario bayern-kane-replacement",
  "  pnpm eval:local-agent -- --scenario all --runs 3",
  "  pnpm eval:local-agent -- --message \"自定义球探需求\" [--answer \"补充回答\"] [--expected-position ST]",
  "",
  "选项：",
  "  --scenario <id|all> 运行已登记场景；不传时运行巴萨年轻中场场景",
  "  --runs <1-10>        每个场景独立运行次数，默认 1",
  "  --message <text>     自定义单个场景需求",
  "  --answer <text>      自定义补答；可重复",
  "  --expected-position <position> 检查自定义场景的搜索及推荐位置",
  "  --help               显示本帮助",
].join("\n");

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} 缺少参数值。`);
  return value;
}

function options(name: string): string[] {
  return process.argv.flatMap((argument, index) => argument === name && process.argv[index + 1]
    ? [process.argv[index + 1]!]
    : []);
}

function parseRunCount(value: string | undefined): number {
  if (value === undefined) return 1;
  if (!/^\d+$/.test(value)) throw new Error("--runs 必须是 1 到 10 之间的整数。");
  const count = Number(value);
  if (count < 1 || count > 10) throw new Error("--runs 必须是 1 到 10 之间的整数。");
  return count;
}

function selectScenarios(): { scenarios: EvaluationScenario[]; runsPerScenario: number } {
  const scenarioId = option("--scenario");
  const message = option("--message");
  const answers = options("--answer");
  const expectedPositionInput = option("--expected-position");
  const expectedPositionResult = expectedPositionInput ? PositionSchema.safeParse(expectedPositionInput) : undefined;
  if (expectedPositionInput && !expectedPositionResult?.success) {
    throw new Error(`--expected-position 必须是以下值之一：${PositionSchema.options.join(", ")}。`);
  }
  const expectedPosition = expectedPositionResult?.success ? expectedPositionResult.data : undefined;
  const runsPerScenario = parseRunCount(option("--runs"));

  if (scenarioId) {
    if (message || expectedPosition) throw new Error("--scenario 不能与 --message 或 --expected-position 一起使用。");
    if (scenarioId === "all") {
      if (answers.length) throw new Error("--scenario all 使用数据集内登记的补答，不接受 --answer。");
      return { scenarios: [...localAgentEvaluationScenarios], runsPerScenario };
    }
    const selected = localAgentEvaluationScenarios.find((scenario) => scenario.id === scenarioId);
    if (!selected) throw new Error(`未知场景：${scenarioId}。可选值：${localAgentEvaluationScenarios.map(({ id }) => id).join(", ")}、all。`);
    return {
      scenarios: [{ ...selected, answers: answers.length ? answers : selected.answers }],
      runsPerScenario,
    };
  }

  if (!message && !answers.length && !expectedPosition) {
    return { scenarios: [defaultScenario], runsPerScenario };
  }
  return {
    scenarios: [{
      id: "custom",
      message: message ?? defaultScenario.message,
      answers,
      kind: "custom",
      requireClarificationResume: answers.length > 0,
      ...(expectedPosition ? { expectedPosition } : {}),
    }],
    runsPerScenario,
  };
}

function safeEndpoint(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.origin;
  } catch {
    return "invalid URL";
  }
}

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

function summarizeReport(response: Awaited<ReturnType<ReturnType<typeof configuredRecruitmentConversation>["turn"]>>) {
  if (!response.report) return null;
  return {
    targetTeam: response.report.targetTeam,
    evaluatedCandidateCount: response.report.evidenceCoverage.evaluatedCandidateCount,
    methodologyChunksRetrieved: response.report.knowledgeCoverage.methodologyChunksRetrieved,
    playerReportChunksRetrieved: response.report.knowledgeCoverage.playerReportChunksRetrieved,
    recommendations: response.report.recommendations.map((candidate) => ({
      playerId: candidate.player.playerId,
      position: candidate.player.position,
      evidenceKeys: candidate.focusEvidenceKeys,
    })),
    limitations: response.report.limitations,
  };
}

async function runScenarioOnce(scenario: EvaluationScenario, runNumber: number, knowledgeBase: ReturnType<typeof createLocalKnowledgeBase>) {
  const events: RecruitmentTraceEvent[] = [];
  const threadId = `local-eval-${scenario.id}-${randomUUID()}`;
  const startedAt = performance.now();
  const conversation = configuredRecruitmentConversation(dataRepository, knowledgeBase, (event) => {
    events.push(event);
    process.stderr.write(`[trace][${scenario.id}][${runNumber}] ${JSON.stringify(privacySafeTraceEvent(event))}\n`);
  });

  try {
    const firstTurnResponse = await conversation.turn({ threadId, message: scenario.message });
    let response = firstTurnResponse;
    const firstTurnStatus = firstTurnResponse.status;
    const firstTurnEvents = [...events];
    const firstTurnEventCount = events.length;
    let answersUsed = 0;
    for (const answer of scenario.answers) {
      if (response.status !== "needs_input") break;
      response = await conversation.turn({ threadId, message: answer, expectsExistingState: true });
      answersUsed += 1;
    }
    const elapsedMs = Math.round(performance.now() - startedAt);
    const continuedEvents = events.slice(firstTurnEventCount);
    const evaluation = evaluateLocalAgentScenario({
      scenario,
      events,
      firstTurnResponse,
      response,
      firstTurnEvents,
      continuedEvents,
      answersUsed,
      threadId,
    });
    return {
      run: runNumber,
      threadId,
      firstTurnStatus,
      finalStatus: response.status,
      clarificationAnswersUsed: answersUsed,
      elapsedMs,
      decisionCount: events.filter((event) => event.phase === "decision").length,
      toolCallCount: events.filter((event) => event.phase === "tool").length,
      checks: evaluation.checks,
      allPassed: evaluation.allPassed,
      report: summarizeReport(response),
      trace: events.map(privacySafeTraceEvent),
    };
  } catch (error) {
    return {
      run: runNumber,
      threadId,
      firstTurnStatus: null,
      finalStatus: null,
      clarificationAnswersUsed: 0,
      elapsedMs: Math.round(performance.now() - startedAt),
      decisionCount: events.filter((event) => event.phase === "decision").length,
      toolCallCount: events.filter((event) => event.phase === "tool").length,
      checks: { conversationCompleted: false },
      allPassed: false,
      report: null,
      errors: summarizeError(error),
      trace: events.map(privacySafeTraceEvent),
    };
  }
}

if (process.argv.includes("--help")) {
  process.stdout.write(`${usage}\n`);
} else {
  try {
    const { scenarios, runsPerScenario } = selectScenarios();
    const knowledgeBase = createLocalKnowledgeBase();
    const outputs = [];

    for (const scenario of scenarios) {
      const runs = [];
      for (let runNumber = 1; runNumber <= runsPerScenario; runNumber += 1) {
        runs.push(await runScenarioOnce(scenario, runNumber, knowledgeBase));
      }
      outputs.push({
        id: scenario.id,
        summary: summarizeEvaluationRuns(runs.map((run) => ({ checks: run.checks, elapsedMs: run.elapsedMs }))),
        runs,
      });
    }

    const output = {
      datasetVersion: 1,
      model: process.env.OPENAI_MODEL ?? null,
      endpoint: safeEndpoint(process.env.OPENAI_BASE_URL),
      apiKeyConfigured: Boolean(process.env.OPENAI_API_KEY),
      repository: { mode: dataRepository.mode, source: dataRepository.sourceName },
      repeatsPerScenario: runsPerScenario,
      scenarios: outputs,
      claims: {
        recommendationRankingAccuracy: "not evaluated: no trusted scout ranking labels",
        ragRelevance: "not evaluated: current approved corpus is too small and lacks relevance labels",
      },
      allPassed: outputs.every(({ summary }) => summary.passRate === 1),
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    if (!output.allPassed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "Invalid evaluation options."}\n${usage}\n`);
    process.exitCode = 2;
  }
}
