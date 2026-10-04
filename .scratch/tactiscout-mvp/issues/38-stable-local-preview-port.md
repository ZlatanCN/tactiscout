# 本地网页预览固定端口

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: none

## Goal

开发服务器若遇到端口占用，不应静默切换到旧预览，导致使用者看到过期的前端契约或数据源状态。

## Scope

- Vite 开发服务器固定绑定 `127.0.0.1:5173`。
- 端口占用时明确失败，不自动选择 5174 等替代端口。
- 将 host/port 设置集中在唯一的 Vite 配置文件中，并在 README 说明。

## Acceptance criteria

- 启动网页预览后，唯一预期地址是 `http://127.0.0.1:5173/`。
- API 同源代理仍指向本机 8000 端口。
- 网页生产构建通过。

## Comments

- 2026-10-04：实际检查发现 5173 与 5174 同时运行同一项目的 Vite 服务；5173 提供旧 schema 并将 `fbref` 状态显示为未知，5174 提供当前 schema。重启 5173 后 UI 正确显示 FBref。已将开发服务器改为固定端口并启用 `strictPort`，避免之后静默切换预览地址。
