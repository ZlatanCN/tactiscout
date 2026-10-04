# Reep 跨来源身份注册表

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

使用 Reep 官方 CC0 release 中的精确 provider-ID bridges，为现有足球数据来源建立本地、可追溯的跨来源身份映射；不把球员表现记录合并，也不让姓名成为身份凭据。

## Scope

- 由运营人手动下载并核对 `bridges.csv.gz` 与 `redirects.csv.gz`；工具不联网下载、不调用 Reep API、不要求 API key。
- 导入时只保留已知球员 provider/namespace 的 ID bridge，按发布 stamp 建立可替换的本地 SQLite 索引。
- 依据 provider、namespace 与 external ID 精确解析；跟随 `merged` redirects。`de_corroborated`、`withheld` 和多目标映射不得成为可用规范身份。
- 保留原始 provider ID、映射到的 Reep ID、rung、upstream status、release stamp 与同一身份的其他 provider bridges。
- 不按名称回退，不修改 `PlayerProfile`，不合并来源记录，不将注册表数据发送给 LLM 或纳入能力评分/排序。

## Acceptance criteria

- [x] TypeScript 模块提供只读、本地 resolver 和可审计结构化结果。
- [x] 流式 gzip CSV importer 验证字段与 redirect 规则，写入临时数据库后原子替换目标索引；错误时旧索引仍可用。
- [x] CLI 可导入快照并按精确 source key 查询；未知 provider、无命中、歧义、撤销、隐藏、未发布目标与合并状态可区分。
- [x] README、`CONTEXT.md`、map 与数据目录说明明确列出手动下载、校验、更新和身份边界。
- [x] API 与 web TypeScript 构建、`git diff --check` 通过；官方 `20261003T052950Z` bridges/redirects 文件已校验并实际导入，原始文件和索引留在 Git 忽略的 `.data/`。

## Research basis

- [Reep 下载与 release 说明](https://reep.football/data/)：bridge CSV 为 CC0；发布按周更新；官方建议导入本地存储并跟进 redirects。
- [Reep 使用指南](https://reep.football/get-started/)：bridge key 是 `(provider, namespace, external_id)`，external ID 是文本；bridges 还包含 `rung`；redirects 包含合并和 tombstone 语义。
- [Reep release schema](https://data.reep.football/releases/20261003T052950Z/schema.json)：`bridges` 含 `provider, namespace, external_id, reep_id, rung, upstream_status`；`redirects` 含 `from_id, to_id, reason`。2026-10-03 snapshot 另有 `target_not_published` 空目标 tombstone，不能当作正常 mapping。
- 项目领域边界见 `CONTEXT.md` 的“数据来源身份”和“跨来源身份映射”。

## Answer

新增 `src/identity/` 下的 Reep 本地 registry、流式 gzip CSV 导入器和 CLI。导入器只索引 TactiScout 四种现有 player namespace，将 merged redirects 规范化，保留 rung/upstream status/release stamp；`de_corroborated`、`withheld`、`target_not_published`、多目标和空结果均不会伪装成可用身份。resolver 按 provider、namespace、原始 external ID 精确查询并只读打开 SQLite；没有姓名回退，也不修改或拼接 `PlayerProfile`。

README 补充了手动下载、校验 checksum、导入、按来源 ID 查询和索引路径设置。官方 `20261003T052950Z` release 的 bridges/redirects CSV checksum 已通过；项目索引保存 636,480 条支持的 bridge rows 与 2,007 条 redirects。对一条真实 Sportmonks → Reep → Wyscout ID 完成了本地历史样本 smoke；它不代表 provider/API 覆盖率。`pnpm build`、`pnpm build:web` 和 `git diff --check` 通过，没有运行测试。
