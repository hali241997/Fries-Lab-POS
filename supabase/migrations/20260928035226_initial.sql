create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'manager', 'cashier');
create type public.order_status as enum ('active', 'cancelled');

create table public.stores (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Asia/Karachi',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  name text not null,
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  employee_id text not null unique check (employee_id = upper(trim(employee_id))),
  auth_email text not null unique,
  role public.member_role not null,
  active boolean not null default true,
  permission_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, profile_id)
);

create table public.permission_definitions (
  key text primary key,
  description text not null
);

insert into public.permission_definitions(key, description) values
  ('menu.view', 'View the cached menu'),
  ('orders.create', 'Create orders'),
  ('orders.edit', 'Create replacement order revisions'),
  ('orders.cancel', 'Cancel orders'),
  ('bills.view', 'View, search, print, and export bills'),
  ('menu.manage', 'Create, edit, and archive menu items'),
  ('reports.daily.view', 'View and export daily reports'),
  ('reports.monthly.view', 'View and export monthly reports');

create table public.role_permission_defaults (
  role public.member_role not null,
  permission_key text not null references public.permission_definitions(key),
  primary key (role, permission_key)
);

insert into public.role_permission_defaults(role, permission_key)
select 'owner'::public.member_role, key from public.permission_definitions;
insert into public.role_permission_defaults(role, permission_key)
select 'manager'::public.member_role, key from public.permission_definitions;
insert into public.role_permission_defaults(role, permission_key) values
  ('cashier', 'menu.view'), ('cashier', 'orders.create'), ('cashier', 'bills.view');

create table public.member_permissions (
  membership_id uuid not null references public.memberships(id) on delete cascade,
  permission_key text not null references public.permission_definitions(key),
  primary key (membership_id, permission_key)
);

create table public.permission_snapshots (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete restrict,
  version integer not null,
  permissions text[] not null,
  signature text not null,
  issued_at timestamptz not null default now(),
  unique (membership_id, version)
);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  installation_id uuid not null unique,
  terminal_code text not null,
  secret_hash text not null,
  active boolean not null default true,
  registered_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (store_id, terminal_code)
);

create table public.login_attempts (
  key text primary key,
  attempts integer not null default 0,
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  name text not null,
  name_normalized text not null,
  cost_price_paisas bigint not null check (cost_price_paisas >= 0),
  sale_price_paisas bigint not null check (sale_price_paisas >= 0),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (store_id, name_normalized)
);

