# Wyscout 地面防守对抗证据

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

让防守球员的评估能引用来源定义明确的地面防守对抗样本，同时保留 Wyscout 简化结果标签的限制。

## Research basis

Wyscout v2 将 `Duel – Ground defending duel` 定义为独立子事件，事件记录包含球员、球队、位置与标签。标签 703/701/702 分别为明确胜出、明确失利和中性。Wyscout 当前词典说明这是一种较简单的 outcome 算法：下一动作属于对抗双方之一时记一方明确胜出、对方明确失利，否则记中性。因此明确胜出占比必须把中性结果留在分母，不能称作抢断成功率或一般对抗胜率。详见 [Wyscout v2 事件文档](https://support.wyscout.com/matches-wyid-events) 与 [防守对抗词典](https://dataglossary.wyscout.com/defensive_duel/)。

## Acceptance criteria

- [x] 增加 Wyscout 专属的地面防守对抗次数/90 和明确胜出占比证据；保留子事件、结果标签、定义、样本分钟/场次与历史来源。
- [x] 明确胜出占比的分母包括明确失利与中性结果；报告不能将其改述为抢断成功率、标准对抗胜率或夺回球权次数。
- [x] 只使用完整事件样本及每个地面防守对抗恰好一个 701/702/703 标签；结果不完整时不输出补充指标。
- [x] 新指标只进入 LangGraph 可引用证据和报告展示，不进入现有职责评分。
- [x] README、CONTEXT、Agent 指令与 issue map 保持同一口径。

## Answer

已新增地面防守对抗次数/90 与明确胜出占比两个 Wyscout 补充指标。Provider 只统计 `Duel – Ground defending duel`；每条事件必须恰好带一个标签 701/702/703，任一结果缺失或冲突时会省略该球员的这组指标。明确胜出占比用标签 703 除以全部已分类事件，分母保留 701 失利和 702 中性结果。来源定义、事件字段、单位和样本通过现有 supplementary evidence 通道传入 Agent 与报告；职责评分未引用这些字段。

API TypeScript 构建、Web TypeScript/Vite 生产构建和 `git diff --check` 通过；本轮未运行自动化测试。

## Comments

- 2026-10-04：按 Wyscout 官方 event taxonomy 和 defensive-duel glossary 实现事件筛选与标签限定；报告明确这组标签是简化 outcome 分类，不能代替抢断成功率或球员完整防守能力判断。
