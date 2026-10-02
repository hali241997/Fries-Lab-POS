import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  confirmationArgument,
  countRows,
  createAdminContext,
  deleteAllRows,
  EMPLOYEE_AUTH_EMAIL_SUFFIX,
  listAllAuthUsers,
  selectAllRows,
} from "./supabaseAdmin.mjs";

const APPLICATION_NAME = "Fries Lab POS";
const LOCAL_DATABASE_FILENAME = "fries-lab-prisma.sqlite";

const TABLES_TO_CLEAR = [
  ["order_items", "id"],
  ["order_events", "id"],
  ["sync_operations", "id"],
  ["audit_events", "id"],
  ["changes", "sequence"],
  ["conflict_notifications", "id"],
  ["order_revisions", "id"],
  ["orders", "id"],
  ["permission_snapshots", "id"],
  ["member_permissions", "membership_id"],
  ["menu_items", "id"],
  ["devices", "id"],
  ["memberships", "id"],
  ["profiles", "id"],
  ["stores", "id"],
  ["login_attempts", "key"],
];

function printHelp() {
  console.log(`Usage:
  npm run db:clear
  npm run db:clear -- --confirm=CLEAR_<project-ref>

Without --confirm, the command performs a read-only preview. The confirmed
command permanently removes all Fries Lab application data and employee Auth
accounts from the configured Supabase project. It also removes the SQLite
database belonging to this terminal. Close Fries Lab POS before confirming.
Schema migrations and static permission definitions are preserved.`);
}

function localUserDataPath() {
  if (process.platform === "darwin")
    return path.join(os.homedir(), "Library", "Application Support", APPLICATION_NAME);
  if (process.platform === "win32")
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"),
      APPLICATION_NAME,
    );
  return path.join(
    process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
    APPLICATION_NAME,
  );
}

function localDatabasePath() {
  const override = process.env.FRIES_LAB_LOCAL_DB_PATH?.trim();
  return override || path.join(localUserDataPath(), "data", LOCAL_DATABASE_FILENAME);
}

function localDatabaseFiles(databasePath) {
  return [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
    `${databasePath}-journal`,
  ];
}

function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error instanceof Error && "code" in error && error.code === "EPERM";
  }
}

function readUsageMarker(databasePath) {
  const markerPath = `${databasePath}.running`;
  try {
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    return {
      markerPath,
      pid: typeof marker.pid === "number" ? marker.pid : null,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    )
      return null;
    return { markerPath, pid: null };
  }
}

function sqliteIsOpen(databasePath) {
  const marker = readUsageMarker(databasePath);
  if (marker?.pid && processIsRunning(marker.pid)) return true;

  if (process.platform === "win32") return false;
  const files = localDatabaseFiles(databasePath).filter((file) => fs.existsSync(file));
  if (files.length === 0) return false;
  const result = spawnSync("lsof", files, { stdio: "ignore" });
  return result.status === 0;
}

function clearLocalDatabase(databasePath) {
  if (sqliteIsOpen(databasePath))
    throw new Error(
      "Fries Lab POS is using the local database. Close the app, then run this command again.",
    );

  let removed = 0;
  for (const file of localDatabaseFiles(databasePath)) {
    if (!fs.existsSync(file)) continue;
    fs.rmSync(file);
    removed += 1;
  }

  const marker = readUsageMarker(databasePath);
  if (marker && !marker.pid) fs.rmSync(marker.markerPath, { force: true });
  else if (marker && !processIsRunning(marker.pid))
    fs.rmSync(marker.markerPath, { force: true });
  return removed;
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const { admin, hostname, projectRef } = createAdminContext();
  const databasePath = localDatabasePath();
  const profileRows = await selectAllRows(admin, "profiles", "id");
  const profileIds = new Set(profileRows.map((profile) => profile.id));
  const allAuthUsers = await listAllAuthUsers(admin);
  const appAuthUsers = allAuthUsers.filter(
    (user) =>
      profileIds.has(user.id) ||
      user.email?.endsWith(EMPLOYEE_AUTH_EMAIL_SUFFIX),
  );

  console.log(`Supabase project: ${hostname}`);
  console.log(
    `local SQLite: ${databasePath} (${fs.existsSync(databasePath) ? "found" : "not found"})`,
  );
  for (const [table] of TABLES_TO_CLEAR)
    console.log(`${table}: ${await countRows(admin, table)} row(s)`);
  console.log(`app Auth users: ${appAuthUsers.length}`);

  const expectedConfirmation = `CLEAR_${projectRef}`;
  const suppliedConfirmation = confirmationArgument();
  if (!suppliedConfirmation) {
    console.log(
      "\nDry run only. To permanently clear this project, run:\n" +
        `npm run db:clear -- --confirm=${expectedConfirmation}`,
    );
    return;
  }
  if (suppliedConfirmation !== expectedConfirmation)
    throw new Error(
      `Confirmation did not match. Expected --confirm=${expectedConfirmation}`,
    );

  const removedLocalFiles = clearLocalDatabase(databasePath);
  console.log(`Cleared local SQLite: ${removedLocalFiles} file(s)`);

  for (const [table, primaryKey] of TABLES_TO_CLEAR) {
    const deleted = await deleteAllRows(admin, table, primaryKey);
    console.log(`Cleared ${table}: ${deleted} row(s)`);
  }
  for (const user of appAuthUsers) {
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error) throw error;
  }
  console.log(
    `Cloud and local databases cleared. Removed ${appAuthUsers.length} application Auth user(s).`,
  );
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
