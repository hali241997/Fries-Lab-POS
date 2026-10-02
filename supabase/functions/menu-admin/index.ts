import { actorFromRequest, requirePermission } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";

function dto(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    costPrice: Number(row.cost_price_paisas) / 100,
    salePrice: Number(row.sale_price_paisas) / 100,
    active: !row.deleted_at,
    availableForSale: row.available_for_sale,
    version: row.version,
    updatedAt: row.updated_at,
  };
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { admin, actor } = await actorFromRequest(request);
    requirePermission(actor, "menu.manage");
    const body = (await request.json()) as {
      action: "create" | "update" | "archive";
      id?: string;
      name: string;
      costPrice: number;
      salePrice: number;
      availableForSale: boolean;
      expectedVersion?: number;
    };
    if (
      !body.name?.trim() ||
      body.costPrice < 0 ||
      body.salePrice < 0 ||
      typeof body.availableForSale !== "boolean"
    ) {
      throw new Error("VALIDATION_ERROR");
    }

    let result;
    if (body.action === "create") {
      result = await admin
        .from("menu_items")
        .insert({
          store_id: actor.storeId,
          name: body.name.trim(),
          name_normalized: body.name.trim().toLowerCase(),
          cost_price_paisas: Math.round(body.costPrice * 100),
          sale_price_paisas: Math.round(body.salePrice * 100),
          available_for_sale: body.availableForSale,
        })
        .select()
        .single();
    } else {
      if (!body.id || body.expectedVersion === undefined) {
        throw new Error("VALIDATION_ERROR");
      }

      result = await admin
        .from("menu_items")
        .update({
          name: body.name.trim(),
          name_normalized: body.name.trim().toLowerCase(),
          cost_price_paisas: Math.round(body.costPrice * 100),
          sale_price_paisas: Math.round(body.salePrice * 100),
          available_for_sale: body.availableForSale,
          version: body.expectedVersion + 1,
          updated_at: new Date().toISOString(),
          deleted_at:
            body.action === "archive" ? new Date().toISOString() : null,
        })
        .eq("id", body.id)
        .eq("store_id", actor.storeId)
        .eq("version", body.expectedVersion)
        .select()
        .single();
    }
    if (result.error || !result.data) {
      throw new Error(
        result.error?.code === "PGRST116"
          ? "CONFLICT"
          : (result.error?.message ?? "Menu update failed."),
      );
    }

    const item = dto(result.data);
    await admin.from("changes").insert({
      store_id: actor.storeId,
      entity_type: "menu_item",
      entity_id: result.data.id,
      operation: body.action,
      payload: item,
    });
    await admin.from("audit_events").insert({
      store_id: actor.storeId,
      actor_membership_id: actor.membershipId,
      action: `menu.${body.action}`,
      details: { itemId: result.data.id },
    });

    return json(item);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "";
    return errorResponse(
      error,
      message === "CONFLICT" ? 409 : message === "FORBIDDEN" ? 403 : 400,
    );
  }
});
