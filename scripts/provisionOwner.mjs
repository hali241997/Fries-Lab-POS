import { createClient } from "@supabase/supabase-js";

const required = [
  "SUPABASE_URL",
  "OWNER_NAME",
  "OWNER_EMPLOYEE_ID",
  "OWNER_PASSWORD",
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required.`);
}

const adminKey =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!adminKey)
  throw new Error(
    "SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required.",
  );

const url = process.env.SUPABASE_URL;
const ownerName = process.env.OWNER_NAME.trim();
const employeeId = process.env.OWNER_EMPLOYEE_ID.trim().toUpperCase();
const password = process.env.OWNER_PASSWORD;
const storeName = process.env.STORE_NAME?.trim() || "Fries Lab";
if (password.length < 10)
  throw new Error("OWNER_PASSWORD must contain at least 10 characters.");

const admin = createClient(url, adminKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const existing = await admin
  .from("memberships")
  .select("id")
  .eq("employee_id", employeeId)
  .maybeSingle();
if (existing.data) throw new Error(`Employee ID ${employeeId} already exists.`);

const store = await admin
  .from("stores")
  .insert({ name: storeName })
  .select("id")
  .single();
if (store.error) throw store.error;
const email = `${employeeId.toLowerCase().replaceAll(/[^a-z0-9]/g, "-")}@employees.fries-lab.invalid`;
const created = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (created.error || !created.data.user)
  throw created.error ?? new Error("Could not create the owner account.");

try {
  const profile = await admin
    .from("profiles")
    .insert({
      id: created.data.user.id,
      name: ownerName,
      must_change_password: true,
    });
  if (profile.error) throw profile.error;
  const membership = await admin.from("memberships").insert({
    store_id: store.data.id,
    profile_id: created.data.user.id,
    employee_id: employeeId,
    auth_email: email,
    role: "owner",
  });
  if (membership.error) throw membership.error;
  console.log(
    `Provisioned owner ${employeeId} for ${storeName}. A password change is required on first login.`,
  );
} catch (error) {
  await admin.auth.admin.deleteUser(created.data.user.id);
  await admin.from("stores").delete().eq("id", store.data.id);
  throw error;
}
