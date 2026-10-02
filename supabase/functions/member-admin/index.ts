import type { SupabaseClient } from "@supabase/supabase-js";
import { actorFromRequest } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";

const validPermissions = new Set([
  "menu.view",
  "orders.create",
  "orders.edit",
  "orders.cancel",
  "bills.view",
  "menu.manage",
  "reports.daily.view",
  "reports.monthly.view",
]);

interface MemberInput {
  id?: string;
  name: string;
  password?: string;
  role: "manager" | "cashier";
  permissions: string[];
  active: boolean;
}

function validatePermissions(permissions: string[]): void {
  if (permissions.some((permission) => !validPermissions.has(permission))) {
    throw new Error("VALIDATION_ERROR");
  }
  if (
    permissions.includes("orders.create") &&
    !permissions.includes("menu.view")
  ) {
    throw new Error("orders.create requires menu.view");
  }

  if (
    (permissions.includes("orders.edit") ||
      permissions.includes("orders.cancel")) &&
    !permissions.includes("bills.view")
  ) {
    throw new Error("Order changes require bills.view");
  }
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw error;
}

async function listMembers(
  admin: SupabaseClient,
  storeId: string,
): Promise<unknown[]> {
  const { data, error } = await admin
    .from("memberships")
    .select(
      "id,employee_id,role,active,created_at,profiles!inner(name,must_change_password),member_permissions(permission_key)",
    )
    .eq("store_id", storeId)
    .order("created_at");
  if (error) throw error;

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;

    const permissions =
      row.role === "owner"
        ? [...validPermissions]
        : (row.member_permissions ?? []).map(
            (grant: { permission_key: string }) => grant.permission_key,
          );

    return {
      id: row.id,
      employeeId: row.employee_id,
      name: profile?.name,
      role: row.role,
      permissions,
      mustChangePassword: profile?.must_change_password,
      active: row.active,
      createdAt: row.created_at,
    };
  });
}

async function generateEmployeeId(admin: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const employeeId = `EMP-${suffix}`.toUpperCase();

    const { data, error } = await admin
      .from("memberships")
      .select("id")
      .eq("employee_id", employeeId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return employeeId;
  }
  throw new Error("Employee ID generation failed.");
}

async function removeNewAccount(
  admin: SupabaseClient,
  userId: string,
): Promise<void> {
  await admin.from("profiles").delete().eq("id", userId);
  await admin.auth.admin.deleteUser(userId);
}

async function createMember(
  admin: SupabaseClient,
  actor: { storeId: string; membershipId: string },
  member: MemberInput,
): Promise<string> {
  if (!member.password || member.password.length < 10) {
    throw new Error("Password must contain at least 10 characters.");
  }

  const employeeId = await generateEmployeeId(admin);
  const authEmail = `${employeeId.toLowerCase()}@employees.fries-lab.invalid`;
  const created = await admin.auth.admin.createUser({
    email: authEmail,
    password: member.password,
    email_confirm: true,
  });
  if (created.error || !created.data.user) {
    throw created.error ?? new Error("User creation failed.");
  }

  const userId = created.data.user.id;
  try {
    const profile = await admin.from("profiles").insert({
      id: userId,
      name: member.name.trim(),
      active: member.active,
      must_change_password: false,
    });
    throwIfError(profile.error);

    const inserted = await admin
      .from("memberships")
      .insert({
        store_id: actor.storeId,
        profile_id: userId,
        employee_id: employeeId,
        auth_email: authEmail,
        role: member.role,
        active: member.active,
      })
      .select("id")
      .single();
    if (inserted.error || !inserted.data) {
      throw inserted.error ?? new Error("Member creation failed.");
    }

    const membershipId = inserted.data.id;
    if (member.permissions.length) {
      const grants = await admin.from("member_permissions").insert(
        member.permissions.map((permission) => ({
          membership_id: membershipId,
          permission_key: permission,
        })),
      );
      throwIfError(grants.error);
    }

    const audit = await admin.from("audit_events").insert({
      store_id: actor.storeId,
      actor_membership_id: actor.membershipId,
      subject_membership_id: membershipId,
      action: "member.created",
      details: {
        role: member.role,
        permissions: member.permissions,
        active: member.active,
      },
    });
    throwIfError(audit.error);
    return membershipId;
  } catch (error: unknown) {
    await removeNewAccount(admin, userId);
    throw error;
  }
}

