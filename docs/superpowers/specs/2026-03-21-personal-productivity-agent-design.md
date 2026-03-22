# Personal Productivity Agent — Design Spec

## Overview

A CLI-based tool-calling agent built with TypeScript that manages personal productivity data (habits, notes, and a garden management system) through a SQLite database. The agent uses the Claude API with a manual agentic loop — no high-level frameworks — to maximize understanding of how tool-calling agents work.

The garden system is the flagship feature: the agent tracks your seed inventory, knows ideal planting windows, checks weather forecasts via web search, and generates weekly reports recommending what to plant and when.

## Goals

- Build a functional personal productivity agent
- Deep understanding of the agentic tool-calling loop
- Learn tool design, prompt engineering, and conversation management

## Architecture

Four layers:

```
┌─────────────────────────────┐
│         CLI REPL            │  ← readline loop, user input/output
├─────────────────────────────┤
│       Agent Loop            │  ← sends messages to Claude, dispatches tools,
│                             │    feeds results back, repeats until done
├─────────────────────────────┤
│       Tool Registry         │  ← maps tool names → implementations,
│                             │    generates tool definitions for the API
├─────────────────────────────┤
│     Tools                   │
│  ┌────────┐ ┌────────────┐  │
│  │ SQLite │ │ Built-in   │  │  ← custom SQL tools + server-side tools
│  │ Tools  │ │ (web search│  │    (web search, code execution)
│  │        │ │  code exec)│  │
│  └────────┘ └────────────┘  │
├─────────────────────────────┤
│       SQLite Database       │  ← habits, notes, seeds, plants, plantings
└─────────────────────────────┘
```

### Data Flow (One Turn)

1. User types a message in the CLI
2. Agent loop sends conversation history + tool definitions to Claude
3. Claude responds — either with text (done) or with tool calls
4. If tool calls: execute each one, collect results, append everything to history, go to step 2
5. If text: print it, wait for next user input

## SQLite Schema

```sql
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- Habit tracking
CREATE TABLE habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT DEFAULT 'daily',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  logged_at TEXT DEFAULT (datetime('now')),
  note TEXT
);

-- Notes
CREATE TABLE notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Plant catalog (reference info about plant types)
CREATE TABLE plants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  variety TEXT,
  description TEXT,
  days_to_germination_min INTEGER,
  days_to_germination_max INTEGER,
  days_to_harvest_min INTEGER,
  days_to_harvest_max INTEGER,
  sun_requirement TEXT,
  water_frequency TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Seed inventory (what seeds you have on hand)
CREATE TABLE seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  source TEXT,                    -- where you got them, e.g., 'Baker Creek', 'saved from 2025'
  quantity TEXT,                  -- e.g., '1 packet', '~50 seeds', 'handful'
  plant_window_start TEXT,        -- earliest month/date to plant, e.g., '03-01' (March 1)
  plant_window_end TEXT,          -- latest month/date to plant, e.g., '05-15' (May 15)
  year_purchased INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Garden log (individual plantings from your seed inventory)
CREATE TABLE plantings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  seed_id INTEGER REFERENCES seeds(id) ON DELETE SET NULL,
  planted_at TEXT NOT NULL,
  location TEXT,
  expected_germination TEXT,
  expected_harvest TEXT,
  actual_germination TEXT,
  actual_harvest TEXT,
  status TEXT DEFAULT 'planted',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for common query patterns
CREATE INDEX idx_habit_logs_habit_id ON habit_logs(habit_id, logged_at);
CREATE INDEX idx_plantings_plant_id ON plantings(plant_id);
CREATE INDEX idx_plantings_status ON plantings(status);
CREATE INDEX idx_seeds_plant_id ON seeds(plant_id);
CREATE INDEX idx_seeds_plant_window ON seeds(plant_window_start, plant_window_end);
```

### Three-Table Garden Model

- **`plants`** = reference catalog — "Roma Tomatoes take 5-10 days to germinate, 75-85 days to harvest, need full sun"
- **`seeds`** = your inventory — "I have 1 packet of Roma Tomato seeds from Baker Creek, best planted March through May"
- **`plantings`** = garden log — "I planted Roma Tomatoes in the raised bed on March 15"

A seed references a plant (for growing data). When you plant a seed, a planting record is created. The agent checks `seeds.plant_window_start/end` against the current date and weather to generate weekly planting reports.

### Weekly Planting Report Flow

