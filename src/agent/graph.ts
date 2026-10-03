import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import {
  ScoutInputSchema,
  ScoutResponseSchema,
  type PlayerProfile,
  type RankedCandidate,
  type Requirements,
  type ScoutInput,
  type ScoutResponse,
} from "../domain/schemas.js";
import { createRepository, filterEligiblePlayers, type PlayerRepository } from "../data/provider.js";
import { assessRoles, averageFit, explainFit, toPer90 } from "./scoring.js";
import { parseRequirements } from "./requirements.js";

const replaceable = <T>(defaultValue: () => T) => Annotation<T>({
  reducer: (_previous, update) => update,
  default: defaultValue,
});

const ScoutState = Annotation.Root({
  input: Annotation<ScoutInput>(),
  requirements: replaceable<Requirements | undefined>(() => undefined),
  allPlayers: replaceable<PlayerProfile[]>(() => []),
  candidates: replaceable<PlayerProfile[]>(() => []),
  statisticalAnalysis: replaceable<Array<{ playerId: string; per90: RankedCandidate["per90"] }>>(() => []),
  tacticalFits: replaceable<Array<{ playerId: string; assessments: RankedCandidate["roleAssessments"] }>>(() => []),
  rankings: replaceable<RankedCandidate[]>(() => []),
  review: replaceable<ScoutResponse["review"] | undefined>(() => undefined),
  retryCount: replaceable<number>(() => 0),
  datasetMode: replaceable<"demo" | "statsbomb">(() => "demo"),
  dataSource: replaceable<string>(() => ""),
  report: replaceable<ScoutResponse | undefined>(() => undefined),
});

type State = typeof ScoutState.State;

const repository = createRepository();
export const dataRepository = repository;

export function createScoutRunner(repo: PlayerRepository): (input: ScoutInput) => Promise<ScoutResponse> {
  const workflow = createWorkflow(repo);
  return async (input) => {
    const result = await workflow.invoke({ input: ScoutInputSchema.parse(input) });
    if (!result.report) throw new Error("Report node did not produce an output.");
    return ScoutResponseSchema.parse(result.report);
  };
}

const defaultScoutRunner = createScoutRunner(repository);

export function runScout(input: ScoutInput): Promise<ScoutResponse> {
  return defaultScoutRunner(input);
}

function buildCaveats(requirements: Requirements, repo: PlayerRepository): string[] {
  return [
    "推进维度使用带球次数和长传次数作为粗略代理；不能替代方向校正后的 progressive actions。",
    "机会创造使用射门助攻和助攻次数作为粗略代理；未评估机会质量或传球难度。",
    "施压、抢断与拦截反映动作次数，不代表成功率或所在战术位置。",
    "球员位置取 StatsBomb 阵容记录中的主要位置，跨位置球员可能被简化归类。",
    "目标球队目前只用于报告语境；MVP 尚未接入俱乐部战术画像、预算、合同或伤病数据。",
    "证据完整度描述候选池覆盖和出场样本；职责属性的数据缺口会单独列出，不代表推荐正确概率。",
    "职责权重是启发式规则，尚未使用历史数据校准；分钟数单独作为样本风险，不会加进适配分。",
    ...(requirements.maxAge !== undefined && repo.mode === "statsbomb"
      ? ["StatsBomb Open Data 不含稳定的出生日期字段；未知年龄默认不满足年龄筛选。"]
      : []),
  ];
}

