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
