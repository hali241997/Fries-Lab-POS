import { actorFromRequest, memberDto } from "../_shared/auth.ts";
import { errorResponse, handleOptions, json } from "../_shared/http.ts";
import { currentPermissionSnapshot } from "../_shared/signing.ts";

interface BillLine {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  salePrice: number;
  costPrice: number;
}
interface BillPayload {
  id: string;
  revisionId: string;
  revisionNumber: number;
  orderNo: string;
  dateTime: string;
  revisedAt: string;
  customerName: string;
  lines: BillLine[];
  total: number;
  status: "active" | "cancelled";
  cancellationReason: string | null;
  source: "app" | "legacy";
}
interface Operation {
  id: string;
  type: string;
  aggregateType: string;
  aggregateId: string;
  payload: BillPayload;
  actorMemberId: string | null;
  terminalId: string | null;
  permissionSnapshot: string | null;
  occurredAt: string;
}

class PermanentOperationError extends Error {}

function throwIfError(error: { message: string } | null): void {
  if (error) throw error;
}

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    const { admin, actor } = await actorFromRequest(request);
    const body = (await request.json()) as {
      cursor?: string;
      operations?: Operation[];
    };
    const acceptedOperationIds: string[] = [];
    const permanentErrors: Array<{ operationId: string; message: string }> = [];
    const operations = [...(body.operations ?? [])].sort((left, right) => {
      const leftPriority = left.type === "menu.imported" ? 0 : 1;
      const rightPriority = right.type === "menu.imported" ? 0 : 1;
      return leftPriority - rightPriority;
    });

    for (const operation of operations) {
      try {
        const existing = await admin
          .from("sync_operations")
          .select("id")
          .eq("id", operation.id)
          .maybeSingle();
        throwIfError(existing.error);
        if (existing.data) {
          acceptedOperationIds.push(operation.id);
          continue;
        }

        const permission = operation.type === "menu.imported"
          ? "menu.manage"
          : operation.type === "order.created" ||
              operation.type === "order.imported"
          ? "orders.create"
          : operation.type === "order.revised"
          ? "orders.edit"
          : "orders.cancel";
        if (
          operation.actorMemberId &&
          operation.actorMemberId !== actor.membershipId
        ) {
          throw new PermanentOperationError("Actor mismatch.");
        }

        const [snapshotId, suppliedSignature] =
          operation.permissionSnapshot?.split(".") ?? [];
        if (!snapshotId || !suppliedSignature) {
          throw new PermanentOperationError("Missing permission snapshot.");
        }

        const snapshot = await admin
          .from("permission_snapshots")
          .select("id,membership_id,permissions,signature")
          .eq("id", snapshotId)
          .eq("membership_id", actor.membershipId)
          .maybeSingle();
        throwIfError(snapshot.error);

        if (
          !snapshot.data ||
          snapshot.data.signature !== suppliedSignature ||
          !snapshot.data.permissions.includes(permission)
        ) {
          throw new PermanentOperationError("Permission snapshot rejected.");
        }

        if (operation.type === "menu.imported") {
          const item = operation.payload as unknown as {
            id: string;
            name: string;
            costPrice: number;
            salePrice: number;
            active: boolean;
            availableForSale?: boolean;
            version: number;
            updatedAt: string;
          };
          const menu = await admin.from("menu_items").upsert({
            id: item.id,
            store_id: actor.storeId,
            name: item.name,
            name_normalized: item.name.trim().toLowerCase(),
            cost_price_paisas: Math.round(item.costPrice * 100),
            sale_price_paisas: Math.round(item.salePrice * 100),
            available_for_sale: item.availableForSale ?? true,
            version: item.version,
            updated_at: item.updatedAt,
            deleted_at: item.active ? null : item.updatedAt,
          });
          throwIfError(menu.error);

          const operationRecord = await admin.from("sync_operations").insert({
            id: operation.id,
            store_id: actor.storeId,
            aggregate_type: operation.aggregateType,
            aggregate_id: operation.aggregateId,
            operation_type: operation.type,
            actor_membership_id: actor.membershipId,
            device_id: operation.terminalId,
            permission_snapshot_id: snapshotId,
            occurred_at: operation.occurredAt,
            payload: item,
          });
          throwIfError(operationRecord.error);

          const change = await admin.from("changes").insert({
            store_id: actor.storeId,
            entity_type: "menu_item",
            entity_id: item.id,
            operation: "imported",
            payload: item,
          });
          throwIfError(change.error);

          acceptedOperationIds.push(operation.id);
          continue;
        }
        let bill = { ...operation.payload };
        const previous = await admin
          .from("orders")
          .select("current_revision_id,updated_at")
          .eq("id", bill.id)
          .maybeSingle();
        throwIfError(previous.error);

        if (
          previous.data &&
          previous.data.current_revision_id !== bill.revisionId
        ) {
          const previousRevision = await admin
            .from("order_revisions")
            .select("revision_number")
            .eq("id", previous.data.current_revision_id)
            .maybeSingle();
          throwIfError(previousRevision.error);

          const sequential = previousRevision.data &&
            bill.revisionNumber === previousRevision.data.revision_number + 1;
          if (!sequential) {
            if (previousRevision.data) {
              bill = {
                ...bill,
                revisionNumber: previousRevision.data.revision_number + 1,
              };
            }
            const conflict = await admin
              .from("conflict_notifications")
              .insert({
                store_id: actor.storeId,
                aggregate_type: "order",
                aggregate_id: bill.id,
                losing_payload: previous.data,
                winning_payload: bill,
              })
              .select()
              .single();
            if (conflict.error) throw conflict.error;
            if (conflict.data) {
              const conflictChange = await admin.from("changes").insert({
                store_id: actor.storeId,
                entity_type: "conflict",
                entity_id: conflict.data.id,
                operation: "conflict",
                payload: conflict.data,
              });
              throwIfError(conflictChange.error);
            }
          }
        }
        const applied = await admin.rpc("apply_order_sync", {
          p_store_id: actor.storeId,
          p_actor_membership_id: actor.membershipId,
          p_device_id: operation.terminalId,
          p_snapshot_id: snapshotId,
          p_operation_id: operation.id,
          p_operation_type: operation.type,
          p_occurred_at: operation.occurredAt,
          p_bill: bill,
        });
        if (applied.error) throw applied.error;

        acceptedOperationIds.push(operation.id);
      } catch (error: unknown) {
        if (error instanceof PermanentOperationError) {
          permanentErrors.push({
            operationId: operation.id,
            message: error.message,
          });
        } else {
          throw error;
        }
      }
    }
    const cursor = Number(body.cursor ?? "0");
    const { data: changes, error: changesError } = await admin
      .from("changes")
      .select("sequence,entity_type,entity_id,operation,payload")
      .eq("store_id", actor.storeId)
      .gt("sequence", cursor)
      .order("sequence")
      .limit(1000);
    if (changesError) throw changesError;

    const nextCursor = changes?.at(-1)?.sequence ?? cursor;
    return json({
      cursor: String(nextCursor),
      acceptedOperationIds,
      permanentErrors,
      changes: (changes ?? []).map((change) => ({
        sequence: String(change.sequence),
        entityType: change.entity_type,
        entityId: change.entity_id,
        operation: change.operation,
        payload: change.payload,
      })),
      member: memberDto(actor),
      permissionSnapshot: await currentPermissionSnapshot(admin, actor),
    });
  } catch (error: unknown) {
    return errorResponse(
      error,
      error instanceof Error && error.message === "AUTH_REQUIRED" ? 401 : 500,
    );
  }
});
