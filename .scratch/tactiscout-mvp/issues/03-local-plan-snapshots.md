# 在 localStorage 保存招募计划和最近分析快照

Type: grilling
Status: resolved
Labels: wayfinder:grilling

## Question

第一版是否需要数据库，保存招募计划时要保留哪些内容，分析结果如何更新？

## Answer

第一版把招募计划保存在浏览器 localStorage，不因服务端存在就引入数据库。保存计划时也保留最近一次分析快照，包含候选名单、排序、依据、风险与分析时间；用户手动重新分析后更新快照，不做自动调度。

## Comments
