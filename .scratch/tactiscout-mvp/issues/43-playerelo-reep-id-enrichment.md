# 通过 Reep 精确桥接查询 PlayerElo

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: 42

## Goal

对已推荐球员按精确 provider ID 查询 PlayerElo。直接来源是 API-Football 时复用其原始文本 ID；其他来源只有在固定 Reep release 中能唯一解析到有效的 `api_football/player` bridge 时才查询。结果要保留身份链路出处，不能按姓名回退。

## Acceptance criteria

- Reep importer 收录 `api_football/player`，保留原始文本 ID、release stamp、rung、upstream status 与 redirect 解析。
- Resolver 从精确来源 ID 解析到一个 Reep canonical ID 和唯一 API-Football ID；来源缺失、状态不可用、canonical 冲突、目标缺失或目标 ID 多实体时都不返回查询 ID。
- 非空的未知 `upstream_status` 保守地视为不可用；`removed`/`retired` 不进入查询。null 和 `active` 可继续，但状态和 rung 仍可在原始 resolution 中追溯。
- Enrichment 调用 `PlayerEloClient.getPlayer(id)`，并再次核对响应 ID；不再调用姓名搜索来建立球员身份。
- 报告分开统计 API-Football 直连与 Reep crosswalk 命中，展示 crosswalk release、canonical ID 和两侧 rung。此 crosswalk 只证明跨来源 ID 连接，不被描述成身份独立佐证、当前效力或转会可行性。
- PlayerElo 不进入模型、评分和排序；既有 API key、报告展示与本地留存许可 gates 保持默认关闭。无 key/许可时不声称 live API 成功。

## Related research

- [PlayerElo 与 Reep 精确身份桥接](../research/playerelo-reep-exact-identity-crosswalk-2026-10.md)
- [数据来源分层总任务](39-layered-player-evidence.md)

## Comments

- 2026-10-04：按 research issue 42 的决定实现 importer、resolver、ID endpoint enrichment 和报告 provenance。PlayerElo 在线记录和使用授权仍未验证。

## Answer

Importer 和 resolver 已实现并用 Reep `20261003T052950Z` 重建本地 SQLite 索引。固定 release 共导入 791,122 条 bridge rows，其中 API-Football namespace 154,642 条。对本机 Wyscout 2017/18 快照的 2,561 个 source ID 逐条运行 `resolvePlayerEloId`，结果为 2,375 `resolved`、155 `target_not_found`、31 `source_not_found`；无歧义项。单球员 enrichment 现在按 `getPlayer(id)` 请求，并检查响应 ID；不再使用姓名搜索。构建验证通过。

PlayerElo 未配置可用 API key，且展示/本地留存许可仍未确认；没有发起真实 PlayerElo API 请求，故 live record coverage 仍未验证。所有原有 feature gates 保持关闭。
