# TactiScout

面向足球引援研究的 TypeScript Agent。第一版把候选筛选、事件统计、规则化战术适配和证据审查串成一个可观察的 LangGraph 工作流。

## 方案与边界

- **输入**：用户可以用自然语言建立招募计划，也可以直接填写结构化字段。自然语言先解析成可编辑草稿，确认后才开始球探分析。
- **Requirement Agent**：使用兼容 OpenAI 的服务和 Zod 结构化输出解析自然语言。缺少目标球队或位置时要求用户补齐，不复用旧字段。未配置模型时仍可使用结构化表单。
- **Scout Agent**：按位置与年龄筛选本地球员数据。未知年龄默认不满足年龄上限。
- **统计分析节点**：生成每 90 分钟数据和传球成功率。
- **Tactical Fit 节点**：按有球职责和无球职责分别计算透明规则分；数据不支持的属性只展示为数据缺口。
- **Reviewer Agent**：检查候选数量和出场样本；证据偏低时有限重查一次，最终把局限写入返回结果。
- **输出**：透明排序、逐项统计、有球与无球适配、推荐依据、风险、证据完整度和数据来源。用户可选择 2–3 名候选人并排比较。
- **招募计划**：计划条件和最近一次分析快照保存在浏览器 `localStorage`，由用户手动重新分析；服务端不保存计划。

当前目标俱乐部只提供报告语境，尚未连接球队战术画像；数据也没有预算、合同、伤病或转会可行性。推进能力用带球与长传次数做代理，不能当作方向校正后的 progressive actions。分数是启发式，不是经过回测的预测模型。

证据完整度由候选池覆盖率与样本分钟覆盖率组成，不是推荐正确概率。职责权重是透明启发式，尚未经过历史数据校准。

## State / Node / Edge

```text
START
  → parse_requirements
  → scout_search
      ├→ statistical_analysis ─┐
      └→ tactical_fit ──────────┴→ rank_candidates
                                  → review_evidence
                                      ├─ evidence low → refresh_data → analyses → rank
                                      └─ otherwise → create_report → END
```

Graph State 保存原始输入、结构化需求、球员池、候选集、统计结果、战术适配分、排序结果、审查结果和有限重查次数。两个分析节点并行运行并写入各自的状态字段；Reviewer 的条件边控制是否重查。LangGraph 的 StateGraph 用共享状态组织节点和条件转移，见[官方说明](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)。

## 目录结构

```text
src/
  agent/       # 需求解析、评分与 LangGraph 流程
  data/        # 演示数据与 StatsBomb Open Data 适配器
  domain/      # Zod 输入、State 和输出结构
  app.ts       # Fastify HTTP API
  index.ts     # 服务入口
data/
  demo-players.json
web/             # React + TypeScript 界面
```

## 启动

需要 Node.js 20 或更高版本和 pnpm。安装依赖后，分别在两个终端启动 API 和网页：

```bash
pnpm install
cp .env.example .env
pnpm dev
```

API 默认监听 `http://127.0.0.1:8000`。在第二个终端启动网页：

```bash
pnpm dev:web
```

打开 `http://127.0.0.1:5173` 使用工作台。网页通过 Vite 代理访问本地 API。也可以只运行 API，并用以下请求体验：

```bash
curl -X POST http://127.0.0.1:8000/api/v1/scout \
  -H 'content-type: application/json' \
  -d '{
    "targetTeam": "Barcelona",
    "position": "CM",
    "maxAge": 23,
    "inPossessionRoles": ["progression"],
    "outOfPossessionRoles": ["pressing"],
    "topK": 5
  }'
```

## 验证

```bash
pnpm test
pnpm build
pnpm build:web
```

测试通过确定性样例检查浏览器响应契约和招募计划的本地保存行为，不需要模型密钥或 StatsBomb 数据集。

`POST /api/v1/requirements/parse` 接受 `{ "brief": "..." }`，返回待确认的结构化草稿和缺失必填项。`/health` 返回服务状态，`/api/v1/dataset` 返回当前数据模式。

自然语言解析使用服务端环境变量 `OPENAI_API_KEY`、`OPENAI_MODEL` 和可选的 `OPENAI_BASE_URL`。不要把密钥放进网页配置。未配置模型时，自然语言解析入口会说明原因，结构化表单仍可使用。

## 接入 StatsBomb Open Data

StatsBomb 开放数据由 competitions、matches、events、lineups 等 JSON 文件构成。它是部分赛事数据，不等于完整职业球员数据库；发布基于该数据的研究或分析时，请遵守 StatsBomb 使用条款并注明数据来源。[仓库说明与条款](https://github.com/hudl/open-data)

StatsBomb 的使用条款还要求发布或分享相关研究时使用其提供的品牌标识；请在公开展示前查看仓库中的最新用户协议。

将 StatsBomb Open Data 仓库放到本地后，在 `.env` 中设置：

```env
TACTISCOUT_DATA_MODE=statsbomb
TACTISCOUT_STATSBOMB_DIR=./data/statsbomb-open-data
TACTISCOUT_STATSBOMB_COMPETITION_IDS=11
TACTISCOUT_STATSBOMB_SEASON_IDS=90
```

`COMPETITION_IDS` 和 `SEASON_IDS` 是可选的逗号分隔过滤条件；上例中的数字只是格式示意，请从数据集的 `competitions.json` 与 match 文件中选择实际 ID。适配器会读取比赛、阵容和事件 JSON，统计进球、助攻、传球、长传、带球、施压、抢断、拦截和射门助攻，并按阵容记录的分钟数换算每 90 分钟数据。首轮处理全量本地数据可能较慢。

StatsBomb Open Data 没有稳定的出生日期字段。年龄筛选需要额外准备一个 JSON sidecar，并用 StatsBomb `player_id` 对齐，例如：

```json
{
  "12345": { "age": 22, "source": "football-data.org", "verifiedAt": "2026-09-29" }
}
```

设置 `TACTISCOUT_DEMOGRAPHICS_FILE=/path/to/player-demographics.json`。年龄只能在已匹配的球员上使用；没有匹配年龄时，默认排除，不会把未知当成符合条件。football-data.org 的球队资源包含 squad 和出生日期字段，可作为补充来源（[API v4 文档](https://docs.football-data.org/general/v4/team.html)）。本骨架目前读取 sidecar，尚未自动调用 football-data.org；后续接入时需要明确球员 ID 映射，不能只靠姓名模糊匹配。

## 本地计划

招募计划、用户填写的条件以及最近一次候选名单快照保存在当前浏览器。计划不会上传到服务端；清除浏览器站点数据会移除本地计划。后续可根据需要增加导出/导入或账号同步。

排序质量评估数据集和指标尚未确定。当前职责适配是可解释的规则启发式，只能作为研究辅助，不能视为球员成功率或未来表现预测。
