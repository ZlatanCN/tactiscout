# 招募案件 checkpoint 跨重启恢复

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

让暂停等待用户补充的 LangGraph 招募案件在 Fastify 进程重启后，仍能从同一 `thread_id` 恢复；保持招募计划与报告快照继续由浏览器 `localStorage` 保存。

## Public seam and invariants

- 端到端验收通过 `POST /api/v1/recruitment/cases/:caseId/turns`，不依赖 LangGraph 私有节点或直接读 SQLite 表。
- 生产默认应用组合使用本机 SQLite checkpointer；测试仍可注入 `MemorySaver` 或其他 `BaseCheckpointSaver`。
- 进程重启后，用户对已有案件回答时必须恢复暂停图并保留候选、评估和待回答问题上下文；缺失案件仍按既有 409 过期状态处理。
- 同一进程内同一 `thread_id` 的轮次串行执行，不同案件可以并行。
- 默认数据库存于 Git 忽略的 `.data/`，并允许通过 `TACTISCOUT_CHECKPOINT_PATH` 指定本机路径；应用关闭时释放自建连接。
- 不改变前端计划存储，不引入账户或云端同步。

## Acceptance criteria

- [x] SQLite checkpointer 与当前 LangGraph JS 版本兼容，且 SQLite 只保存图执行状态。
- [x] 真实子进程测试：进程 A 调查并追问、退出；进程 B 使用相同数据库和案件 ID 回答后恢复原调查并产出有证据报告。
- [x] 同一案件的并发轮次在同进程内串行；不同案件可以并行。
- [x] Fastify 生命周期关闭自建 SQLite 连接；外部注入的 conversation/checkpointer 仍由调用方管理。
- [x] 默认数据库路径与环境变量覆盖行为可验证，数据库不会进入 Git。
- [x] 全部现有对话/证据约束测试保持通过；TypeScript 后端和网页构建通过。

## Adversarial review questions

- 暂停节点在 resume 时重跑，是否会重复追加历史、重复计数或执行其他副作用？
- 两个并发请求是否会同时从同一 checkpoint 读取并覆盖对方的状态？锁是否只影响同一个 thread？
- 文件损坏、路径无权限或旧 thread 不存在时是否清晰失败，而不是静默从空状态重新开案？
- 当前本机单进程 SQLite 部署假设是否被写清？未来多进程部署不能误认为进程内锁提供分布式互斥。
- `.data` 文件、对话内容和候选数据是否可能泄露到 Git 或日志？

## Comments

- 2026-10-03：根据 LangGraph 官方 checkpointer 与 interrupt 文档，以及公开实现调研，决定先验证 Fastify 直接运行 StateGraph 的本地 SQLite adapter；Agent Server 的托管存储不属于当前运行模式。

## Answer

新增本机 SQLite `SqliteSaver` 并由默认 Fastify app 组合注入 graph。默认路径为 `.data/recruitment-cases.sqlite`，可用 `TACTISCOUT_CHECKPOINT_PATH` 覆盖；Fastify 关闭时释放 app 自建连接。测试注入的 checkpointer / conversation 仍由调用方管理。每个 thread 的 turn 在进程范围内串行，锁仅按案件 ID 隔离。

端到端测试启动两个独立 Node 子进程：第一个经 Fastify 调查并暂停，退出时关闭连接；第二个打开同一个 SQLite 文件，用同一案件 ID 回答并恢复出引用 `goals` 指标证据的报告。另有路径、连接关闭、同案串行和跨案并行测试。计划快照仍单独保存在浏览器 `localStorage`。
