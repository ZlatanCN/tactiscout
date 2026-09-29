import type { KnowledgeDocumentInput } from "./schemas.js";

export const starterKnowledgeDocuments: KnowledgeDocumentInput[] = [
  {
    sourceId: "plos-soccer-analysis-2024",
    corpus: "methodology",
    title: "Professional soccer practitioners’ perceptions of performance analysis technology",
    url: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0298346",
    author: "Tia-Kate Davidson, Steve Barrett, John Toner, Chris Towlson",
    publisher: "PLOS ONE",
    publishedAt: "2024-03-07",
    license: "CC BY 4.0",
    attribution: "Davidson T-K, Barrett S, Toner J, Towlson C (2024). PLoS ONE 19(3): e0298346. https://doi.org/10.1371/journal.pone.0298346. CC BY 4.0.",
    entityIds: [],
    entityNames: [],
    competition: null,
    season: null,
    acquisition: "authored",
    content: "TactiScout 方法摘要（由项目作者根据原文撰写，不是论文原文）：论文讨论职业青训环境如何使用技术与战术表现指标。实践者认为比赛技术、战术指标有价值，能帮助球员发展和反馈；但指标要有清楚语境、易于理解，也不能取代教练与球探的经验判断。论文样本来自单一学院俱乐部，因此不能把其结论直接推广为所有球队的统一评估标准。对球探工作而言，角色职责应先拆成具体、可观察的比赛行为，再结合比赛情境解释指标；数据缺口要明确标出，不能据有限事件统计推断潜力或完整能力。",
  },
];
