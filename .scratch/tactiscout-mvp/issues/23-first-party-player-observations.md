# Add first-party player observations

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

让球探或项目作者能记录自己有权使用的具名球员观察，并作为带来源的定性线索供 TactiScout 检索；不把观察直接转换成能力分，也不抓取第三方报告全文。

## Acceptance criteria

- A user can create, view, edit, and delete a first-party observation without downloading or scraping an external report.
- Each observation records a canonical player identity, observation author, observed-at date, match/competition/season when known, timestamp or concrete evidence note, strengths, risks, source reference, and explicit permission for persistent storage and model processing.
- Observations that have not opted into model processing never enter retrieval context; unsupported observations remain labeled as subjective scouting evidence.
- Search results preserve author, source, date, player identity, and attribution through the existing evidence/report flow.
- Revoking model/storage permission removes the observation from active retrieval and supports source/record deletion.
- The UI clearly distinguishes authored observation from verified match statistics and model inference.
- Deterministic tests cover validation, permission gating, edit/delete, and provenance in search results.
- README, CONTEXT, and issue map describe the workflow and its storage boundary.

## Answer

已完成。新增工作台“球探观察”弹窗，可以创建、浏览、编辑和删除观察记录。每条记录包括球员姓名/别名、可选 provider 与球员 ID、观察者、日期、赛事/赛季/比赛/分钟、优势、风险、具体场景说明和可选 HTTPS 参考链接；链接仅作出处展示，不会被访问或抓取。

Fastify 提供 `GET`、`POST`、`PUT`、`DELETE /api/v1/player-observations` 路由。本机 JSON 文件默认在忽略提交的 `.data/player-observations.json`，可通过 `TACTISCOUT_PLAYER_OBSERVATIONS_PATH` 更改。创建与编辑都要求明确授权本地持久化；AI/RAG 处理单独授权并默认关闭。拒绝 AI/RAG 时内容只保存在本机，不进入球员报告语料。撤回 AI 权限会先从当前 LanceDB 表版本移除该记录；撤回本地保存权限会删除本机记录及当前索引文档。

API 默认只绑定本机回环地址，不开放反射式 CORS；Host、Origin 与 Fetch Metadata 检查会拒绝非本机网页读取私人观察记录或向本机服务发送跨站请求。Vite 本机代理来源通过该检查。

观察索引进入现有 `player_report` 检索和报告证据链，保留作者、日期、球员实体 ID/姓名、出处和署名。文档一旦声明实体 ID，就必须按来源和 ID 匹配；ID 不匹配时不再使用姓名回退。文档没有实体 ID 时，只有文档所列姓名对应本轮唯一一位候选的规范化完整姓名才允许关联，不做子串猜测；若别名与另一位候选姓名冲突也会跳过关联。结果清楚标记“自录、主观、未经独立核实”；不将它折成能力分。工作台弹窗支持键盘关闭与焦点限制。

新增确定性测试覆盖 schema/API 授权、创建/更新/撤回/删除、真实 LanceDB 检索归因与撤权后立即不可检索；另模拟索引写入后进程中断，确认保存的确定性文档 ID 仍能用于删除。前后端类型构建与全量测试通过。

边界：JSON 文件库与案件 checkpoint 相互独立，面向单机单 API 进程，不适合多个实例共享。撤权会删除当前 LanceDB 表版本中的索引行，但 LanceDB 保留的历史数据集版本字节不保证物理擦除；README 记录了停止服务后维护清理的要求。
