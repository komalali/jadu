import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import { createDatabase } from "../../src/db/connection";

const TEST_DB_PATH = "data/test.db";

afterEach(() => {
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
    expect(tables.length).toBe(4);

    db2.close();
  });
});
