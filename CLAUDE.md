# Jadu — Gardening Assistant

## What this is

A CLI gardening assistant powered by Claude. Uses the Claude API with a **manual agentic loop** (no SDK abstractions) to manage garden data (plants, seeds, plantings) and notes via SQLite.

This is a learning project — the goal is deep understanding of agent architecture, not just a working product.

## Commands

- `jadu` — run the assistant (installed globally via `npm link`)
- `npm start` — run from the project directory
- `npm test` — run all tests (vitest)
- `npm run test:watch` — run tests in watch mode

## Architecture

```
CLI REPL (index.ts)
  → Agent Loop (agent.ts) — streams response, renders markdown
    → Tool Registry (tools/registry.ts)
      → Custom Tools (tools/database.ts, tools/date.ts)
      → Built-in Tools (web_search, code_execution — server-side)
    → SQLite Database (db/connection.ts, db/schema.sql)
    → Markdown Renderer (markdown.ts)
```

- **agent.ts** is the core — the agentic loop that sends messages to Claude, dispatches tool calls, feeds results back, repeats until done. Streams text to stdout in real-time, then replaces with rendered markdown on completion using ANSI cursor save/restore.
- **markdown.ts** renders markdown for terminal display using `marked` + `marked-terminal`. Downgrades h1 to h2 to prevent centered first headings.
- **tools/registry.ts** maps tool names → handlers and generates tool definitions for the API
- **tools/database.ts** has 3 tools: `query_database` (SELECT only), `execute_database` (INSERT/UPDATE/DELETE only, rejects DROP/ALTER/CREATE), `list_tables` (schema discovery)
- **tools/date.ts** has `get_current_date`
- **db/connection.ts** opens SQLite with `PRAGMA foreign_keys=ON` and `journal_mode=WAL`, runs schema.sql on startup
- **config.ts** has model settings (`claude-opus-4-6`), system prompt, and API key validation

## Database

4 tables: `notes`, `plants`, `seeds`, `plantings`. Schema is in `src/db/schema.sql`. Database file lives at `~/.jadu/jadu.db` (created automatically on first run).

- `plants` = reference catalog (germination days, harvest days, sun/water needs)
- `seeds` = inventory (what seeds you have, planting windows as MM-DD)
- `plantings` = garden log (what was planted, expected/actual dates, status)
- `notes` = agent scratchpad for things that don't fit elsewhere (soil tests, garden layout ideas, observations)

## UX

- **Streaming** — text appears token-by-token as Claude generates it
- **Markdown rendering** — once the response is complete, raw text is replaced with formatted markdown (bold, lists, headings, code blocks) using cursor save/restore
- **Tool call indicators** — dimmed `↳ tool_name` lines on stderr show which tools are being called
- **Error display** — tool errors shown inline, also sent back to Claude for self-correction

## Key design decisions

- Reads (`query_database`) and writes (`execute_database`) are separate tools — this makes the permission boundary explicit
- The agent discovers the schema via `list_tables` rather than having it baked into the system prompt
- History is append-only and persists across `run()` calls for multi-turn conversation
- Assistant response is appended to history BEFORE processing tools (preserves tool_use/tool_result matching)
- Server-side tools (web_search, code_execution) are declared but NOT dispatched by us — Anthropic handles them
- Tool errors are sent back with `is_error: true` so Claude can self-correct
- Markdown rendering is in a separate module (`markdown.ts`) so it can be mocked in tests

## Adding a new tool

1. Create a handler function in `src/tools/`
2. Create a `registerXTools(registry)` function that calls `registry.register()`
3. Call the register function in `src/index.ts`
4. Write tests

## Planned next steps

- Conversation persistence across sessions
- Conversation compaction for long sessions
