# 使用全 TypeScript 和 LangGraph 组织球探流程

Type: grilling
Status: resolved
Labels: wayfinder:grilling

## Question

TactiScout MVP 应采用什么语言和工作流架构，才能作为可讲解的 Agent 项目，同时保持前后端一致？

## Answer

继续全 TypeScript。React + TypeScript 提供工作台，Fastify 承载服务端能力，LangGraph 用有状态节点与条件流组织需求解析、球员筛选、统计分析、战术适配和证据审查。LangGraph 用于表达需要状态流转的流程；数值筛选和评分由确定性代码完成。

## Comments
