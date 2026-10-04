# PlayerElo 与 Reep 的跨来源身份映射

核查日期：2026-10-04。核对 Reep、PlayerElo 官方页面与工作区 Reep 索引；没有 PlayerElo 或 Reep API key，因此没有在线逐球员查询。本记录只讨论身份关联，不推定 PlayerElo 数据的展示、缓存、保留或模型处理许可。

## 结论

**存在有文档依据的精确两跳桥接路径：** TactiScout 来源 ID → Reep canonical ID → `api_football/player` ID → PlayerElo `player_id`。PlayerElo 明确说明其球员 ID 与 API-Football ID 相同；Reep 则把各来源的 `(provider, namespace, external_id)` 映射到同一个 Reep ID，并可从该 ID 取回另一来源的桥接 ID。[PlayerElo API 文档](https://playerelo.football/api-access) · [Reep 获取数据与 ID 桥接指南](https://www.reep.football/get-started/)

这证明的是**可精确连接的路径，不是完整覆盖率**。只有来源 ID 与 API-Football ID 同时存在于同一条已发布 Reep 身份上才可连接。Reep 明确说明跨来源覆盖不会达到 100%；公开 coverage 的 provider 行数不是两两交集统计。因此，对没命中的候选只能记为“无桥接”，不能回退到姓名匹配，也不能声称所有候选均有 PlayerElo 对照。[Reep 跨来源覆盖说明](https://www.reep.football/get-started/) · [Reep provider coverage](https://www.reep.football/coverage/)

## 官方来源已确认的结构

- PlayerElo 文档给球员返回 `player_id`，支持 `/v1/players/{id}`；其官方 FAQ 说明这些 ID 与 API-Football 使用的 ID 相同。[API schema 示例](https://playerelo.football/docs) · [ID 兼容说明](https://playerelo.football/api-access)
- Reep 官方命名空间表列出：`sportmonks/player`、`wyscout/player`、`statsbomb/offline_player`、`skillcorner/player`、`api_football/player`。ID 以文本保存；需保留前导零及原样字符串，不可转成数字再比较。[Reep namespaces 与 crosswalk 查询](https://www.reep.football/get-started/)
- Reep 将 API-Football、SkillCorner、Sportmonks、StatsBomb 标为 bridge-only，将 Wyscout 标为 independent source。bridge-only 可作跨系统 join，但不构成独立身份佐证。公开 coverage 页当前展示的 release stamp 为 `2026-09-26 14:55Z`，而本机下载快照为 `20261003T052950Z`；该网页汇总数不能冒充较新本地 release 的计数，也不能当作任意来源之间的匹配率。[Reep 当前 coverage 与 provider roles](https://www.reep.football/coverage/) · [下载与版本说明](https://www.reep.football/get-started/)
- 离线 release 可下载全量 bridges，无需 API key，按 release stamp 固定；Reep 称 release 每周发布，合并后的旧 Reep ID 需通过 redirects 指向 survivor，再重算映射。[Reep 下载与版本说明](https://www.reep.football/data/) · [版本与 redirects 指南](https://www.reep.football/get-started/) · [ID stability policy](https://www.reep.football/id-policy)

## 本机索引验证

最初检查时 `.data/reep/identity.sqlite` 只有 636,480 条 bridge rows，因为 importer 尚未收录 API-Football namespace。完成实现后，使用同一 release 重建本机索引，共 791,122 条球员 bridge rows：SkillCorner 129,183、Sportmonks 137,073、StatsBomb 26,683、Wyscout 343,541、API-Football 154,642。新增 API-Football rows 的 `upstream_status` 全为空；其他来源存在少量 `removed`/`retired` 状态。Importer 保留 bridge 的原始文本 ID、`rung`、`upstream_status` 和 redirect 解析结果。[本地 importer](../../../src/identity/import-reep-release.ts) · [provider allowlist 与 exact resolver](../../../src/identity/reep-registry.ts)

本机保留的 provider bridge 有 `name-dob`、`corroborated-mint` 等 rung；Reep handbook 指出 bridge-only provider 可用于互操作，但仍需要安全锚点和 namespace。项目将 null 或 `active` 作为可继续映射的 upstream status，其他非空值（包括 `removed`/`retired` 与未知值）不用于 PlayerElo 查询；rung 随 resolution 保留并展示，但不解释成独立身份佐证。所有 API-Football target rows 的 redirect 均解析到 canonical Reep ID。固定 release checksums 保存在本机 release 目录；未做在线 PlayerElo 请求，因此没有验证 PlayerElo 对相应 ID 有记录。[Reep handbook](https://reep.football/handbook/) · [固定 release schema](https://data.reep.football/releases/20261003T052950Z/schema.json) · [固定 release checksums](https://data.reep.football/releases/20261003T052950Z/checksums.txt)

初始 enrichment 只接受候选自身来源为 API-Football，并按精确 `player_id === sourceIdentity.playerId` 确认。完成实现后，API-Football 来源仍可直连；其他 provider 通过 Reep 的唯一有效 bridge 取得 ID，并使用 `PlayerEloClient.getPlayer(id)`。所有响应都再次核对 ID；不调用姓名搜索。[PlayerElo enrichment](../../../src/data/playerelo-enrichment.ts) · [PlayerElo signal schema](../../../src/domain/schemas.ts)

## 本机固定 release 的实际 join 覆盖

为量化这条路，直接使用本机已下载并记录为 `20261003T052950Z` 的 `bridges.csv.gz` 与 `redirects.csv.gz`，按 importer 相同的 namespace 和 merged redirect 规则构造 provider→canonical Reep ID→`api_football/player` 的 join。这里是本地静态 ID join，不调用 Reep 在线 API，也没有 PlayerElo key，因此不证明 PlayerElo endpoint 一定有对应记录。

| 输入来源 | 本地 release 中 source ID 数 | 唯一 API-Football ID | 没有 API-Football bridge | join 比例 |
| --- | ---: | ---: | ---: | ---: |
| SkillCorner `player` | 129,183 | 86,747 | 42,436 | 67.1% |
| Sportmonks `player` | 137,073 | 100,706 | 36,367 | 73.5% |
| StatsBomb `offline_player` | 26,683 | 23,084 | 3,599 | 86.5% |
| Wyscout `player` | 343,541 | 148,778 | 194,763 | 43.3% |

进一步按本机当前 TactiScout 自建快照 `tactiscout-wyscout-v1-401a88b80cc2-tactiscout-wyscout-events-v1` 的 2,561 个不同 Wyscout 球员 ID 做子集 join：2,375 个（92.7%）解析到唯一 API-Football ID；155 个有 Wyscout→Reep 身份但没有 API-Football bridge；31 个在本 release 没有可解析的 Wyscout→Reep 身份。该子集未发现多 API-Football ID 或一 API-Football ID 指向多个 Reep canonical entity。此覆盖只描述 2017/18 数据集的 ID 桥接；绝不表示 PlayerElo 当前库覆盖、现役名单完整度、球员在售状态或引援可行性。

这些计算基于本机固定 release 的 bridge 行及 source ID，不计 provider 汇总网页的异版统计。将 importer 改为包含 API-Football namespace 后，本机 resolver 对同一 2,561 个 Wyscout ID 的运行结果为：`resolved` 2,375、`target_not_found` 155、`source_not_found` 31；与直接 CSV join 一致。该运行只验证本地 identity index 和确定性 resolver，没有调用 PlayerElo。

## 已实现的最小安全 seam

扩展现有 Reep identity sidecar，而不是给 PlayerElo enrichment 增加姓名猜测：

1. Importer 在同一固定 release 中收录 `api_football/player` bridges；保留 ID 原文、rung/upstream status、release stamp 和 merged redirect 解析。
2. Resolver 只有在精确来源 ID 唯一解析到一个 canonical Reep ID、唯一的可用目标 ID 且该 API-Football ID 不指向其他 canonical 实体时才返回 ID；缺失、非当前状态和歧义都有独立状态，不按姓名回退。
3. Enrichment 将 ID 交给 PlayerElo `getPlayer(id)`，并核对响应 ID。报告区分 API-Football 直连与 Reep bridge，列出 release、canonical ID 和两侧 rung。[PlayerElo `/players/{id}` 文档](https://playerelo.football/docs)

本机静态 bridge coverage 已用最新 importer/resolver 复核；真实 PlayerElo endpoint coverage 仍待取得 API key 和确认展示/本地保留许可后验证。既有 PlayerElo feature gates 与 report-only 边界继续生效：身份 crosswalk 不代表其数值可公开展示、持久化或发送给模型。
