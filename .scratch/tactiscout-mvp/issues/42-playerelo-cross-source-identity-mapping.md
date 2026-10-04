# 验证 PlayerElo 的跨来源身份映射

Type: research
Status: resolved
Labels: ready-for-agent
Blocked by: none

## Question

Can a maintained Reep release safely map the current TactiScout candidate providers to the API-Football player IDs used by PlayerElo, with enough documented coverage and identity status to attach report-only signals without matching by name?

Investigate primary sources and local importer behavior. Record the exact namespaces, bridge statuses, redirect handling, release/version requirements, and any verified mapping coverage available in this workspace. Distinguish provider documentation from actual local/live coverage. Recommend the smallest safe implementation seam; do not enable PlayerElo or infer permission to display/store/process its data.

## Answer

已确认存在文档支持的精确路径：当前球员来源 ID → Reep canonical ID → `api_football/player` ID → PlayerElo `player_id`。PlayerElo 官方说明其 ID 与 API-Football ID 相同；Reep 的本地 release 可按 provider、namespace 和原始文本 ID 精确桥接，并跟随 merged redirect。Reep bridge-only 来源用于系统间 join，不代表独立佐证；没有唯一桥接、canonical 身份异常或上游记录缺失时必须跳过，不能按姓名回退。完整一手资料与限制见[研究记录](../research/playerelo-reep-exact-identity-crosswalk-2026-10.md)。

本机固定 Reep release `20261003T052950Z` 的 CSV join 统计显示，当前自建 Wyscout 2017/18 快照中 2,561 个不同球员 ID 有 2,375 个（92.7%）可精确映射到唯一 API-Football ID，155 个没有目标 bridge，31 个没有可解析的 Wyscout→Reep 映射。零个映射歧义；这只证明本地静态 ID crosswalk 覆盖，不表示 PlayerElo API 中存在记录或允许展示/保存/模型处理其值。研究未调用 PlayerElo/Reep 在线 endpoint；无凭据及许可证据。

实现决策：扩展 Reep importer 加载 `api_football/player`，为 resolver 增加唯一 linked bridge 查询，并把返回 ID 直接交给现有 `PlayerEloClient.getPlayer(id)`；覆盖报告应把两跳映射与 provider 记录命中分开。研究没有打开 PlayerElo 功能开关。下一步仍须保持展示和本机保留 gate 默认关闭。
