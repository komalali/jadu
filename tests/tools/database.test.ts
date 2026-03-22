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

    const habitColumns = result.habits.map((c: { name: string }) => c.name);
    expect(habitColumns).toContain("id");
    expect(habitColumns).toContain("name");
    expect(habitColumns).toContain("frequency");
  });
});
