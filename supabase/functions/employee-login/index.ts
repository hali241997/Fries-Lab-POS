import { createClient } from "@supabase/supabase-js";
import { adminClient, memberDto, publishableKey } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";
import { currentPermissionSnapshot } from "../_shared/signing.ts";

const encoder = new TextEncoder();

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const body = (await request.json()) as {
      employeeId?: string;
      password?: string;
      installationId?: string;
      deviceSecret?: string;
    };

    const employeeId = body.employeeId?.trim().toUpperCase() ?? "";
    if (!employeeId || !body.password || !body.installationId) {
      return json({ error: "Invalid employee ID or password." }, 401);
    }

    const admin = adminClient();
    const rateKey = await sha256(
      `${request.headers.get("x-forwarded-for") ?? "unknown"}:${employeeId}`,
    );
    const { data: attempt } = await admin
      .from("login_attempts")
      .select("*")
      .eq("key", rateKey)
      .maybeSingle();
    if (
      attempt?.blocked_until &&
      Date.parse(attempt.blocked_until) > Date.now()
    ) {
      return json({ error: "Too many attempts. Try again later." }, 429);
    }

    const { data: membership } = await admin
      .from("memberships")
      .select(
        "id,store_id,profile_id,employee_id,auth_email,role,active,permission_version,profiles!inner(name,active,must_change_password)",
      )
      .eq("employee_id", employeeId)
      .maybeSingle();
    const profile = Array.isArray(membership?.profiles)
      ? membership.profiles[0]
      : membership?.profiles;
    if (!membership?.active || !profile?.active) {
      return json({ error: "Invalid employee ID or password." }, 401);
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      publishableKey(),
      { auth: { persistSession: false } },
    );
    const { data: signedIn, error: signInError } =
      await anon.auth.signInWithPassword({
        email: membership.auth_email,
        password: body.password,
      });
    if (signInError || !signedIn.session) {
      const attempts =
        attempt &&
        Date.now() - Date.parse(attempt.window_started_at) < 15 * 60_000
          ? attempt.attempts + 1
          : 1;
      await admin.from("login_attempts").upsert({
        key: rateKey,
        attempts,
        window_started_at:
          attempts === 1 ? new Date().toISOString() : attempt.window_started_at,
        blocked_until:
          attempts >= 5
            ? new Date(Date.now() + 15 * 60_000).toISOString()
            : null,
      });
      return json({ error: "Invalid employee ID or password." }, 401);
    }

    await admin.from("login_attempts").delete().eq("key", rateKey);
    const { data: grants } = await admin
      .from("member_permissions")
      .select("permission_key")
      .eq("membership_id", membership.id);

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

    const actor = {
      userId: membership.profile_id,
      membershipId: membership.id,
      storeId: membership.store_id,
      employeeId,
      name: profile.name,
      role: membership.role,
      permissions,
      mustChangePassword: profile.must_change_password,
    };

    const { data: existingDevice } = await admin
      .from("devices")
      .select("*")
      .eq("installation_id", body.installationId)
      .maybeSingle();
    let device = existingDevice;
    let newSecret: string | undefined;
    if (!device) {
      newSecret = crypto.randomUUID() + crypto.randomUUID();
      const { data: terminalCode } = await admin.rpc("next_terminal_code", {
        target_store: membership.store_id,
      });
      const inserted = await admin
        .from("devices")
        .insert({
          store_id: membership.store_id,
          installation_id: body.installationId,
          terminal_code: terminalCode,
          secret_hash: await sha256(newSecret),
        })
        .select()
        .single();
      if (inserted.error) throw inserted.error;
      device = inserted.data;
    } else if (
      !device.active ||
      device.store_id !== membership.store_id ||
      !body.deviceSecret ||
      (await sha256(body.deviceSecret)) !== device.secret_hash
    ) {
      return json({ error: "This terminal must be activated again." }, 401);
    }

    await admin
      .from("devices")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", device.id);
    const permissionSnapshot = await currentPermissionSnapshot(admin, actor);

    return json({
      accessToken: signedIn.session.access_token,
      refreshToken: signedIn.session.refresh_token,
      expiresIn: signedIn.session.expires_in,
      member: memberDto(actor),
      storeId: membership.store_id,
      permissionSnapshot,
      device: {
        id: device.id,
        terminalCode: device.terminal_code,
        ...(newSecret ? { secret: newSecret } : {}),
      },
    });
  } catch (error: unknown) {
    return errorResponse(error, 500);
  }
});