1. Agent calls `get_current_date` to know the current week
2. Agent queries `seeds` joined with `plants` for seeds whose planting window includes this week
3. Agent uses **web search** to check the weather forecast for the coming days
4. Agent recommends the best day to plant based on temperature, rain, frost risk, and plant requirements

Design choices:
- `PRAGMA foreign_keys = ON` — SQLite does not enforce FK constraints by default; this must be set per connection
- `PRAGMA journal_mode = WAL` — crash-safe writes, allows concurrent reads during writes
- `ON DELETE CASCADE` on foreign keys — deleting a habit removes its logs, deleting a plant removes its seeds/plantings
- `ON DELETE SET NULL` on `plantings.seed_id` — if a seed record is removed, the planting history is preserved
- Dates as ISO 8601 text (SQLite has no native datetime)
- Planting windows as `MM-DD` strings — simple month-day format for seasonal comparisons
- Tags as comma-separated text (avoids join table complexity)
- Separate `habit_logs` table for streak/completion queries

### Schema Initialization

On startup, `connection.ts` opens (or creates) the SQLite database file at `data/jadu.db` and runs `schema.sql` using `CREATE TABLE IF NOT EXISTS` to ensure tables exist. This is idempotent — safe to run every time the app starts.

## Custom Tools

### Tool Definitions

Each custom tool has a name, description, and input schema:

**`query_database`** — Run a read-only SELECT query
```json
{
  "name": "query_database",
  "description": "Run a read-only SELECT query against the SQLite database. Returns results as a JSON array of row objects.",
  "input_schema": {
    "type": "object",
    "properties": {
      "query": { "type": "string", "description": "A SQL SELECT statement" }
    },
    "required": ["query"]
  }
}
```
**Returns:** JSON string of row objects, e.g., `[{"id": 1, "name": "Tomato"}, ...]`. Returns `"[]"` for no results. On error, returns the error message with `is_error: true`.

**`execute_database`** — Run an INSERT, UPDATE, or DELETE statement
```json
{
  "name": "execute_database",
  "description": "Run a data modification statement (INSERT, UPDATE, DELETE) against the SQLite database. DROP, ALTER, and CREATE statements are not allowed.",
  "input_schema": {
    "type": "object",
    "properties": {
      "statement": { "type": "string", "description": "A SQL INSERT, UPDATE, or DELETE statement" }
    },
    "required": ["statement"]
  }
}
```
**Returns:** `"OK: N row(s) affected"` on success. On error (including disallowed statement types), returns the error message with `is_error: true`.

**Validation:** The handler rejects any statement that does not start with `INSERT`, `UPDATE`, or `DELETE` (case-insensitive, after trimming whitespace). This prevents accidental `DROP TABLE` or schema modifications via the agent.

**`list_tables`** — Discover the database schema
```json
{
  "name": "list_tables",
  "description": "List all tables in the database and their column definitions. Use this to understand the schema before writing queries.",
  "input_schema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```
**Returns:** JSON object mapping table names to arrays of column definitions, e.g., `{"emails": [{"name": "id", "type": "INTEGER", ...}], ...}`.

**`get_current_date`** — Get the current date and time
```json
{
  "name": "get_current_date",
  "description": "Get the current date and time in ISO 8601 format.",
  "input_schema": {
    "type": "object",
    "properties": {},
    "required": []
  }
}
```
**Returns:** ISO 8601 datetime string, e.g., `"2026-03-21T14:30:00.000Z"`.

### Tool Design Rationale

Reads and writes are separated intentionally. This makes the permission boundary explicit and teaches how tool design affects agent behavior — Claude will reach for `query_database` when exploring and `execute_database` when acting.

## Built-in Server-Side Tools

| Tool | Use Case |
|------|----------|
| Web search (`web_search_20260209`) | Check weather forecasts for planting recommendations, look up gardening info |
| Code execution (`code_execution_20260120`) | Compute stats, generate charts from habit/planting data |

These are declared in the tools array but executed server-side by Anthropic.

## Agent Loop (Core Logic)

