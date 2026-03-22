# Personal Productivity Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI tool-calling agent that manages habits, notes, and garden data (plants, seeds, plantings) via SQLite, using the Claude API with a manual agentic loop.

**Architecture:** Four layers — CLI REPL → Agent Loop → Tool Registry → Tools (custom SQL tools + built-in server-side tools) → SQLite database. The agent loop is the core: it sends conversation history to Claude, dispatches tool calls, feeds results back, and repeats until Claude responds with text.

**Tech Stack:** TypeScript, `@anthropic-ai/sdk`, `better-sqlite3`, `dotenv`, `tsx`

**Spec:** `docs/superpowers/specs/2026-03-21-personal-productivity-agent-design.md`

---

## File Structure

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
├── tests/
│   ├── tools/
│   │   ├── registry.test.ts
│   │   ├── database.test.ts
│   │   └── date.test.ts
│   ├── db/
│   │   └── connection.test.ts
│   └── agent.test.ts
├── data/                     -- gitignored, created at runtime
├── package.json
├── tsconfig.json
├── .gitignore
└── .env                      -- ANTHROPIC_API_KEY (gitignored)
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env`

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/komal/code/jadu
npm init -y
```

Then edit `package.json` to set the project up:

```json
{
  "name": "jadu",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "start": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
npm install @anthropic-ai/sdk better-sqlite3 dotenv
npm install -D typescript tsx @types/better-sqlite3 @types/node vitest
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create .gitignore**

```
node_modules/
dist/
data/
.env
*.db
*.db-wal
*.db-shm
```

- [ ] **Step 5: Create .env placeholder**

```
ANTHROPIC_API_KEY=your-api-key-here
```

- [ ] **Step 6: Create data directory**

```bash
mkdir -p /Users/komal/code/jadu/data
```

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore: scaffold project with TypeScript, deps, and config"
```

Note: Do NOT commit `.env`.

---

## Task 2: SQLite Schema and Connection

**Files:**
- Create: `src/db/schema.sql`
- Create: `src/db/connection.ts`
- Create: `tests/db/connection.test.ts`

- [ ] **Step 1: Write the schema file**

Create `src/db/schema.sql` with the full schema from the spec:

```sql
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  frequency TEXT DEFAULT 'daily',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS habit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  logged_at TEXT DEFAULT (datetime('now')),
  note TEXT
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  tags TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plants (
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

CREATE TABLE IF NOT EXISTS seeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plant_id INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
  source TEXT,
  quantity TEXT,
  plant_window_start TEXT,
  plant_window_end TEXT,
  year_purchased INTEGER,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS plantings (
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

CREATE INDEX IF NOT EXISTS idx_habit_logs_habit_id ON habit_logs(habit_id, logged_at);
CREATE INDEX IF NOT EXISTS idx_plantings_plant_id ON plantings(plant_id);
CREATE INDEX IF NOT EXISTS idx_plantings_status ON plantings(status);
CREATE INDEX IF NOT EXISTS idx_seeds_plant_id ON seeds(plant_id);
CREATE INDEX IF NOT EXISTS idx_seeds_plant_window ON seeds(plant_window_start, plant_window_end);
```

- [ ] **Step 2: Write the failing test for connection**

Create `tests/db/connection.test.ts`:

```typescript
import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import { createDatabase } from "../../src/db/connection";

const TEST_DB_PATH = "data/test.db";

afterEach(() => {
  // Clean up test database files
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

describe("createDatabase", () => {
  it("creates a database with all tables", () => {
    const db = createDatabase(TEST_DB_PATH);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toEqual([
      "habit_logs",
      "habits",
      "notes",
      "plantings",
      "plants",
      "seeds",
    ]);

    db.close();
  });

  it("enables foreign key enforcement", () => {
    const db = createDatabase(TEST_DB_PATH);

    const result = db.prepare("PRAGMA foreign_keys").get() as {
      foreign_keys: number;
    };
    expect(result.foreign_keys).toBe(1);

    db.close();
  });

  it("uses WAL journal mode", () => {
    const db = createDatabase(TEST_DB_PATH);

    const result = db.prepare("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
    expect(result.journal_mode).toBe("wal");

    db.close();
  });

  it("is idempotent — running twice does not error", () => {
    const db1 = createDatabase(TEST_DB_PATH);
    db1.close();

    const db2 = createDatabase(TEST_DB_PATH);
    const tables = db2
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .all();
    expect(tables.length).toBe(6);

    db2.close();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/db/connection.test.ts
```

