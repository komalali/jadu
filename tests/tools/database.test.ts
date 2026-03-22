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
    db.exec("INSERT INTO plants (name) VALUES ('Tomato')");
    db.exec("INSERT INTO plants (name) VALUES ('Basil')");

    const handler = queryDatabaseHandler(db);
    const result = JSON.parse(handler({ query: "SELECT name FROM plants ORDER BY name" }));

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("Basil");
    expect(result[1].name).toBe("Tomato");
  });

  it("returns empty array for no results", () => {
    const handler = queryDatabaseHandler(db);
    const result = handler({ query: "SELECT * FROM plants" });
    expect(result).toBe("[]");
  });

  it("rejects non-SELECT statements", () => {
    const handler = queryDatabaseHandler(db);
    expect(() =>
      handler({ query: "DELETE FROM plants" })
    ).toThrow();
  });
});

describe("executeDatabaseHandler", () => {
  it("executes INSERT and returns affected rows", () => {
    const handler = executeDatabaseHandler(db);
    const result = handler({
      statement: "INSERT INTO plants (name, description) VALUES ('Tomato', 'Classic garden plant')",
    });
    expect(result).toBe("OK: 1 row(s) affected");

    const rows = db.prepare("SELECT * FROM plants").all() as { name: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Tomato");
  });

  it("executes UPDATE and returns affected rows", () => {
    db.exec("INSERT INTO plants (name) VALUES ('Tomato')");

    const handler = executeDatabaseHandler(db);
    const result = handler({
      statement: "UPDATE plants SET name = 'Roma Tomato' WHERE name = 'Tomato'",
    });
    expect(result).toBe("OK: 1 row(s) affected");
  });

  it("executes DELETE and returns affected rows", () => {
    db.exec("INSERT INTO plants (name) VALUES ('Tomato')");

    const handler = executeDatabaseHandler(db);
    const result = handler({
      statement: "DELETE FROM plants WHERE name = 'Tomato'",
    });
    expect(result).toBe("OK: 1 row(s) affected");
  });

  it("rejects DROP statements", () => {
    const handler = executeDatabaseHandler(db);
    expect(() =>
      handler({ statement: "DROP TABLE plants" })
    ).toThrow("Only INSERT, UPDATE, and DELETE statements are allowed");
  });

  it("rejects ALTER statements", () => {
    const handler = executeDatabaseHandler(db);
    expect(() =>
      handler({ statement: "ALTER TABLE plants ADD COLUMN foo TEXT" })
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
      handler({ statement: "SELECT * FROM plants" })
    ).toThrow("Only INSERT, UPDATE, and DELETE statements are allowed");
  });
});

describe("listTablesHandler", () => {
  it("returns all table names with their columns", () => {
    const handler = listTablesHandler(db);
    const result = JSON.parse(handler({}));

    const tableNames = Object.keys(result).sort();
    expect(tableNames).toEqual([
      "notes",
      "plantings",
      "plants",
      "seeds",
    ]);

    const plantColumns = result.plants.map((c: { name: string }) => c.name);
    expect(plantColumns).toContain("id");
    expect(plantColumns).toContain("name");
    expect(plantColumns).toContain("variety");
  });
});
