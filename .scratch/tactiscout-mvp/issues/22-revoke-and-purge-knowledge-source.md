# Revoke and purge indexed knowledge sources

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

Make changes to a knowledge source's storage or AI-processing permission take effect in a running app, and provide a deliberate way to remove every indexed chunk from a source whose permission was withdrawn or whose content should be corrected.

## Acceptance criteria

- Permission changes in the source registry affect the next search on the same `KnowledgeBase` instance; a cached allow decision cannot expose a revoked source.
- Search filters out ineligible source rows before lexical or vector ranking and before source text is returned to LangGraph.
- A narrow `KnowledgeBase` operation deletes all active rows for one source ID and returns a deleted-chunk count; absent tables and unknown/already-purged sources are safe no-ops.
- A local CLI command exposes the purge action without requiring the source to remain in the registry.
- Seed documents whose source has been removed or whose AI/storage permission is revoked are skipped rather than causing unrelated source searches to fail or restoring removed content.
- Deterministic LanceDB tests cover same-instance revocation, source purge, unknown source, and seed behavior.
- README and issue map distinguish immediate retrieval revocation and active-index row deletion from physical erasure of LanceDB's retained historical versions.

## Answer

已完成。每次检索重新读取来源登记，并在 lexical/vector ranking 前限定到当前允许的来源；撤权在同一个知识库实例的下一次检索生效。`KnowledgeBase.purgeSourceData` 和 `pnpm knowledge:purge-source -- <source-id>` 会从当前表版本删除来源行、返回删除数，并可在来源已撤销/移除后使用；缺表、未知来源和重复清除都是安全空操作。受限或已删除的 seed 来源会跳过，不会让其他来源搜索失败或自动补回已删除数据。

清理是当前 LanceDB 表版本的逻辑删除，不承诺擦除历史版本的物理字节。LanceDB 的旧版本清理可能影响该表其他历史快照，并且其文档警告：`deleteUnverified` 只能在能保证没有其他进程访问数据集时使用。物理清理应在明确的停机维护步骤中执行；该 CLI 不会在线触发全表版本压缩。[LanceDB OptimizeOptions](https://lancedb.github.io/lancedb/js/interfaces/OptimizeOptions/)。