```
function agentLoop(userMessage, conversationHistory):
  history.push({ role: "user", content: userMessage })

  iterations = 0
  MAX_ITERATIONS = 10

  while iterations < MAX_ITERATIONS:
    iterations++

    response = claude.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools: allToolDefinitions,
      messages: history
    })

    history.push({ role: "assistant", content: response.content })

    if response.stop_reason == "end_turn":
      return extractText(response.content)

    if response.stop_reason == "pause_turn":
      // Server-side tool (web search, code exec) hit its iteration limit.
      // Re-send so the server resumes automatically.
      continue

    if response.stop_reason == "tool_use":
      toolResults = []
      for each tool_use block in response.content:
        try:
          result = toolRegistry.execute(block.name, block.input)
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: result
          })
        catch (error):
          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: error.message,
            is_error: true
          })
      history.push({ role: "user", content: toolResults })

  // Safety: if we hit MAX_ITERATIONS, return whatever text Claude has produced
  return "I've reached the maximum number of tool calls for this turn."
```

Key properties:
- **History is append-only** — Claude is stateless, so we send the full conversation every time
- **Assistant response is appended before processing tools** — preserves `tool_use` block matching with `tool_result`s
- **Claude controls the loop** — we never decide which tool to call
- **Error handling** — tool execution failures are sent back to Claude as `is_error: true` results, allowing it to self-correct
- **Iteration limit** — prevents runaway API calls and cost overruns
- **`max_tokens: 16384`** — sufficient for tool calls and text responses without risk of timeout on non-streaming requests

## System Prompt

```
You are a personal productivity and garden management assistant. You help
manage habits, notes, and a complete garden system (plant catalog, seed
inventory, and planting log).

All data is stored in a SQLite database. Use the list_tables tool to
discover the schema before writing queries. Use query_database for
reads and execute_database for writes.

When the user asks you to do something, take action — don't just
describe what you would do. Use your tools to actually create, update,
or query data.

Garden management:
- The plants table is a reference catalog of plant growing information.
- The seeds table tracks the user's seed inventory and planting windows.
- The plantings table logs what was actually planted and tracks growth.
- When creating a planting, compute expected germination and harvest dates
  from the plant catalog data and the planting date.
- When asked for a weekly planting report, check which seeds have a
  planting window that includes the current week, then use web search
  to check the weather forecast and recommend the best planting day.

Always use get_current_date when you need today's date — never guess.
```

## Tool Registry Design

The registry serves two purposes:
1. Generates the `tools` array for the Claude API (tool definitions with JSON schemas)
2. Dispatches tool calls by name to handler functions

Adding a new tool means: write the handler function, register it with a name and schema.

## CLI / REPL

The REPL uses Node's `readline` module for a simple input loop. It:
- Prints a prompt (`> `)
- Reads user input
- Passes it to the agent loop
- Prints the agent's text response
- Handles `Ctrl+C` / `Ctrl+D` gracefully (closes the database connection and exits)

## Project Structure

```
jadu/
├── src/
│   ├── index.ts              -- CLI REPL entry point
│   ├── agent.ts              -- agent loop (the core)
│   ├── tools/
│   │   ├── registry.ts       -- maps tool names → handlers, builds tool definitions
│   │   ├── database.ts       -- query_database, execute_database, list_tables
│   │   └── date.ts           -- get_current_date
│   ├── db/
│   │   ├── connection.ts     -- SQLite connection setup (pragmas, schema init)
│   │   └── schema.sql        -- CREATE TABLE IF NOT EXISTS statements + indexes
│   └── config.ts             -- model name, system prompt, max_tokens, constants
├── data/
│   └── jadu.db               -- SQLite database file (gitignored)
├── package.json
├── tsconfig.json
├── .gitignore                -- data/, .env, node_modules/
└── .env                      -- ANTHROPIC_API_KEY (gitignored)
```

## Tech Stack

| Dependency | Purpose |
|------------|---------|
| `@anthropic-ai/sdk` | Claude API client |
| `better-sqlite3` | Synchronous SQLite driver |
| `@types/better-sqlite3` | TypeScript type definitions |
| `dotenv` | Load API key from .env |
| `typescript` | Type checking |
| `tsx` | Run TypeScript directly without a separate compile step |

TypeScript config: `"module": "CommonJS"` — `better-sqlite3` is a native addon that works best with CommonJS require. `tsx` handles the execution.

## Model

Claude Opus 4.6 (`claude-opus-4-6`) with adaptive thinking (`thinking: { type: "adaptive" }`).

## Future Enhancements (Out of Scope for v1)

- Email and calendar management (Gmail, Google Calendar via OAuth)
- User confirmation prompts before write operations
- Conversation persistence across sessions
- Streaming output for long responses
- Conversation history compaction for long sessions
- Dedicated weather API tool (replace web search for more structured forecasts)
- Garden companion planting suggestions
- Frost date tracking by zone