create table public.orders (
  id uuid primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  order_no text not null,
  occurred_at timestamptz not null,
  status public.order_status not null,
  current_revision_id uuid not null,
  created_by_membership_id uuid references public.memberships(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  source text not null check (source in ('app', 'legacy')),
  updated_at timestamptz not null,
  unique (store_id, order_no)
);

create table public.order_revisions (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  revision_number integer not null,
  customer_name text not null,
  total_paisas bigint not null check (total_paisas >= 0),
  created_at timestamptz not null,
  created_by_membership_id uuid references public.memberships(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  status text not null check (status in ('current', 'superseded', 'cancelled')),
  unique (order_id, revision_number)
);

create table public.order_items (
  id uuid primary key,
  revision_id uuid not null references public.order_revisions(id) on delete restrict,
  menu_item_id uuid references public.menu_items(id) on delete restrict,
  item_name text not null,
  quantity integer not null check (quantity > 0),
  cost_price_paisas bigint not null check (cost_price_paisas >= 0),
  sale_price_paisas bigint not null check (sale_price_paisas >= 0)
);

create table public.order_events (
  id uuid primary key,
  order_id uuid not null references public.orders(id) on delete restrict,
  revision_id uuid references public.order_revisions(id) on delete restrict,
  event_type text not null check (event_type in ('created', 'revised', 'cancelled')),
  occurred_at timestamptz not null,
  actor_membership_id uuid references public.memberships(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  details jsonb not null default '{}'::jsonb
);

create table public.sync_operations (
  id uuid primary key,
  store_id uuid not null references public.stores(id) on delete restrict,
  aggregate_type text not null,
  aggregate_id uuid not null,
  operation_type text not null,
  actor_membership_id uuid references public.memberships(id) on delete restrict,
  device_id uuid references public.devices(id) on delete restrict,
  permission_snapshot_id uuid references public.permission_snapshots(id) on delete restrict,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null
);

create table public.changes (
  sequence bigint generated always as identity primary key,
  store_id uuid not null references public.stores(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  operation text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);
create index changes_store_sequence_idx on public.changes(store_id, sequence);

create table public.conflict_notifications (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  aggregate_type text not null,
  aggregate_id uuid not null,
  losing_payload jsonb not null,
  winning_payload jsonb not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete restrict,
  actor_membership_id uuid references public.memberships(id) on delete restrict,
  subject_membership_id uuid references public.memberships(id) on delete restrict,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- PostgreSQL does not create indexes for foreign keys automatically. These
-- indexes keep joins, audit queries, and parent-row checks predictable as the
-- store history grows.
create index memberships_profile_id_idx on public.memberships(profile_id);
create index role_permission_defaults_permission_key_idx on public.role_permission_defaults(permission_key);
create index member_permissions_permission_key_idx on public.member_permissions(permission_key);
create index orders_created_by_membership_id_idx on public.orders(created_by_membership_id);
create index orders_device_id_idx on public.orders(device_id);
create index order_revisions_created_by_membership_id_idx on public.order_revisions(created_by_membership_id);
create index order_revisions_device_id_idx on public.order_revisions(device_id);
create index order_items_revision_id_idx on public.order_items(revision_id);
create index order_items_menu_item_id_idx on public.order_items(menu_item_id);
create index order_events_order_id_idx on public.order_events(order_id);
create index order_events_revision_id_idx on public.order_events(revision_id);
create index order_events_actor_membership_id_idx on public.order_events(actor_membership_id);
create index order_events_device_id_idx on public.order_events(device_id);
create index sync_operations_store_id_idx on public.sync_operations(store_id);
create index sync_operations_actor_membership_id_idx on public.sync_operations(actor_membership_id);
create index sync_operations_device_id_idx on public.sync_operations(device_id);
create index sync_operations_permission_snapshot_id_idx on public.sync_operations(permission_snapshot_id);
create index conflict_notifications_store_created_at_idx on public.conflict_notifications(store_id, created_at);
create index audit_events_store_created_at_idx on public.audit_events(store_id, created_at);
create index audit_events_actor_membership_id_idx on public.audit_events(actor_membership_id);
create index audit_events_subject_membership_id_idx on public.audit_events(subject_membership_id);

alter table public.stores enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.permission_definitions enable row level security;
alter table public.role_permission_defaults enable row level security;
alter table public.member_permissions enable row level security;
alter table public.permission_snapshots enable row level security;
alter table public.devices enable row level security;
alter table public.login_attempts enable row level security;
alter table public.menu_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_revisions enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.sync_operations enable row level security;
alter table public.changes enable row level security;
alter table public.conflict_notifications enable row level security;
alter table public.audit_events enable row level security;

-- The desktop client never accesses application tables directly. All access
-- crosses an authenticated Edge Function boundary, so public client roles do
-- not need schema or table privileges.
revoke all on schema public from public;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Edge Functions use the server-only service role. Keep its Data API access
-- explicit so the schema works with Supabase's opt-in table exposure defaults.
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

create or replace function public.next_terminal_code(target_store uuid)
returns text language plpgsql security definer set search_path = public as $$
declare next_number integer;
begin
  select coalesce(max(substring(terminal_code from 2)::integer), 0) + 1 into next_number
  from public.devices where store_id = target_store and terminal_code ~ '^T[0-9]+$';
  return 'T' || lpad(next_number::text, 2, '0');
end;
$$;

revoke all on function public.next_terminal_code(uuid) from public, anon, authenticated;
grant execute on function public.next_terminal_code(uuid) to service_role;

create or replace function public.apply_order_sync(
  p_store_id uuid,
  p_actor_membership_id uuid,
  p_device_id uuid,
  p_snapshot_id uuid,
  p_operation_id uuid,
  p_operation_type text,
  p_occurred_at timestamptz,
  p_bill jsonb
) returns void language plpgsql security definer set search_path = public as $$
declare
  line jsonb;
  old_revision_id uuid;
begin
  select current_revision_id into old_revision_id from public.orders where id = (p_bill->>'id')::uuid;

  insert into public.orders(id, store_id, order_no, occurred_at, status, current_revision_id, created_by_membership_id, device_id, source, updated_at)
  values (
    (p_bill->>'id')::uuid, p_store_id, p_bill->>'orderNo', (p_bill->>'dateTime')::timestamptz,
    (p_bill->>'status')::public.order_status, (p_bill->>'revisionId')::uuid, p_actor_membership_id,
    p_device_id, p_bill->>'source', now()
  )
  on conflict (id) do update set
    status = excluded.status,
    current_revision_id = excluded.current_revision_id,
    updated_at = excluded.updated_at;

  if old_revision_id is not null and old_revision_id <> (p_bill->>'revisionId')::uuid then
    update public.order_revisions set status = 'superseded' where id = old_revision_id and status = 'current';
  end if;

  insert into public.order_revisions(id, order_id, revision_number, customer_name, total_paisas, created_at, created_by_membership_id, device_id, status)
  values (
    (p_bill->>'revisionId')::uuid, (p_bill->>'id')::uuid, (p_bill->>'revisionNumber')::integer,
    p_bill->>'customerName', round((p_bill->>'total')::numeric * 100)::bigint,
    (p_bill->>'revisedAt')::timestamptz, p_actor_membership_id, p_device_id,
    case when p_bill->>'status' = 'cancelled' then 'cancelled' else 'current' end
  )
  on conflict (id) do update set
    customer_name = excluded.customer_name,
    total_paisas = excluded.total_paisas,
    status = excluded.status;

  for line in select value from jsonb_array_elements(p_bill->'lines') loop
    insert into public.order_items(id, revision_id, menu_item_id, item_name, quantity, cost_price_paisas, sale_price_paisas)
    values (
      (line->>'id')::uuid, (p_bill->>'revisionId')::uuid, nullif(line->>'menuItemId', '')::uuid,
      line->>'name', (line->>'quantity')::integer,
      round((line->>'costPrice')::numeric * 100)::bigint,
      round((line->>'salePrice')::numeric * 100)::bigint
    )
    on conflict (id) do update set
      quantity = excluded.quantity,
      cost_price_paisas = excluded.cost_price_paisas,
      sale_price_paisas = excluded.sale_price_paisas;
  end loop;

  insert into public.order_events(id, order_id, revision_id, event_type, occurred_at, actor_membership_id, device_id, details)
  values (
    p_operation_id, (p_bill->>'id')::uuid, (p_bill->>'revisionId')::uuid,
    case when p_operation_type like '%created' or p_operation_type = 'order.imported' then 'created'
         when p_operation_type like '%revised' then 'revised' else 'cancelled' end,
    p_occurred_at, p_actor_membership_id, p_device_id,
    case when p_bill->>'cancellationReason' is null then '{}'::jsonb else jsonb_build_object('reason', p_bill->>'cancellationReason') end
  ) on conflict (id) do nothing;

  insert into public.sync_operations(id, store_id, aggregate_type, aggregate_id, operation_type, actor_membership_id, device_id, permission_snapshot_id, occurred_at, payload)
  values (p_operation_id, p_store_id, 'order', (p_bill->>'id')::uuid, p_operation_type, p_actor_membership_id, p_device_id, p_snapshot_id, p_occurred_at, p_bill)
  on conflict (id) do nothing;

  insert into public.changes(store_id, entity_type, entity_id, operation, payload)
  values (p_store_id, 'order', (p_bill->>'id')::uuid, p_operation_type, p_bill);
end;
$$;

revoke all on function public.apply_order_sync(uuid, uuid, uuid, uuid, uuid, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.apply_order_sync(uuid, uuid, uuid, uuid, uuid, text, timestamptz, jsonb) to service_role;
