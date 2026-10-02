import fs from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import Database from "better-sqlite3";
import { PrismaClient } from "../generated/prisma/client";

export type LocalDatabase = PrismaClient;

export const LOCAL_DATABASE_FILENAME = "fries-lab-prisma.sqlite";

export function getLocalDatabasePath(userDataPath: string): string {
  return path.join(userDataPath, "data", LOCAL_DATABASE_FILENAME);
}

function applyMigrations(databasePath: string, migrationsPath: string): void {
  const database = new Database(databasePath);
  try {
    database.pragma("journal_mode = WAL");
    database.pragma("foreign_keys = ON");
    database.pragma("busy_timeout = 5000");
    database.exec(`
      CREATE TABLE IF NOT EXISTS local_schema_migrations (
        name TEXT PRIMARY KEY NOT NULL,
        applied_at TEXT NOT NULL
      )
    `);

    const applied = new Set(
      database
        .prepare<[], { name: string }>(
          "SELECT name FROM local_schema_migrations",
        )
        .all()
        .map((row) => row.name),
    );
    const migrationDirectories = fs
      .readdirSync(migrationsPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    for (const name of migrationDirectories) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(
        path.join(migrationsPath, name, "migration.sql"),
        "utf8",
      );
      database.transaction(() => {
        database.exec(sql);
        database
          .prepare(
            "INSERT INTO local_schema_migrations(name, applied_at) VALUES (?, ?)",
          )
          .run(name, new Date().toISOString());
      })();
    }
  } finally {
    database.close();
  }
}

export async function createLocalDatabase(
  userDataPath: string,
  appPath = process.cwd(),
): Promise<LocalDatabase> {
  const databasePath = getLocalDatabasePath(userDataPath);
  const dataPath = path.dirname(databasePath);
  fs.mkdirSync(dataPath, { recursive: true });
  applyMigrations(databasePath, path.join(appPath, "prisma", "migrations"));

  const adapter = new PrismaBetterSqlite3({ url: databasePath });
  const prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  return prisma;
}
