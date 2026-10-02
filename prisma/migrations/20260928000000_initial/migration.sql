CREATE TABLE "settings" (
  "key" TEXT NOT NULL PRIMARY KEY,
  "value" TEXT NOT NULL
);

CREATE TABLE "devices" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "installation_id" TEXT NOT NULL,
  "terminal_code" TEXT,
  "store_id" TEXT,
  "encrypted_secret" TEXT,
  "registered_at" TEXT
);

CREATE UNIQUE INDEX "devices_installation_id_key" ON "devices"("installation_id");

CREATE TABLE "permission_snapshots" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "member_id" TEXT NOT NULL,
  "permissions_json" TEXT NOT NULL,
  "signed_token" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "issued_at" TEXT NOT NULL,
  "last_validated_at" TEXT NOT NULL
);

CREATE TABLE "menu_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "name_normalized" TEXT NOT NULL,
  "cost_price_paisas" INTEGER NOT NULL,
  "sale_price_paisas" INTEGER NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "updated_at" TEXT NOT NULL,
  "deleted_at" TEXT
);

CREATE UNIQUE INDEX "menu_items_name_normalized_key" ON "menu_items"("name_normalized");

CREATE TABLE "orders" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "store_id" TEXT NOT NULL,
  "order_no" TEXT NOT NULL,
  "occurred_at" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "current_revision_id" TEXT NOT NULL,
  "created_by_member_id" TEXT,
  "terminal_id" TEXT,
  "source" TEXT NOT NULL DEFAULT 'app',
  "updated_at" TEXT NOT NULL
);

CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");

CREATE TABLE "order_revisions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "revision_number" INTEGER NOT NULL,
  "customer_name" TEXT NOT NULL,
  "total_paisas" INTEGER NOT NULL,
  "created_at" TEXT NOT NULL,
  "created_by_member_id" TEXT,
  "terminal_id" TEXT,
  "employee_name" TEXT,
  "terminal_code" TEXT,
  "status" TEXT NOT NULL,
  CONSTRAINT "order_revisions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "order_revisions_order_id_revision_number_key" ON "order_revisions"("order_id", "revision_number");

CREATE TABLE "order_items" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "revision_id" TEXT NOT NULL,
  "menu_item_id" TEXT,
  "item_name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "cost_price_paisas" INTEGER NOT NULL,
  "sale_price_paisas" INTEGER NOT NULL,
  CONSTRAINT "order_items_revision_id_fkey" FOREIGN KEY ("revision_id") REFERENCES "order_revisions" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_order_items_revision" ON "order_items"("revision_id");

CREATE TABLE "order_events" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "order_id" TEXT NOT NULL,
  "revision_id" TEXT,
  "type" TEXT NOT NULL,
  "occurred_at" TEXT NOT NULL,
  "actor_member_id" TEXT,
  "terminal_id" TEXT,
  "details_json" TEXT NOT NULL DEFAULT '{}',
  CONSTRAINT "order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_order_events_order" ON "order_events"("order_id");

CREATE TABLE "outbox_operations" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "operation_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "payload_json" TEXT NOT NULL,
  "actor_member_id" TEXT,
  "terminal_id" TEXT,
  "permission_snapshot_token" TEXT,
  "occurred_at" TEXT NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX "idx_outbox_status_time" ON "outbox_operations"("status", "occurred_at");

CREATE TABLE "sync_state" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "cursor" TEXT NOT NULL DEFAULT '0',
  "last_sync_at" TEXT
);

INSERT INTO "sync_state" ("id", "cursor", "last_sync_at") VALUES ('primary', '0', NULL);

CREATE TABLE "sync_conflicts" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "local_payload_json" TEXT NOT NULL,
  "server_payload_json" TEXT NOT NULL,
  "created_at" TEXT NOT NULL,
  "resolved_at" TEXT
);

CREATE TABLE "legacy_import_runs" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "started_at" TEXT NOT NULL,
  "completed_at" TEXT,
  "status" TEXT NOT NULL,
  "summary_json" TEXT NOT NULL,
  "backup_path" TEXT
);
