# Explain local API connection state in the scouting workspace

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: none

## Goal

When the scouting API is unavailable, explain that the service connection failed instead of labeling the data source as unknown. Let the user retry after starting or restoring the service.

## Why now

The web preview at `127.0.0.1:5173` is served separately from the Fastify API at `127.0.0.1:8000`. If the API is stopped, `getDatasetStatus()` rejects and the UI currently suppresses that error, showing “数据源状态未知” and “当前数据来源说明暂时不可用”。This makes a local startup issue look like missing or broken football data.

## Acceptance criteria

- The header distinguishes initial connection, connected data source, and unavailable API states.
- The empty report explains that the local scouting service is unreachable and offers a retry action.
- Retrying updates the connection state and does not fabricate a data mode or dataset scope.
- Existing connected and report states continue to render their real data source and range.
- Web production build succeeds.

## Research and evidence

- `README.md` documents that API and web preview run as separate processes.
- Reproduction: opening the web preview while port `8000` refuses connections produces the misleading unknown-source state.
- The API client currently rejects HTTP and contract errors; `App` discards all of them in its initial dataset-status effect.

## Answer

已实现三态连接状态：正在连接时显示连接提示；网络请求失败时明确显示服务端未连接；服务端返回非网络错误时显示数据状态读取失败。服务连接失败时，工作台说明需要确认本地服务并提供可重试按钮，不再把空状态写成“数据源未知”。重试期间按钮禁用并显示连接状态。

`pnpm build:web` 通过。重新打开本地工作台后，当前 API 已恢复响应；浏览器界面显示 `TactiScout 自建球探数据集 · Wyscout 2017/18`，数据范围卡加载到快照版本。当前服务在线，因此没有中断用户服务来再次触发离线状态；未运行测试。

## Comments

- 2026-10-04：复现时网页可访问但 Fastify API 不可连接；前端 `catch` 静默清空 dataset，导致“数据源状态未知”。增加显式加载/断连/状态读取失败文案及重试入口后，Web 生产构建通过。之后实际预览观察到 API 已在线并成功显示真实数据模式与快照范围。