async function updateMember(
  admin: SupabaseClient,
  actor: { storeId: string; membershipId: string },
  member: MemberInput,
): Promise<string> {
  const targetResult = await admin
    .from("memberships")
    .select(
      "id,profile_id,role,permission_version,active,profiles!inner(name,active)",
    )
    .eq("id", member.id)
    .eq("store_id", actor.storeId)
    .single();
  if (targetResult.error || !targetResult.data) {
    throw targetResult.error ?? new Error("Member not found.");
  }
  const target = targetResult.data;
  if (target.role === "owner") throw new Error("The owner cannot be edited.");

  const oldProfile = Array.isArray(target.profiles)
    ? target.profiles[0]
    : target.profiles;
  const oldGrants = await admin
    .from("member_permissions")
    .select("permission_key")
    .eq("membership_id", target.id);
  if (oldGrants.error) throw oldGrants.error;

  try {
    const profile = await admin
      .from("profiles")
      .update({
        name: member.name.trim(),
        active: member.active,
        ...(member.password ? { must_change_password: false } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.profile_id);
    throwIfError(profile.error);

    const membership = await admin
      .from("memberships")
      .update({
        role: member.role,
        active: member.active,
        permission_version: target.permission_version + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);
    throwIfError(membership.error);

    const removed = await admin
      .from("member_permissions")
      .delete()
      .eq("membership_id", target.id);
    throwIfError(removed.error);
    if (member.permissions.length) {
      const grants = await admin.from("member_permissions").insert(
        member.permissions.map((permission) => ({
          membership_id: target.id,
          permission_key: permission,
        })),
      );
      throwIfError(grants.error);
    }

    if (member.password) {
      const password = await admin.auth.admin.updateUserById(
        target.profile_id,
        { password: member.password },
      );
      if (password.error) throw password.error;
      const passwordAudit = await admin.from("audit_events").insert({
        store_id: actor.storeId,
        actor_membership_id: actor.membershipId,
        subject_membership_id: target.id,
        action: "member.password_reset",
      });
      throwIfError(passwordAudit.error);
    }

    const audit = await admin.from("audit_events").insert({
      store_id: actor.storeId,
      actor_membership_id: actor.membershipId,
      subject_membership_id: target.id,
      action: "member.updated",
      details: {
        role: member.role,
        permissions: member.permissions,
        active: member.active,
      },
    });
    throwIfError(audit.error);
    return target.id;
  } catch (error: unknown) {
    await admin
      .from("profiles")
      .update({
        name: oldProfile?.name,
        active: oldProfile?.active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.profile_id);
    await admin
      .from("memberships")
      .update({
        role: target.role,
        active: target.active,
        permission_version: target.permission_version,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);
    await admin
      .from("member_permissions")
      .delete()
      .eq("membership_id", target.id);
    if (oldGrants.data?.length) {
      await admin.from("member_permissions").insert(
        oldGrants.data.map((grant) => ({
          membership_id: target.id,
          permission_key: grant.permission_key,
        })),
      );
    }
    throw error;
  }
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { admin, actor } = await actorFromRequest(request);
    if (actor.role !== "owner") throw new Error("FORBIDDEN");

    const body = (await request.json()) as {
      action: "list" | "save" | "deactivate";
      id?: string;
      member?: MemberInput;
    };

    if (body.action === "list") {
      return json(await listMembers(admin, actor.storeId));
    }

    if (body.action === "deactivate") {
      const targetResult = await admin
        .from("memberships")
        .select("id,profile_id,role")
        .eq("id", body.id)
        .eq("store_id", actor.storeId)
        .single();
      if (targetResult.error || !targetResult.data) {
        throw targetResult.error ?? new Error("Member not found.");
      }

      const target = targetResult.data;
      if (target.role === "owner") {
        throw new Error("The owner cannot be deactivated.");
      }

      const membership = await admin
        .from("memberships")
        .update({
          active: false,
          permission_version: 999999,
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id);
      throwIfError(membership.error);
      const profile = await admin
        .from("profiles")
        .update({ active: false, updated_at: new Date().toISOString() })
        .eq("id", target.profile_id);
      throwIfError(profile.error);
      const audit = await admin.from("audit_events").insert({
        store_id: actor.storeId,
        actor_membership_id: actor.membershipId,
        subject_membership_id: target.id,
        action: "member.deactivated",
      });
      throwIfError(audit.error);
      return json({ success: true });
    }

    const member = body.member;
    if (
      !member ||
      !member.name.trim() ||
      !["manager", "cashier"].includes(member.role)
    ) {
      throw new Error("VALIDATION_ERROR");
    }
    if (member.password && member.password.length < 10) {
      throw new Error("Password must contain at least 10 characters.");
    }
    validatePermissions(member.permissions);

    const membershipId = member.id
      ? await updateMember(admin, actor, member)
      : await createMember(admin, actor, member);
    const members = await listMembers(admin, actor.storeId);

    return json(
      members.find(
        (candidate) => (candidate as { id: string }).id === membershipId,
      ),
    );
  } catch (error: unknown) {
    return errorResponse(
      error,
      error instanceof Error && error.message === "FORBIDDEN" ? 403 : 400,
    );
  }
});
