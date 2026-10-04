import type { DatasetMode, DatasetScope, PlayerProfile } from "./schemas.js";

const datasetScopes: Record<DatasetMode, DatasetScope> = {
  demo: {
    kind: "fictional_demo",
    title: "虚构演示数据",
    summary: "这份数据只用于体验工作流和界面，不对应真实职业球员。",
    limitations: ["不能据此判断真实球员能力、现役效力或转会适配。"],
  },
  statsbomb: {
    kind: "historical_sample",
    title: "StatsBomb 历史比赛样本",
    summary: "来自本机已提供的 StatsBomb Open Data 赛事与赛季。",
    limitations: ["只覆盖本机文件中的比赛和赛季，不代表完整现役阵容或当前球员市场。", "评估只使用数据文件实际记录且当前 adapter 支持的指标。"],
  },
  sportmonks: {
    kind: "current_limited",
    title: "Sportmonks 配置赛季球员池",
    summary: "根据服务器配置的赛季和 Sportmonks 账户权限读取球队名单与赛季统计。",
    limitations: ["候选范围只包含已配置且账户已开通的赛事与赛季，不代表全球完整球员市场。", "只有账户确认覆盖的统计指标才参与评估；真实覆盖需按账户和赛季核验。"],
  },
  skillcorner: {
    kind: "historical_sample",
    title: "SkillCorner 历史聚合样本",
    summary: "当前适配的是 2024/25 澳大利亚 A-League 球员聚合样例。",
    limitations: ["这不是当前转会市场或欧洲联赛候选池。", "跑动和传球指标保留来源定义、单位与样本范围，不代表完整球员能力。"],
  },
  wyscout: {
    kind: "historical_sample",
    title: "Wyscout 2017/18 历史比赛样本",
    summary: "基于本机提供的 Wyscout 历史赛事文件和所选赛事过滤条件。",
    limitations: ["历史球队、年龄和表现不能证明球员当前效力、年龄或引援可行性。", "估算出场分钟不含补时，也未校正红牌等特殊情况。"],
  },
};

export function describeDatasetScope(
  mode: DatasetMode,
  players?: readonly Pick<PlayerProfile, "competition" | "season">[],
): DatasetScope {
  const scope = datasetScopes[mode];
  const observedCoverage = players ? {
    playerRecordCount: players.length,
    competitions: [...new Set(players.map((player) => player.competition))].sort((left, right) => left.localeCompare(right)),
    seasons: [...new Set(players.map((player) => player.season))].sort((left, right) => left.localeCompare(right)),
  } : undefined;
  return {
    ...scope,
    limitations: [...scope.limitations],
    ...(observedCoverage ? { observedCoverage } : {}),
  };
}