Expected: FAIL — `createDatabase` does not exist.

- [ ] **Step 4: Implement connection.ts**

Create `src/db/connection.ts`:

```typescript
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

export function createDatabase(dbPath: string): Database.Database {
  // Ensure the directory exists
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable foreign key enforcement (SQLite has this OFF by default)
  db.pragma("foreign_keys = ON");

  // Use WAL mode for crash safety and better concurrent access
  db.pragma("journal_mode = WAL");

  // Read and execute the schema file
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  return db;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/db/connection.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db/ tests/db/
git commit -m "feat: add SQLite database connection with schema initialization"
```

---

## Task 3: Config Module

**Files:**
- Create: `src/config.ts`

- [ ] **Step 1: Create config.ts**

```typescript
import "dotenv/config";

export const CONFIG = {
  model: "claude-opus-4-6" as const,
  maxTokens: 16384,
  maxIterations: 10,
  dbPath: "data/jadu.db",
  systemPrompt: `You are a personal productivity and garden management assistant. You help manage habits, notes, and a complete garden system (plant catalog, seed inventory, and planting log).

All data is stored in a SQLite database. Use the list_tables tool to discover the schema before writing queries. Use query_database for reads and execute_database for writes.

When the user asks you to do something, take action — don't just describe what you would do. Use your tools to actually create, update, or query data.

Garden management:
- The plants table is a reference catalog of plant growing information.
- The seeds table tracks the user's seed inventory and planting windows.
- The plantings table logs what was actually planted and tracks growth.
- When creating a planting, compute expected germination and harvest dates from the plant catalog data and the planting date.
- When asked for a weekly planting report, check which seeds have a planting window that includes the current week, then use web search to check the weather forecast and recommend the best planting day.

Always use get_current_date when you need today's date — never guess.`,
} as const;

export function getApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key || key === "your-api-key-here") {
    console.error(
      "Error: ANTHROPIC_API_KEY is not set. Add it to your .env file."
    );
    process.exit(1);
  }
  return key;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/config.ts
git commit -m "feat: add config module with model settings and system prompt"
```

---

## Task 4: Tool Registry

**Files:**
- Create: `src/tools/registry.ts`
- Create: `tests/tools/registry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/registry.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../../src/tools/registry";

