import {
  confirmationArgument,
  countRows,
  createAdminContext,
  deleteWhere,
  employeeAuthEmail,
  listAllAuthUsers,
} from "./supabaseAdmin.mjs";

function printHelp() {
  console.log(`Usage:
  npm run owner:remove
  npm run owner:remove -- --confirm=REMOVE_OWNER_<EMPLOYEE_ID>

OWNER_EMPLOYEE_ID identifies the owner. Without --confirm, the command performs
a read-only preview. Removal is refused when the store has another member or
business data; use db:clear only when deleting the entire project data is
intentional.`);
}

async function main() {
  if (process.argv.includes("--help")) {
    printHelp();
    return;
  }

  const employeeId = process.env.OWNER_EMPLOYEE_ID?.trim().toUpperCase();
  if (!employeeId) throw new Error("OWNER_EMPLOYEE_ID is required.");
  const { admin, hostname } = createAdminContext();
  const expectedEmail = employeeAuthEmail(employeeId);
  const authUsers = await listAllAuthUsers(admin);
  const { data: membership, error: membershipError } = await admin
    .from("memberships")
    .select("id,profile_id,store_id,employee_id,role")
    .eq("employee_id", employeeId)
    .maybeSingle();
  if (membershipError) throw membershipError;

  const expectedConfirmation = `REMOVE_OWNER_${employeeId}`;
  const suppliedConfirmation = confirmationArgument();
  console.log(`Supabase project: ${hostname}`);
  console.log(`Owner employee ID: ${employeeId}`);

  if (!membership) {
    const orphanedAuthUser = authUsers.find(
      (user) => user.email?.toLowerCase() === expectedEmail,
    );
    if (!orphanedAuthUser) {
      console.log("No matching owner membership or Auth user exists.");
      return;
    }
    console.log("Found an orphaned owner Auth user with no membership.");
    if (!suppliedConfirmation) {
      console.log(
        "\nDry run only. To remove it, run:\n" +
          `npm run owner:remove -- --confirm=${expectedConfirmation}`,
      );
      return;
    }
    if (suppliedConfirmation !== expectedConfirmation)
      throw new Error(
        `Confirmation did not match. Expected --confirm=${expectedConfirmation}`,
      );
    const { error } = await admin.auth.admin.deleteUser(
      orphanedAuthUser.id,
      false,
    );
    if (error) throw error;
    console.log(`Removed orphaned Auth user for ${employeeId}.`);
    return;
  }

  if (membership.role !== "owner")
    throw new Error(`${employeeId} is not an owner account.`);

  const { count: otherStoreMembers, error: otherMembersError } = await admin
    .from("memberships")
    .select("*", { count: "exact", head: true })
    .eq("store_id", membership.store_id)
    .neq("id", membership.id);
  if (otherMembersError) throw otherMembersError;
  const { count: otherProfileMemberships, error: profileMembershipsError } =
    await admin
      .from("memberships")
      .select("*", { count: "exact", head: true })
      .eq("profile_id", membership.profile_id)
      .neq("id", membership.id);
  if (profileMembershipsError) throw profileMembershipsError;

  const protectedData = {
    "other store members": otherStoreMembers ?? 0,
    "other profile memberships": otherProfileMemberships ?? 0,
    "menu items": await countRows(admin, "menu_items", {
      store_id: membership.store_id,
    }),
    orders: await countRows(admin, "orders", {
      store_id: membership.store_id,
    }),
    "sync operations": await countRows(admin, "sync_operations", {
      store_id: membership.store_id,
    }),
    changes: await countRows(admin, "changes", {
      store_id: membership.store_id,
    }),
    conflicts: await countRows(admin, "conflict_notifications", {
      store_id: membership.store_id,
    }),
  };
  for (const [label, count] of Object.entries(protectedData))
    console.log(`${label}: ${count}`);
  const blockers = Object.entries(protectedData).filter(([, count]) => count);
  if (blockers.length)
    throw new Error(
      "Owner removal refused because the store has members or business data. " +
        "Use db:clear only if deleting the entire project data is intentional.",
    );

  if (!suppliedConfirmation) {
    console.log(
      "\nDry run only. To permanently remove this owner, run:\n" +
        `npm run owner:remove -- --confirm=${expectedConfirmation}`,
    );
    return;
  }
  if (suppliedConfirmation !== expectedConfirmation)
    throw new Error(
      `Confirmation did not match. Expected --confirm=${expectedConfirmation}`,
    );

  await deleteWhere(admin, "audit_events", {
    store_id: membership.store_id,
  });
  await deleteWhere(admin, "permission_snapshots", {
    membership_id: membership.id,
  });
  await deleteWhere(admin, "member_permissions", {
    membership_id: membership.id,
  });
  await deleteWhere(admin, "devices", { store_id: membership.store_id });
  await deleteWhere(admin, "memberships", { id: membership.id });
  await deleteWhere(admin, "profiles", { id: membership.profile_id });
  await deleteWhere(admin, "stores", { id: membership.store_id });

  const authUser = authUsers.find(
    (user) =>
      user.id === membership.profile_id ||
      user.email?.toLowerCase() === expectedEmail,
  );
  if (authUser) {
    const { error } = await admin.auth.admin.deleteUser(authUser.id, false);
    if (error) throw error;
  }
  console.log(`Removed owner ${employeeId} and its empty store.`);
}

await main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
