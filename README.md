# Fries Lab POS

Offline-first Electron POS for Fries Lab. PostgreSQL/Supabase is the shared cloud database; Prisma ORM and SQLite are the operational database on each terminal.

## Runtime rules

- Every app launch starts at employee login and requires Supabase connectivity.
- Authenticated ordering, bill editing/cancellation, printing, reports, and CSV exports work offline for seven continuous days after the last authenticated server validation.
- There is no keyboard or mouse inactivity timeout.
- An expired lease locks all business data and operations. Reconnecting does not unlock it; the current employee must enter their password.
- Menu and member mutations always require internet. Cached menu viewing and menu export remain available offline.
- The installation owns its terminal code. Different employees on the same laptop use the same code.

## Local data

SQLite is stored under the application user-data directory at `data/fries-lab-prisma.sqlite`. WAL mode, foreign keys, a generated Prisma client, committed Prisma migrations, append-only order revisions, and a transactional synchronization outbox are enabled. The previous pre-release database file is intentionally not migrated or opened.

Legacy CSV files are detected in the same `data` directory. The owner can run the one-time import from Manage Members. The importer creates a timestamped backup, leaves originals untouched, imports in one SQLite transaction, and enqueues deterministic cloud operations. If a legacy menu item matches an existing cloud item, the import pauses and presents every conflict in one modal so the owner can keep the cloud values, use the legacy values, or combine both records before any data is written.

## Supabase setup

This repository is connected to the hosted `fries-lab-pos` project (`ldevydqkdywrjedtjxlr`). The baseline in `supabase/migrations/20260928035226_initial.sql` and all functions under `supabase/functions` are deployed.

`config/supabase.json` contains only the public project URL and publishable API key used by Electron. Environment variables can override these values during development. Server/secret keys must never be added to that file or packaged with Electron.

To link a fresh local checkout with the Supabase CLI:

```bash
supabase login
supabase link --project-ref ldevydqkdywrjedtjxlr
supabase migration list
```

Supabase injects the server keys used by deployed Edge Functions. `PERMISSION_SIGNING_SECRET` is optional; when absent, permission snapshots are signed with the injected server key. To provision the first owner, copy `.env.example` to the ignored `.env` file, replace every placeholder with its trusted server-side value, and run:

```bash
npm run provision:owner
```

Trusted maintenance scripts load `.env` when it exists and default to a
read-only preview:

```bash
npm run owner:remove
npm run db:clear
```

Owner removal is allowed only for an otherwise empty store. The preview prints
the exact confirmation command. Full database clearing permanently removes all
application data and Fries Lab employee Auth accounts while preserving schema
migrations and static permission definitions. `db:clear` also removes the
SQLite database on the terminal where the command is run; close Fries Lab POS
before confirming it. `owner:remove` does not clear local SQLite.

Use a Supabase secret API key as `SUPABASE_SECRET_KEY` (or the legacy service-role key as a temporary fallback). The Electron runtime receives only the project URL and publishable key. Privileged access stays in Edge Functions and the one-time trusted provisioning environment.

## Development

Use Node.js 22 LTS (22.18 or newer).

```bash
npm install
npm run electron:dev
```

Quality gates:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

## Packaging

```bash
npm run electron:build
```

`better-sqlite3` is rebuilt for the installed Electron version after dependency installation and unpacked from ASAR. Build and smoke-test macOS and Windows packages on their corresponding operating systems.

## Security model

The initial owner's employee ID is supplied during provisioning. Employee IDs for managers and cashiers are generated automatically by the member-administration Edge Function and mapped to private synthetic Auth emails. The password entered by the owner is the member's login password; it is not a temporary password. Auth tokens remain in Electron's main process. Only the terminal secret is persisted, encrypted with Electron `safeStorage`. Cloud tables have RLS enabled and direct `anon`/`authenticated` table grants revoked; privileged operations are validated in Edge Functions with role/permission checks and an audit trail.