describe("ToolRegistry", () => {
  it("registers a tool and returns its definition", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "test_tool",
      description: "A test tool",
      inputSchema: {
        type: "object" as const,
        properties: {
          input: { type: "string", description: "Test input" },
        },
        required: ["input"],
      },
      handler: (params: Record<string, unknown>) =>
        `echo: ${params.input}`,
    });

    const definitions = registry.getToolDefinitions();
    expect(definitions).toHaveLength(1);
    expect(definitions[0]).toEqual({
      name: "test_tool",
      description: "A test tool",
      input_schema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Test input" },
        },
        required: ["input"],
      },
    });
  });

  it("executes a registered tool by name", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "greet",
      description: "Greet someone",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "Name" },
        },
        required: ["name"],
      },
      handler: (params: Record<string, unknown>) =>
        `Hello, ${params.name}!`,
    });

    const result = registry.execute("greet", { name: "Alice" });
    expect(result).toBe("Hello, Alice!");
  });

  it("throws when executing an unregistered tool", () => {
    const registry = new ToolRegistry();

    expect(() => registry.execute("nonexistent", {})).toThrow(
      'Unknown tool: "nonexistent"'
    );
  });

  it("reports whether a tool is a custom tool", () => {
    const registry = new ToolRegistry();

    registry.register({
      name: "my_tool",
      description: "test",
      inputSchema: { type: "object" as const, properties: {}, required: [] },
      handler: () => "ok",
    });

    expect(registry.isCustomTool("my_tool")).toBe(true);
    expect(registry.isCustomTool("web_search")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/registry.test.ts
```

Expected: FAIL — `ToolRegistry` does not exist.

- [ ] **Step 3: Implement registry.ts**

Create `src/tools/registry.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required: string[];
  };
  handler: (params: Record<string, unknown>) => string;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  execute(name: string, params: Record<string, unknown>): string {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: "${name}"`);
    }
    return tool.handler(params);
  }

  isCustomTool(name: string): boolean {
    return this.tools.has(name);
  }

  getToolDefinitions(): Anthropic.Tool[] {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: tool.inputSchema.type,
        properties: tool.inputSchema.properties,
        required: tool.inputSchema.required,
      },
    }));
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/registry.test.ts
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/registry.ts tests/tools/registry.test.ts
git commit -m "feat: add tool registry for dispatching and defining tools"
```

---

## Task 5: Date Tool

**Files:**
- Create: `src/tools/date.ts`
- Create: `tests/tools/date.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/date.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getCurrentDateHandler } from "../../src/tools/date";

describe("getCurrentDateHandler", () => {
  it("returns a valid ISO 8601 date string", () => {
    const result = getCurrentDateHandler({});
    // Should be parseable as a date
    const parsed = new Date(result);
    expect(parsed.toString()).not.toBe("Invalid Date");
  });

  it("returns a date close to now", () => {
    const before = Date.now();
    const result = getCurrentDateHandler({});
    const after = Date.now();
    const parsed = new Date(result).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before - 1000);
    expect(parsed).toBeLessThanOrEqual(after + 1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/date.test.ts
```

Expected: FAIL — `getCurrentDateHandler` does not exist.

- [ ] **Step 3: Implement date.ts**

Create `src/tools/date.ts`:

```typescript
import { ToolRegistry } from "./registry";

export function getCurrentDateHandler(_params: Record<string, unknown>): string {
  return new Date().toISOString();
}

export function registerDateTools(registry: ToolRegistry): void {
  registry.register({
    name: "get_current_date",
    description: "Get the current date and time in ISO 8601 format.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: getCurrentDateHandler,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/date.test.ts
```

Expected: All 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/date.ts tests/tools/date.test.ts
git commit -m "feat: add get_current_date tool"
```

---

## Task 6: Database Tools

**Files:**
- Create: `src/tools/database.ts`
- Create: `tests/tools/database.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/tools/database.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import { createDatabase } from "../../src/db/connection";
import {
  queryDatabaseHandler,
  executeDatabaseHandler,
  listTablesHandler,
} from "../../src/tools/database";
import Database from "better-sqlite3";

const TEST_DB_PATH = "data/test-tools.db";
let db: Database.Database;

beforeEach(() => {
  db = createDatabase(TEST_DB_PATH);
});

afterEach(() => {
  db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    const file = TEST_DB_PATH + suffix;
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
});

describe("queryDatabaseHandler", () => {
  it("returns rows as JSON array", () => {
    db.exec("INSERT INTO habits (name) VALUES ('Exercise')");
    db.exec("INSERT INTO habits (name) VALUES ('Read')");

    const handler = queryDatabaseHandler(db);
    const result = JSON.parse(handler({ query: "SELECT name FROM habits ORDER BY name" }));

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Exercise");
    expect(result[1].name).toBe("Read");
  });

  it("returns empty array for no results", () => {
    const handler = queryDatabaseHandler(db);
    const result = handler({ query: "SELECT * FROM habits" });
    expect(result).toBe("[]");
  });

  it("rejects non-SELECT statements", () => {
    const handler = queryDatabaseHandler(db);
    expect(() =>
      handler({ query: "DELETE FROM habits" })
    ).toThrow();
  });
});

describe("executeDatabaseHandler", () => {
  it("executes INSERT and returns affected rows", () => {
    const handler = executeDatabaseHandler(db);
    const result = handler({
      statement: "INSERT INTO habits (name, description) VALUES ('Meditate', 'Daily meditation')",
    });
    expect(result).toBe("OK: 1 row(s) affected");

    // Verify data was inserted
    const rows = db.prepare("SELECT * FROM habits").all() as { name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Meditate");
  });

  it("executes UPDATE and returns affected rows", () => {
    db.exec("INSERT INTO habits (name) VALUES ('Exercise')");

    const handler = executeDatabaseHandler(db);
    const result = handler({
      statement: "UPDATE habits SET name = 'Workout' WHERE name = 'Exercise'",
    });
    expect(result).toBe("OK: 1 row(s) affected");
  });

  it("executes DELETE and returns affected rows", () => {
    db.exec("INSERT INTO habits (name) VALUES ('Exercise')");

    const handler = executeDatabaseHandler(db);
    const result = handler({
      statement: "DELETE FROM habits WHERE name = 'Exercise'",
    });
    expect(result).toBe("OK: 1 row(s) affected");
  });

  it("rejects DROP statements", () => {
    const handler = executeDatabaseHandler(db);
    expect(() =>
      handler({ statement: "DROP TABLE habits" })
    ).toThrow("Only INSERT, UPDATE, and DELETE statements are allowed");
  });

  it("rejects ALTER statements", () => {
    const handler = executeDatabaseHandler(db);
    expect(() =>
      handler({ statement: "ALTER TABLE habits ADD COLUMN foo TEXT" })
    ).toThrow("Only INSERT, UPDATE, and DELETE statements are allowed");
  });

  it("rejects CREATE statements", () => {
    const handler = executeDatabaseHandler(db);
    expect(() =>
      handler({ statement: "CREATE TABLE evil (id INTEGER)" })
    ).toThrow("Only INSERT, UPDATE, and DELETE statements are allowed");
  });

  it("rejects SELECT statements", () => {
    const handler = executeDatabaseHandler(db);
    expect(() =>
      handler({ statement: "SELECT * FROM habits" })
    ).toThrow("Only INSERT, UPDATE, and DELETE statements are allowed");
  });
});

describe("listTablesHandler", () => {
  it("returns all table names with their columns", () => {
    const handler = listTablesHandler(db);
    const result = JSON.parse(handler({}));

    const tableNames = Object.keys(result).sort();
    expect(tableNames).toEqual([
      "habit_logs",
      "habits",
      "notes",
      "plantings",
      "plants",
      "seeds",
    ]);

    // Check that columns are present
    const habitColumns = result.habits.map((c: { name: string }) => c.name);
    expect(habitColumns).toContain("id");
    expect(habitColumns).toContain("name");
    expect(habitColumns).toContain("frequency");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/database.test.ts
```

Expected: FAIL — handlers don't exist.

- [ ] **Step 3: Implement database.ts**

Create `src/tools/database.ts`:

```typescript
import Database from "better-sqlite3";
import { ToolRegistry } from "./registry";

const ALLOWED_WRITE_PREFIXES = ["insert", "update", "delete"];

export function queryDatabaseHandler(
  db: Database.Database
): (params: Record<string, unknown>) => string {
  return (params) => {
    const query = (params.query as string).trim();

    if (!query.toLowerCase().startsWith("select")) {
      throw new Error(
        "Only SELECT statements are allowed. Use execute_database for modifications."
      );
    }

    const rows = db.prepare(query).all();
    return JSON.stringify(rows);
  };
}

export function executeDatabaseHandler(
  db: Database.Database
): (params: Record<string, unknown>) => string {
  return (params) => {
    const statement = (params.statement as string).trim();
    const firstWord = statement.toLowerCase().split(/\s/)[0];

    if (!ALLOWED_WRITE_PREFIXES.includes(firstWord)) {
      throw new Error(
        "Only INSERT, UPDATE, and DELETE statements are allowed."
      );
    }

    const result = db.prepare(statement).run();
    return `OK: ${result.changes} row(s) affected`;
  };
}

export function listTablesHandler(
  db: Database.Database
): (params: Record<string, unknown>) => string {
  return () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all() as { name: string }[];

    const schema: Record<string, unknown[]> = {};

    for (const table of tables) {
      const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
      schema[table.name] = columns;
    }

    return JSON.stringify(schema);
  };
}

export function registerDatabaseTools(
  registry: ToolRegistry,
  db: Database.Database
): void {
  registry.register({
    name: "query_database",
    description:
      "Run a read-only SELECT query against the SQLite database. Returns results as a JSON array of row objects.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "A SQL SELECT statement" },
      },
      required: ["query"],
    },
    handler: queryDatabaseHandler(db),
  });

  registry.register({
    name: "execute_database",
    description:
      "Run a data modification statement (INSERT, UPDATE, DELETE) against the SQLite database. DROP, ALTER, and CREATE statements are not allowed.",
    inputSchema: {
      type: "object",
      properties: {
        statement: {
          type: "string",
          description: "A SQL INSERT, UPDATE, or DELETE statement",
        },
      },
      required: ["statement"],
    },
    handler: executeDatabaseHandler(db),
  });

  registry.register({
    name: "list_tables",
    description:
      "List all tables in the database and their column definitions. Use this to understand the schema before writing queries.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: listTablesHandler(db),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/database.test.ts
```

Expected: All 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/database.ts tests/tools/database.test.ts
git commit -m "feat: add database tools (query, execute, list_tables)"
```

---

## Task 7: Agent Loop

**Files:**
- Create: `src/agent.ts`
- Create: `tests/agent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/agent.test.ts`. This tests the loop logic by mocking the Claude API client — we verify that the agent correctly dispatches tools, appends history, and terminates.

```typescript
import { describe, it, expect, vi } from "vitest";
import { AgentLoop } from "../src/agent";
import { ToolRegistry } from "../src/tools/registry";

function makeTextResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    stop_reason: "end_turn" as const,
  };
}

function makeToolUseResponse(toolName: string, toolInput: Record<string, unknown>, toolId: string) {
  return {
    content: [
      {
        type: "tool_use" as const,
        id: toolId,
        name: toolName,
        input: toolInput,
      },
    ],
    stop_reason: "tool_use" as const,
  };
}

function makePauseTurnResponse() {
  return {
    content: [{ type: "text" as const, text: "Searching..." }],
    stop_reason: "pause_turn" as const,
  };
}

describe("AgentLoop", () => {
  it("returns text when Claude responds with end_turn", async () => {
    const mockCreate = vi.fn().mockResolvedValueOnce(makeTextResponse("Hello!"));
    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Hi");

    expect(result).toBe("Hello!");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("executes a tool call and sends result back", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(
        makeToolUseResponse("test_tool", { input: "abc" }, "tool_1")
      )
      .mockResolvedValueOnce(makeTextResponse("Done!"));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "test_tool",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: (params: Record<string, unknown>) => `result: ${params.input}`,
    });

    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Use the tool");

    expect(result).toBe("Done!");
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Verify the second call includes the tool result in history
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.role).toBe("user");
    expect(toolResultMessage.content[0].type).toBe("tool_result");
    expect(toolResultMessage.content[0].tool_use_id).toBe("tool_1");
    expect(toolResultMessage.content[0].content).toBe("result: abc");
  });

  it("handles multiple tool calls in one response", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce({
        content: [
          { type: "tool_use" as const, id: "t1", name: "tool_a", input: {} },
          { type: "tool_use" as const, id: "t2", name: "tool_b", input: {} },
        ],
        stop_reason: "tool_use" as const,
      })
      .mockResolvedValueOnce(makeTextResponse("Both done!"));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "tool_a",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => "result_a",
    });
    registry.register({
      name: "tool_b",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => "result_b",
    });

    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Use both tools");

    expect(result).toBe("Both done!");

    // Verify both tool results were sent back
    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content).toHaveLength(2);
    expect(toolResultMessage.content[0].tool_use_id).toBe("t1");
    expect(toolResultMessage.content[1].tool_use_id).toBe("t2");
  });

  it("sends tool errors back with is_error flag", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(
        makeToolUseResponse("bad_tool", {}, "tool_2")
      )
      .mockResolvedValueOnce(makeTextResponse("I see the error."));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "bad_tool",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => {
        throw new Error("Something went wrong");
      },
    });

    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Use the bad tool");

    expect(result).toBe("I see the error.");

    const secondCallMessages = mockCreate.mock.calls[1][0].messages;
    const toolResultMessage = secondCallMessages[secondCallMessages.length - 1];
    expect(toolResultMessage.content[0].is_error).toBe(true);
    expect(toolResultMessage.content[0].content).toBe("Something went wrong");
  });

  it("continues on pause_turn and eventually gets end_turn", async () => {
    const mockCreate = vi
      .fn()
      .mockResolvedValueOnce(makePauseTurnResponse())
      .mockResolvedValueOnce(makeTextResponse("Search complete."));

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    const agent = new AgentLoop(mockClient, registry);
    const result = await agent.run("Search the web");

    expect(result).toBe("Search complete.");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("stops after max iterations", async () => {
    // Always return tool_use — should hit the iteration limit
    const mockCreate = vi.fn().mockResolvedValue(
      makeToolUseResponse("loop_tool", {}, "tool_loop")
    );

    const mockClient = { messages: { create: mockCreate } } as any;

    const registry = new ToolRegistry();
    registry.register({
      name: "loop_tool",
      description: "test",
      inputSchema: { type: "object", properties: {}, required: [] },
      handler: () => "ok",
    });

    const agent = new AgentLoop(mockClient, registry, { maxIterations: 3 });
    const result = await agent.run("Loop forever");

    expect(result).toContain("maximum number of tool calls");
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent.test.ts
```

Expected: FAIL — `AgentLoop` does not exist.

- [ ] **Step 3: Implement agent.ts**

Create `src/agent.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { ToolRegistry } from "./tools/registry";
import { CONFIG } from "./config";

interface AgentOptions {
  maxIterations?: number;
}

export class AgentLoop {
  private client: Anthropic;
  private registry: ToolRegistry;
  private maxIterations: number;
  private history: Anthropic.MessageParam[] = [];

  constructor(
    client: Anthropic,
    registry: ToolRegistry,
    options: AgentOptions = {}
  ) {
    this.client = client;
    this.registry = registry;
    this.maxIterations = options.maxIterations ?? CONFIG.maxIterations;
  }

  async run(userMessage: string): Promise<string> {
    this.history.push({ role: "user", content: userMessage });

    let iterations = 0;

    while (iterations < this.maxIterations) {
      iterations++;

      // Build the tools array: custom tool definitions + built-in server-side tools
      const tools: Anthropic.Messages.ToolUnion[] = [
        ...this.registry.getToolDefinitions(),
        { type: "web_search_20260209", name: "web_search" },
        { type: "code_execution_20260120", name: "code_execution" },
      ];

      const response = await this.client.messages.create({
        model: CONFIG.model,
        max_tokens: CONFIG.maxTokens,
        thinking: { type: "adaptive" },
        system: CONFIG.systemPrompt,
        tools,
        messages: this.history,
      });

      // Append assistant response to history BEFORE processing tool calls
      this.history.push({ role: "assistant", content: response.content });

      // If Claude is done talking, extract and return text
      if (response.stop_reason === "end_turn") {
        return this.extractText(response.content);
      }

      // Server-side tool hit its iteration limit — re-send to continue
      if (response.stop_reason === "pause_turn") {
        continue;
      }

      // Claude wants to call tools
      if (response.stop_reason === "tool_use") {
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type === "tool_use") {
            // Only dispatch custom tools — server-side tools are handled by Anthropic
            if (this.registry.isCustomTool(block.name)) {
              try {
                const result = this.registry.execute(
                  block.name,
                  block.input as Record<string, unknown>
                );
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content: result,
                });
              } catch (error) {
                toolResults.push({
                  type: "tool_result",
                  tool_use_id: block.id,
                  content:
                    error instanceof Error ? error.message : String(error),
                  is_error: true,
                });
              }
            }
          }
        }

        if (toolResults.length > 0) {
          this.history.push({ role: "user", content: toolResults });
        }
      }
    }

    return "I've reached the maximum number of tool calls for this turn.";
  }

  private extractText(
    content: Anthropic.Messages.ContentBlock[]
  ): string {
    return content
      .filter((block): block is Anthropic.Messages.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("\n");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agent.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent.ts tests/agent.test.ts
git commit -m "feat: add agent loop with tool dispatch, error handling, iteration limit"
```

---

## Task 8: CLI REPL

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement index.ts**

Create `src/index.ts`:

```typescript
import * as readline from "readline";
import Anthropic from "@anthropic-ai/sdk";
import { CONFIG, getApiKey } from "./config";
import { createDatabase } from "./db/connection";
import { ToolRegistry } from "./tools/registry";
import { registerDatabaseTools } from "./tools/database";
import { registerDateTools } from "./tools/date";
import { AgentLoop } from "./agent";

function main(): void {
  // Initialize
  const apiKey = getApiKey();
  const client = new Anthropic({ apiKey });
  const db = createDatabase(CONFIG.dbPath);

  // Set up tool registry
  const registry = new ToolRegistry();
  registerDatabaseTools(registry, db);
  registerDateTools(registry);

  // Create agent
  const agent = new AgentLoop(client, registry);

  // Set up REPL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Jadu — Personal Productivity Agent");
  console.log('Type your message, or "exit" to quit.\n');

  function prompt(): void {
    rl.question("> ", async (input) => {
      const trimmed = input.trim();

      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === "exit") {
        shutdown();
        return;
      }

      try {
        const response = await agent.run(trimmed);
        console.log(`\n${response}\n`);
      } catch (error) {
        console.error(
          "\nError:",
          error instanceof Error ? error.message : String(error),
          "\n"
        );
      }

      prompt();
    });
  }

  let isShuttingDown = false;

  function shutdown(): void {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("\nGoodbye!");
    db.close();
    rl.close();
    process.exit(0);
  }

  // Handle Ctrl+C and Ctrl+D gracefully
  rl.on("close", shutdown);
  process.on("SIGINT", shutdown);

  prompt();
}

main();
```

- [ ] **Step 2: Verify it runs**

```bash
npx tsx src/index.ts
```

Expected: Prints the welcome banner and `> ` prompt. Type `exit` to quit. (Requires a valid `ANTHROPIC_API_KEY` in `.env` for actual agent interaction — the REPL itself should start without one but will error on first message.)

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: add CLI REPL entry point"
```

---

## Task 9: End-to-End Smoke Test

This is a manual verification step — confirm the full pipeline works.

- [ ] **Step 1: Set your API key**

Edit `.env` and replace `your-api-key-here` with your real Anthropic API key.

- [ ] **Step 2: Run all unit tests**

```bash
npx vitest run
```

Expected: All tests pass (connection, registry, date, database, agent).

- [ ] **Step 3: Run the agent and test basic interactions**

```bash
npx tsx src/index.ts
```

Try these prompts:
1. `What tables are available?` — agent should call `list_tables` and describe the schema
2. `Create a habit called "Water the garden" with a daily frequency` — agent should call `execute_database` with an INSERT
3. `Show me all my habits` — agent should call `query_database` with a SELECT
4. `Add a plant called "Roma Tomato" with 5-10 days germination and 75-85 days to harvest, full sun, water daily` — agent should INSERT into plants
5. `I have a packet of Roma Tomato seeds from Baker Creek, plant window March 1 to May 15` — agent should INSERT into seeds with the plant_id
6. `What should I plant this week?` — agent should call `get_current_date`, query seeds, and potentially use web search for weather

- [ ] **Step 4: Commit any fixes**

If any issues are found during smoke testing, fix them and commit:

```bash
git add -A
git commit -m "fix: address issues found during smoke testing"
```
