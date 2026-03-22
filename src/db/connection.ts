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
