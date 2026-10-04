# Issue 37: FBref 访问拒绝时确定性结束调查

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: none

## Goal

把 FBref 的 HTTP 403/429 作为 LangGraph 的明确数据源故障处理，防止模型把访问失败误解为“没有符合条件的球员”，或继续重复查询、提出无关追问。

## Scope

- 仅对 FBref 的 `blocked`、`rate_limit` 错误触发确定性结束。
- 已调查步骤出现来源拒绝后，直接生成空候选报告，明确写出无法读取数据且不代表零匹配。
- 报告限制中保留 provider 错误信息；不把错误当成候选搜索成功，不扩大或放宽用户条件。
- 新的案件轮次清除前一轮来源错误；其他 provider 的既有错误处理不变。

## Acceptance criteria

- 一旦 FBref 工具返回 `blocked` 或 `rate_limit`，本轮不再调用 planner、候选搜索、评估或追问。
- 用户收到明确的来源错误文案，报告推荐为空，限制说明保留错误详情。
- 该代码路径不会访问 FBref 或通过换代理、伪装 UA、浏览器 cookie 等方式绕过访问拒绝。
- 前后端生产构建通过。

## Related

- [FBref 当前球员数据源](36-fbref-current-big5-provider.md)

## Comments

- 2026-10-04：根据一次 live provider 请求得到 HTTP 403 的运行证据，开始补强 LangGraph 故障路径。
- 2026-10-04：FBref 的 `blocked`/`rate_limit` 现在由 `choose_next_action` 确定性终止，不再调用 planner；生成空报告并明确区分“来源无法访问”和“零匹配”。新案件轮次会清除错误状态。前后端生产构建与 `git diff --check` 通过。
