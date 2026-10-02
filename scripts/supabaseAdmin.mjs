import { createClient } from "@supabase/supabase-js";

export const EMPLOYEE_AUTH_EMAIL_SUFFIX = "@employees.fries-lab.invalid";

function requiredEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function createAdminContext() {
  const url = requiredEnvironmentValue("SUPABASE_URL");
  const secretKey =
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!secretKey)
    throw new Error(
      "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
    );
  const hostname = new URL(url).hostname;
  const projectRef = hostname.endsWith(".supabase.co")
    ? hostname.split(".")[0]
    : hostname.replaceAll(/[^a-zA-Z0-9]/g, "_");
  return {
    admin: createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    hostname,
    projectRef,
  };
}

export function confirmationArgument() {
  return process.argv
    .find((argument) => argument.startsWith("--confirm="))
    ?.slice("--confirm=".length);
}

export function employeeAuthEmail(employeeId) {
  return `${employeeId.toLowerCase().replaceAll(/[^a-z0-9]/g, "-")}${EMPLOYEE_AUTH_EMAIL_SUFFIX}`;
}

export async function listAllAuthUsers(admin) {
  const users = [];
  const perPage = 1000;
  for (let page = 1; ; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage });
    if (result.error) throw result.error;
    users.push(...result.data.users);
    if (!result.data.nextPage) return users;
  }
}

export async function selectAllRows(admin, table, columns) {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

export async function countRows(admin, table, filters = {}) {
  let query = admin.from(table).select("*", { count: "exact", head: true });
  for (const [column, value] of Object.entries(filters))
    query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

export async function deleteAllRows(admin, table, primaryKey) {
  const { count, error } = await admin
    .from(table)
    .delete({ count: "exact" })
    .not(primaryKey, "is", null);
  if (error) throw error;
  return count ?? 0;
}

export async function deleteWhere(admin, table, filters) {
  let query = admin.from(table).delete({ count: "exact" });
  for (const [column, value] of Object.entries(filters))
    query = query.eq(column, value);
  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}