function createWorkflow(repo: PlayerRepository) {
  return new StateGraph(ScoutState)
    .addNode("parse_requirements", (current: State) => ({ requirements: parseRequirements(current.input) }))
    .addNode("scout_search", async (current: State) => {
      const requirements = current.requirements as Requirements;
      const players = await repo.loadPlayers();
      return {
        allPlayers: players,
        candidates: filterEligiblePlayers(players, {
          position: requirements.position,
          maxAge: requirements.maxAge,
          includeUnknownAge: requirements.includeUnknownAge,
        }),
        datasetMode: repo.mode,
        dataSource: repo.sourceName,
      };
    })
    .addNode("statistical_analysis", (current: State) => ({
      statisticalAnalysis: current.candidates.map((player) => ({ playerId: player.playerId, per90: toPer90(player) })),
    }))
    .addNode("tactical_fit", (current: State) => ({
      tacticalFits: current.candidates.map((player) => ({
        playerId: player.playerId,
        assessments: assessRoles(current.requirements as Requirements, toPer90(player)),
      })),
    }))
    .addNode("rank_candidates", (current: State) => {
      const requirements = current.requirements as Requirements;
      const statsById = new Map(current.statisticalAnalysis.map((entry) => [entry.playerId, entry.per90]));
      const fitById = new Map(current.tacticalFits.map((entry) => [entry.playerId, entry.assessments]));
      const rankings: RankedCandidate[] = current.candidates.map((player) => {
        const per90 = statsById.get(player.playerId) ?? toPer90(player);
        const roleAssessments = fitById.get(player.playerId) ?? assessRoles(requirements, per90);
        const inPossessionFit = averageFit(roleAssessments.filter((assessment) => assessment.phase === "in_possession"));
        const outOfPossessionFit = averageFit(roleAssessments.filter((assessment) => assessment.phase === "out_of_possession"));
        const tacticalFit = averageFit(roleAssessments) ?? 0;
        const { reasons, risks } = explainFit(requirements, player, roleAssessments);
        return { player, per90, inPossessionFit, outOfPossessionFit, tacticalFit, score: tacticalFit, roleAssessments, reasons, risks };
      }).sort((a, b) => b.score - a.score).slice(0, requirements.topK);
      return { rankings };
    })
    .addNode("review_evidence", (current: State) => {
      const requirements = current.requirements as Requirements;
      const candidates = current.rankings;
      const wellSampled = candidates.filter((candidate) => candidate.player.minutes >= 900).length;
      const evidenceCoverage = candidates.length ? wellSampled / candidates.length : 0;
      const poolCoverage = Math.min(1, candidates.length / requirements.topK);
      const evidenceCompleteness = Math.round((0.65 * evidenceCoverage + 0.35 * poolCoverage) * 100) / 100;
      const findings: string[] = [];
      if (current.allPlayers.length === 0 && repo.mode === "statsbomb") {
        findings.push("没有读取到 StatsBomb 球员记录；请检查数据目录和 JSON 文件是否完整。");
      }
      if (current.allPlayers.some((player) => player.eventDataComplete === false)) {
        findings.push("部分阵容记录缺少对应比赛事件文件；这些记录不会参与表现排序。");
      }
      if (candidates.length === 0) findings.push("没有候选人满足当前筛选条件。");
      if (requirements.maxAge !== undefined && repo.mode === "statsbomb" && current.allPlayers.some((player) => player.position === requirements.position && player.age === null)) {
        findings.push("有位置符合的球员年龄未知并被排除；StatsBomb 开放数据不含出生日期，请配置人口信息 sidecar。");
      }
      if (evidenceCoverage < 1 && candidates.length > 0) findings.push("部分候选人的出场样本少于 900 分钟。");
      if (candidates.some((candidate) => candidate.player.age === null)) findings.push("部分候选人年龄未知；请核实年龄后再用于引援决策。");
      if (repo.mode === "demo") findings.push("当前使用虚构演示数据；结论不能用于真实球探判断。");
      return { review: { evidenceCompleteness, evidenceCoverage, findings, retryRecommended: evidenceCompleteness < 0.55 && current.retryCount < 1 } };
    })
    .addNode("refresh_data", async (current: State) => {
      const players = await repo.loadPlayers(true);
      const requirements = current.requirements as Requirements;
      return {
        allPlayers: players,
        candidates: filterEligiblePlayers(players, {
          position: requirements.position,
          maxAge: requirements.maxAge,
          includeUnknownAge: requirements.includeUnknownAge,
        }),
        retryCount: current.retryCount + 1,
      };
    })
    .addNode("create_report", (current: State) => {
      const requirements = current.requirements as Requirements;
      const review = current.review ?? {
        evidenceCompleteness: 0,
        evidenceCoverage: 0,
        findings: ["Reviewer did not produce a result."],
        retryRecommended: false,
      };
      return {
        report: {
          targetTeam: requirements.targetTeam,
          requirements,
          dataSource: current.dataSource,
          datasetMode: current.datasetMode,
          candidates: current.rankings,
          review,
          caveats: buildCaveats(requirements, repo),
        },
      };
    })
    .addEdge(START, "parse_requirements")
    .addEdge("parse_requirements", "scout_search")
    .addEdge("scout_search", "statistical_analysis")
    .addEdge("scout_search", "tactical_fit")
    .addEdge(["statistical_analysis", "tactical_fit"], "rank_candidates")
    .addEdge("rank_candidates", "review_evidence")
    .addConditionalEdges("review_evidence", (current: State) => current.review?.retryRecommended ? "refresh" : "end", {
      refresh: "refresh_data",
      end: "create_report",
    })
    .addEdge("refresh_data", "statistical_analysis")
    .addEdge("refresh_data", "tactical_fit")
    .addEdge("create_report", END)
    .compile();
}
