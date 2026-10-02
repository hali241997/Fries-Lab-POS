import { createClient } from "@supabase/supabase-js";
import {
  actorFromRequest,
  memberDto,
  publishableKey,
} from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { admin, actor } = await actorFromRequest(request);
    const body = (await request.json()) as {
      newPassword?: string;
    };
    if (!body.newPassword || body.newPassword.length < 10) {
      throw new Error("Password must contain at least 10 characters.");
    }

    const { data: membership, error: membershipError } = await admin
      .from("memberships")
      .select("auth_email")
      .eq("id", actor.membershipId)
      .single();
    if (membershipError || !membership?.auth_email) {
      throw new Error("The employee account could not be found.");
    }

    const anon = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      publishableKey(),
      { auth: { persistSession: false } },
    );

    const result = await admin.auth.admin.updateUserById(actor.userId, {
      password: body.newPassword,
    });
    if (result.error) throw result.error;

    const profile = await admin
      .from("profiles")
      .update({
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", actor.userId);
    if (profile.error) throw profile.error;

    const audit = await admin.from("audit_events").insert({
      store_id: actor.storeId,
      actor_membership_id: actor.membershipId,
      subject_membership_id: actor.membershipId,
      action: "member.password_changed",
    });
    if (audit.error) throw audit.error;

    actor.mustChangePassword = false;
    const refreshed = await anon.auth.signInWithPassword({
      email: membership.auth_email,
      password: body.newPassword,
    });
    if (refreshed.error || !refreshed.data.session) {
      throw new Error("The new session could not be established.");
    }

    return json({
      member: memberDto(actor),
      accessToken: refreshed.data.session.access_token,
      refreshToken: refreshed.data.session.refresh_token,
      expiresIn: refreshed.data.session.expires_in,
    });
  } catch (error: unknown) {
    return errorResponse(error, 400);
  }
});
