# 问题跟踪：本地 Markdown

本项目的 issue 和 spec 使用 `.scratch/` 下的 Markdown 文件管理。

## 约定

- 每个功能单独使用一个目录：`.scratch/<feature-slug>/`
- spec 路径为 `.scratch/<feature-slug>/spec.md`
- 每个实现 issue 使用单独文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号，不合并成单个 tickets 文件
- 每个 issue 文件顶部附近用 `Status:` 记录 triage 状态；角色名称见 `triage-labels.md`
- 评论和讨论历史追加在文件末尾的 `## Comments` 标题下

## 技能要求“发布到 issue tracker”时

在 `.scratch/<feature-slug>/` 下创建文件；目录不存在时一并创建。

## 技能要求“获取相关 ticket”时

读取引用的文件路径。用户通常会直接提供路径或 issue 编号。

## Wayfinder 文件约定

Wayfinder 使用一张 map 文件和每个 ticket 一个子文件。

- **Map**：`.scratch/<effort>/map.md`，正文包含 Notes、Decisions-so-far、Fog
- **子 ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号；用 `Type:` 记录 `research`、`prototype`、`grilling` 或 `task`，用 `Status:` 记录 `claimed` 或 `resolved`
- **依赖**：在文件顶部附近用 `Blocked by: NN, NN` 列出依赖。列出的文件全部为 `resolved` 后，该 ticket 才算解除阻塞
- **待处理项**：扫描 `.scratch/<effort>/issues/`，寻找状态为 open、未阻塞且未认领的文件；优先处理编号最小的
- **认领**：开始工作前将 `Status:` 改为 `claimed` 并保存
- **解决**：在 `## Answer` 下追加答案，将 `Status:` 改为 `resolved`，再把简要结论和链接追加到 map 的 Decisions-so-far
