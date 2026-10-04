import type { DatasetMode, DatasetScope, DatasetSnapshotStatus, PlayerProfile } from "./schemas.js";

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
  curated: {
    kind: "historical_sample",
    title: "TactiScout 自建球探数据集 · 历史样本",
    summary: "由带来源指纹的 Wyscout 2017/18 比赛事件，通过版本化规则生成球员赛季指标。",
    limitations: ["这份历史样本不代表现役球员、当前俱乐部或转会市场。", "派生指标沿用 TactiScout 公开的字段定义和计算假设；缺失数据保持不可用。", "估算出场分钟不含补时，也未校正红牌等特殊情况。"],
  },
  fbref: {
    kind: "current_limited",
    title: "FBref 五大联赛当前赛季表现记录",
    summary: "从 FBref 当前五大联赛球员统计页读取有出场记录的球员；这是赛季表现池，不是完整注册名单。",
    limitations: [
      "只覆盖英超、西甲、德甲、意甲和法甲页面中有表现记录的球员；不代表全球完整转会市场或球队完整注册阵容。",
      "年龄根据球员出生日期按抓取日期计算；来源页面的球队、赛季与统计可能滞后或不完整。",
      "仅使用当前页面确实提供的基础、传球、防守和持球字段；缺失指标不按零值处理。",
      "位置未知的记录与没有单一球队归属的来源记录不会进入候选筛选。",
      "不包含可靠的身价、合同、预算、伤病史或转会可行性信息；当前高级足球统计覆盖有限。",
    ],
  },
};

export function describeDatasetScope(
  mode: DatasetMode,
  players?: readonly Pick<PlayerProfile, "competition" | "season" | "datasetId" | "datasetBuiltAt">[],
  datasetSnapshot?: DatasetSnapshotStatus | null,
): DatasetScope {
  const scope = datasetScopes[mode];
  const recordDataset = players?.find((player) => player.datasetId);
  const datasetId = datasetSnapshot?.datasetId ?? recordDataset?.datasetId;
  const datasetBuiltAt = datasetSnapshot?.builtAt ?? recordDataset?.datasetBuiltAt;
  const observedCoverage = players ? {
    playerRecordCount: players.length,
    competitions: [...new Set(players.map((player) => player.competition))].sort((left, right) => left.localeCompare(right)),
    seasons: [...new Set(players.map((player) => player.season))].sort((left, right) => left.localeCompare(right)),
  } : undefined;
  return {
    ...scope,
    limitations: [...scope.limitations],
    ...(datasetId ? { datasetId } : {}),
    ...(datasetBuiltAt ? { datasetBuiltAt } : {}),
    ...(observedCoverage ? { observedCoverage } : {}),
  };
}
