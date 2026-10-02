import type { SupabaseClient } from "@supabase/supabase-js";
import { type Actor, secretKey } from "./auth.ts";

const encoder = new TextEncoder();

async function sign(value: string): Promise<string> {
  const signingSecret =
    Deno.env.get("PERMISSION_SIGNING_SECRET") || secretKey();
  if (!signingSecret) throw new Error("Permission signing is not configured.");

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(value),
  );

  return btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export async function currentPermissionSnapshot(
  admin: SupabaseClient,
  actor: Actor,
): Promise<{ id: string; token: string; version: number; issuedAt: string }> {
  const membership = await admin
    .from("memberships")
    .select("permission_version")
    .eq("id", actor.membershipId)
    .single();
  if (membership.error || !membership.data) {
    throw membership.error ?? new Error("Membership not found.");
  }

  const version = membership.data.permission_version;
  const existing = await admin
    .from("permission_snapshots")
    .select("id,signature,issued_at")
    .eq("membership_id", actor.membershipId)
    .eq("version", version)
    .maybeSingle();

  if (existing.data) {
    return {
      id: existing.data.id,
      token: `${existing.data.id}.${existing.data.signature}`,
      version,
      issuedAt: existing.data.issued_at,
    };
  }
  const id = crypto.randomUUID();
  const signature = await sign(
    `${id}:${actor.membershipId}:${version}:${actor.permissions.join(",")}`,
  );
  const issuedAt = new Date().toISOString();
  const inserted = await admin.from("permission_snapshots").insert({
    id,
    membership_id: actor.membershipId,
    version,
    permissions: actor.permissions,
    signature,
    issued_at: issuedAt,
  });
  if (inserted.error) throw inserted.error;

  return { id, token: `${id}.${signature}`, version, issuedAt };
}
