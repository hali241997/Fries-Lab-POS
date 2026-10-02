import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface Actor {
  userId: string;
  membershipId: string;
  storeId: string;
  employeeId: string;
  name: string;
  role: "owner" | "manager" | "cashier";
  permissions: string[];
  mustChangePassword: boolean;
}

function namedKey(environmentName: string, legacyName: string): string {
  const encodedKeys = Deno.env.get(environmentName);
  if (encodedKeys) {
    try {
      const keys = JSON.parse(encodedKeys) as Record<string, string>;
      if (keys.default) return keys.default;
    } catch {
      // Fall through to the legacy environment variable for local development.
    }
  }
  return Deno.env.get(legacyName) ?? "";
}

export function publishableKey(): string {
  return namedKey("SUPABASE_PUBLISHABLE_KEYS", "SUPABASE_ANON_KEY");
}

export function secretKey(): string {
  return namedKey("SUPABASE_SECRET_KEYS", "SUPABASE_SERVICE_ROLE_KEY");
}

export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function actorFromRequest(
  request: Request,
): Promise<{ admin: SupabaseClient; actor: Actor }> {
  const token = request.headers
    .get("Authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("AUTH_REQUIRED");

  const admin = adminClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error("AUTH_REQUIRED");

  const { data: membership, error } = await admin
    .from("memberships")
    .select(
      "id,store_id,employee_id,role,active,profiles!inner(name,active,must_change_password)",
    )
    .eq("profile_id", userData.user.id)
    .single();

  const profile = Array.isArray(membership?.profiles)
    ? membership.profiles[0]
    : membership?.profiles;

  if (error || !membership || !membership.active || !profile?.active) {
    throw new Error("AUTH_REQUIRED");
  }

  const { data: grants, error: grantsError } = await admin
    .from("member_permissions")
    .select("permission_key")
    .eq("membership_id", membership.id);
  if (grantsError) throw grantsError;

  const permissions =
    membership.role === "owner"
      ? [
          "menu.view",
          "orders.create",
          "orders.edit",
          "orders.cancel",
          "bills.view",
          "menu.manage",
          "reports.daily.view",
          "reports.monthly.view",
        ]
      : (grants ?? []).map((row) => row.permission_key);

  return {
    admin,
    actor: {
      userId: userData.user.id,
      membershipId: membership.id,
      storeId: membership.store_id,
      employeeId: membership.employee_id,
      name: profile.name,
      role: membership.role,
      permissions,
      mustChangePassword: profile.must_change_password,
    },
  };
}

export function requirePermission(actor: Actor, permission: string): void {
  if (actor.role !== "owner" && !actor.permissions.includes(permission)) {
    throw new Error("FORBIDDEN");
  }
}

export function memberDto(actor: Actor): Record<string, unknown> {
  return {
    id: actor.membershipId,
    employeeId: actor.employeeId,
    name: actor.name,
    role: actor.role,
    permissions: actor.permissions,
    mustChangePassword: actor.mustChangePassword,
  };
}
