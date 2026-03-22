# Jadu

A CLI gardening assistant powered (and built) by Claude. Manages your plant catalog, seed inventory, and planting log through natural conversation. Knows when to plant your seeds, checks the weather, and gives you weekly planting recommendations.

Built with a manual agentic tool-calling loop — no frameworks, no abstractions.

## Quick Start

```bash
npm install
```

Add your Anthropic API key to `.env`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run the assistant:

```bash
npm start
```

## What It Does

Jadu manages a SQLite database with four tables:

- **Plants** — reference catalog of plant growing information (germination days, harvest days, sun/water needs)
- **Seeds** — your seed inventory with planting windows (what you have, when to plant it)
- **Plantings** — garden log tracking what was planted, growth status, expected vs. actual timelines
- **Notes** — scratchpad for things that don't fit elsewhere (soil tests, garden layout ideas, observations)

### Example Prompts

```
Add a Roma Tomato to my plant catalog — 5-10 days germination,
75-85 days to harvest, full sun, water daily.

I have a packet of Roma Tomato seeds from Baker Creek,
best planted March 1 through May 15.

What should I plant this week?

I planted the Roma Tomatoes in the raised bed today.

What's sprouting soon?

Note that the soil pH in the raised bed tested at 6.5 last week.
```

When asked for planting recommendations, Jadu checks your seed inventory against the current date and searches the web for your local weather forecast to suggest the best planting day.

## How It Works

```
You type a message
  → Agent sends it to Claude with tool definitions
    → Claude decides which tools to call
      → Agent executes the tools (SQL queries, date lookup)
      → Sends results back to Claude
    → Claude responds (or calls more tools)
  → Response streams to your terminal
```

The agent loop runs until Claude responds with text (no more tool calls) or hits a safety limit of 10 iterations per turn.

### Tools

| Tool | What it does |
|------|-------------|
| `query_database` | Run read-only SELECT queries |
| `execute_database` | Run INSERT/UPDATE/DELETE (rejects DROP/ALTER/CREATE) |
| `list_tables` | Discover the database schema |
| `get_current_date` | Get the current date and time |
| `web_search` | Search the web (weather forecasts, gardening info) |
| `code_execution` | Run Python code (stats, charts) |

## Development

```bash
npm test            # run tests
npm run test:watch  # run tests in watch mode
```

## Tech Stack

- TypeScript
- [Anthropic SDK](https://github.com/anthropics/anthropic-sdk-typescript) — Claude API client
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) — SQLite driver
- [vitest](https://vitest.dev) — test framework
