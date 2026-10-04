# Document a reproducible local Ollama setup

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: none

## Goal

Let a portfolio reviewer run the local LangGraph Agent with Ollama using a small, accurate environment example, without needing a paid model API key.

## Acceptance criteria

- README documents the exact OpenAI-compatible base URL and placeholder key expected by Ollama.
- `.env.example` points to the local Ollama example and keeps real provider credentials out of source control.
- README describes how to select the historical curated snapshot without referring to one developer's current `.env`.
- Ollama configuration facts link to official documentation.

## Answer

README and `.env.example` now include the local Ollama configuration (`ollama` placeholder key, local `/v1/` base URL, and model name). The historical curated-mode instructions are now reusable setup steps rather than a statement about a particular local `.env` file. Ollama's official compatibility documentation confirms this client shape and that the local server ignores the placeholder key.

## Comments

- 2026-10-04：依据 Ollama 官方 OpenAI compatibility 文档核实 `http://localhost:11434/v1/` 与 `api_key="ollama"`，并写入 README 的可复现设置示例。
