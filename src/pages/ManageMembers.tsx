import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  ChangeEvent,
  FC,
} from "react";
import { ChevronDown, Pencil, Plus, UserX, X } from "lucide-react";
import {
  PERMISSIONS,
  ROLE_DEFAULTS,
  type LegacyMenuConflictChoice,
  type LegacyMigrationPreview,
  type MemberRole,
  type MemberSummary,
  type Permission,
  type SaveMemberRequest,
} from "../../shared/contracts";
import PasswordInput from "../components/PasswordInput";
import { userErrorMessage } from "../userError";

interface ManageMembersProps {
  isOnline: boolean;
}

interface FormState {
  id?: string;
  employeeId?: string;
  name: string;
  password: string;
  role: Exclude<MemberRole, "owner">;
  permissions: Permission[];
  active: boolean;
}

const labels: Record<Permission, string> = {
  "menu.view": "View menu",
  "orders.create": "Create orders",
  "orders.edit": "Edit orders",
  "orders.cancel": "Cancel orders",
  "bills.view": "View and print bills",
  "menu.manage": "Manage menu",
  "reports.daily.view": "View daily reports",
  "reports.monthly.view": "View monthly reports",
};

const defaults = (role: Exclude<MemberRole, "owner">): Permission[] => {
  return [...ROLE_DEFAULTS[role]];
};

const conflictOptions: Array<{
  value: LegacyMenuConflictChoice;
  description: string;
}> = [
  {
    value: "cloud",
    description:
      "Keep the current cloud menu details and link the imported history to it.",
  },
  {
    value: "legacy",
    description:
      "Replace the current menu details with the CSV values while keeping one stable item ID.",
  },
  {
    value: "combine",
    description:
      "Link both histories to one item and use the values supported by the most recent dated data.",
  },
];

const ManageMembers: FC<ManageMembersProps> = ({ isOnline }) => {
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageError, setPageError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [migrationMessage, setMigrationMessage] = useState("");
  const [migrationPreview, setMigrationPreview] =
    useState<LegacyMigrationPreview | null>(null);
  const [conflictResolutions, setConflictResolutions] = useState<
    Record<string, LegacyMenuConflictChoice>
  >({});

  const load = useCallback(async (): Promise<void> => {
    if (!isOnline) return;
    setPageError("");
    try {
      setMembers(await window.pos.getMembers());
    } catch (caught: unknown) {
      setPageError(userErrorMessage(caught, "We could not load the members."));
    }
  }, [isOnline]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = useCallback((): void => {
    setFormError("");
    setNotice("");
    setForm({
      name: "",
      password: "",
      role: "cashier",
      permissions: defaults("cashier"),
      active: true,
    });
  }, []);

  const edit = useCallback((member: MemberSummary): void => {
    if (member.role === "owner") return;
    setFormError("");
    setNotice("");
    setForm({
      id: member.id,
      employeeId: member.employeeId,
      name: member.name,
      password: "",
      role: member.role,
      permissions: [...member.permissions],
      active: member.active,
    });
  }, []);

  const toggle = useCallback((permission: Permission): void => {
    setForm((current) => {
      if (!current) return current;
      let permissions = current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      if (
        permission === "orders.create" &&
        permissions.includes(permission) &&
        !permissions.includes("menu.view")
      )
        permissions.push("menu.view");
      if (
        (permission === "orders.edit" || permission === "orders.cancel") &&
        permissions.includes(permission) &&
        !permissions.includes("bills.view")
      )
        permissions.push("bills.view");
      if (permission === "menu.view" && !permissions.includes(permission))
        permissions = permissions.filter((item) => item !== "orders.create");
      if (permission === "bills.view" && !permissions.includes(permission))
        permissions = permissions.filter(
          (item) => item !== "orders.edit" && item !== "orders.cancel",
        );
      return { ...current, permissions };
    });
  }, []);

  const formIsValid = useMemo(
    () =>
      Boolean(
        form?.name.trim() &&
        (form.id || form.password.length >= 10) &&
        (!form.password || form.password.length >= 10),
      ),
    [form],
  );

  const save = useCallback(async (): Promise<void> => {
    if (!form || !formIsValid || !isOnline || busy) return;
    const request: SaveMemberRequest = {
      ...(form.id ? { id: form.id } : {}),
      name: form.name.trim(),
      ...(form.password ? { password: form.password } : {}),
      role: form.role,
      permissions: form.permissions,
      active: form.active,
    };
    setBusy(true);
    setFormError("");
    try {
      const saved = await window.pos.saveMember(request);
      setForm(null);
      setNotice(
        request.id
          ? `${saved.name} was updated.`
          : `${saved.name} was added. Their employee ID is ${saved.employeeId}.`,
      );
      await load();
    } catch (caught: unknown) {
      setFormError(userErrorMessage(caught, "We could not save the member."));
    } finally {
      setBusy(false);
    }
  }, [busy, form, formIsValid, isOnline, load]);

  const deactivate = useCallback(
    async (member: MemberSummary): Promise<void> => {
      if (
        !window.confirm(
          `Deactivate ${member.name}? They will be locked as soon as the change is detected.`,
        )
      )
        return;
      setPageError("");
      try {
        await window.pos.deactivateMember(member.id);
        setNotice(`${member.name} was deactivated.`);
        await load();
      } catch (caught: unknown) {
        setPageError(
          userErrorMessage(caught, "We could not deactivate the member."),
        );
      }
    },
    [load],
  );

  const previewMigration = useCallback(async (): Promise<void> => {
    setMigrationMessage("");
    try {
      const response = await window.pos.previewLegacyMigration();
      const preview = { ...response, conflicts: response.conflicts ?? [] };
      if (preview.alreadyImported && preview.conflicts.length === 0) {
        setMigrationMessage("Legacy CSV data has already been imported.");
        return;
      }
      setConflictResolutions({});
      setMigrationPreview(preview);
    } catch (caught: unknown) {
      setMigrationMessage(
        userErrorMessage(
          caught,
          "We could not inspect the existing data. No changes were made.",
        ),
      );
    }
  }, []);

  const runMigration = useCallback(async (): Promise<void> => {
    if (!migrationPreview || busy) return;
    if (
      migrationPreview.conflicts.some(
        (conflict) => !conflictResolutions[conflict.key],
      )
    )
      return;
    setBusy(true);
    setMigrationMessage("");
    try {
      const wasRepair = migrationPreview.alreadyImported;
      const result = await window.pos.runLegacyMigration({
        resolutions: migrationPreview.conflicts.map((conflict) => ({
          key: conflict.key,
          choice: conflictResolutions[conflict.key] as LegacyMenuConflictChoice,
        })),
      });
      setMigrationPreview(null);
      setConflictResolutions({});
      setMigrationMessage(
        wasRepair
          ? `Resolved the menu conflicts for ${result.importedOrders} imported orders. Synchronization can continue safely.`
          : `Imported ${result.importedOrders} orders. Backup: ${result.backupPath ?? "unavailable"}`,
      );
    } catch (caught: unknown) {
      setMigrationMessage(
        userErrorMessage(
          caught,
          "We could not import the existing data. No changes were made.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }, [busy, conflictResolutions, migrationPreview]);

  const closeForm = useCallback((): void => {
    setForm(null);
    setFormError("");
  }, []);

  const closeMigrationPreview = useCallback((): void => {
    setMigrationPreview(null);
    setConflictResolutions({});
  }, []);

  const changeConflictResolution = useCallback(
    (key: string, choice: LegacyMenuConflictChoice): void => {
      setConflictResolutions((current) => ({ ...current, [key]: choice }));
    },
    [],
  );

  const allConflictsResolved = useMemo(
    () =>
      Boolean(
        migrationPreview &&
        migrationPreview.conflicts.every(
          (conflict) => conflictResolutions[conflict.key],
        ),
      ),
    [conflictResolutions, migrationPreview],
  );

  const changeName = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) =>
      current ? { ...current, name: event.target.value } : current,
    );
    setFormError("");
  }, []);

  const changePassword = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) =>
      current ? { ...current, password: event.target.value } : current,
    );
    setFormError("");
  }, []);

  const changeRole = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const role = event.target.value as Exclude<MemberRole, "owner">;
    setForm((current) =>
      current ? { ...current, role, permissions: defaults(role) } : current,
    );
  }, []);

  const changeActive = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) =>
      current ? { ...current, active: event.target.checked } : current,
    );
  }, []);

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display font-bold text-2xl text-brand-navy">
            Manage Members
          </h1>
          <p className="text-sm font-semibold text-brand-muted">
            Roles supply defaults; permissions can be customized per member.
          </p>
          {!isOnline && (
            <p className="text-brand-red font-bold text-sm">
              Reconnect to manage members.
            </p>
          )}
        </div>
        <button
          disabled={!isOnline}
          onClick={add}
          className="px-4 py-3 rounded-xl bg-brand-red text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40"
        >
          <Plus aria-hidden="true" size={16} /> Add member
        </button>
      </div>
      {pageError && (
        <p className="mb-3 text-brand-red font-bold">{pageError}</p>
      )}
      {notice && (
        <p className="mb-3 rounded-xl bg-green-100 px-4 py-3 text-green-800 font-bold">
          {notice}
        </p>
      )}
      <div className="bg-white rounded-2xl shadow-pos overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-brand-navy text-xs uppercase text-white/80">
              <th className="text-left px-6 py-3">Member</th>
              <th className="text-left px-6 py-3">Employee ID</th>
              <th className="text-left px-6 py-3">Role</th>
              <th className="text-left px-6 py-3">Status</th>
              <th className="px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((member) => (
              <tr key={member.id}>
                <td className="px-6 py-4 font-bold">{member.name}</td>
                <td className="px-6 py-4">{member.employeeId}</td>
                <td className="px-6 py-4 capitalize">{member.role}</td>
                <td className="px-6 py-4">
                  {member.active ? "Active" : "Inactive"}
                </td>
                <td className="px-6 py-4">
                  <div className="flex justify-end gap-2">
                    {member.role !== "owner" && (
                      <>
                        <button
                          onClick={() => edit(member)}
                          aria-label={`Edit ${member.name}`}
                          title={`Edit ${member.name}`}
                          className="p-2 bg-brand-cream rounded-lg"
                        >
                          <Pencil size={15} />
                        </button>
                        {member.active && (
                          <button
                            onClick={() => void deactivate(member)}
                            aria-label={`Deactivate ${member.name}`}
                            title={`Deactivate ${member.name}`}
                            className="p-2 bg-red-50 text-red-700 rounded-lg"
                          >
                            <UserX size={15} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!members.length && isOnline && (
          <p className="py-12 text-center font-semibold text-brand-muted">
            No members were found.
          </p>
        )}
      </div>
      <div className="bg-white rounded-2xl shadow-pos p-5 mt-6">
        <h2 className="font-bold">Legacy CSV migration</h2>
        <p className="text-sm text-brand-muted my-2">
          One-time transactional import. Originals remain untouched and are
          backed up.
        </p>
        <button
          disabled={!isOnline}
          onClick={previewMigration}
          className="px-4 py-2 rounded-xl bg-brand-navy text-white font-bold text-sm disabled:opacity-40"
        >
          {isOnline ? "Preview import" : "Reconnect to preview import"}
        </button>
        {migrationMessage && (
          <p className="mt-3 text-sm font-semibold break-all">
            {migrationMessage}
          </p>
        )}
      </div>

      {form && (
        <div className="fixed inset-0 bg-black/40 z-40 grid place-items-center p-4">
          <div className="bg-white rounded-3xl p-7 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-xl">
                {form.id ? "Edit member" : "Add member"}
              </h2>
              <button
                onClick={closeForm}
                aria-label="Close member form"
                title="Close"
              >
                <X />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="text-xs font-bold uppercase text-brand-muted">
                Name
                <input
                  autoFocus
                  value={form.name}
                  onChange={changeName}
                  className="mt-1 w-full h-12 px-4 rounded-xl bg-brand-cream border normal-case text-brand-ink font-semibold"
                />
              </label>
              <label className="text-xs font-bold uppercase text-brand-muted">
                Role
                <span className="relative block mt-1">
                  <select
                    value={form.role}
                    onChange={changeRole}
                    className="w-full h-12 appearance-none pl-4 pr-10 rounded-xl bg-brand-cream border normal-case text-brand-ink font-semibold"
                  >
                    <option value="manager">Manager</option>
                    <option value="cashier">Cashier</option>
                  </select>
                  <ChevronDown
                    aria-hidden="true"
                    size={16}
                    className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-brand-muted"
                  />
                </span>
              </label>
              <label className="sm:col-span-2 text-xs font-bold uppercase text-brand-muted">
                {form.id ? "New password (optional)" : "Password"}
                <PasswordInput
                  autoComplete="new-password"
                  placeholder={
                    form.id
                      ? "Leave blank to keep the current password"
                      : "At least 10 characters"
                  }
                  value={form.password}
                  onChange={changePassword}
                  className="mt-1 w-full h-12 px-4 rounded-xl bg-brand-cream border normal-case text-brand-ink font-semibold"
                />
              </label>
            </div>
            <p className="mt-3 text-sm font-semibold text-brand-muted">
              {form.id
                ? `Employee ID: ${form.employeeId}`
                : "The employee ID will be generated automatically after saving."}
            </p>
            {form.password && form.password.length < 10 && (
              <p className="mt-2 text-sm font-bold text-brand-red">
                Password must contain at least 10 characters.
              </p>
            )}
            {form.id && (
              <label className="flex items-center gap-2 mt-3 text-sm font-bold">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={changeActive}
                />
                Active account
              </label>
            )}
            <h3 className="font-bold mt-5 mb-2">Permissions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PERMISSIONS.map((permission) => (
                <label
                  key={permission}
                  className="flex gap-2 items-center p-3 rounded-xl bg-brand-cream"
                >
                  <input
                    type="checkbox"
                    checked={form.permissions.includes(permission)}
                    onChange={() => toggle(permission)}
                  />
                  <span className="text-sm font-semibold normal-case">
                    {labels[permission]}
                  </span>
                </label>
              ))}
            </div>
            {!isOnline && (
              <p className="mt-4 text-sm font-bold text-brand-red">
                Reconnect to save this member.
              </p>
            )}
            {formError && (
              <p className="mt-4 text-sm font-bold text-brand-red">
                {formError}
              </p>
            )}
            <button
              disabled={!formIsValid || !isOnline || busy}
              onClick={save}
              className="w-full mt-5 py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-40"
            >
              {busy
                ? "Saving…"
                : !isOnline
                  ? "Reconnect to save"
                  : "Save member"}
            </button>
          </div>
        </div>
      )}

      {migrationPreview && (
        <div className="fixed inset-0 bg-black/40 z-40 grid place-items-center p-4">
          <div className="bg-white rounded-3xl p-7 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display font-bold text-xl">
                {migrationPreview.alreadyImported
                  ? "Resolve legacy import conflicts"
                  : "Legacy import preview"}
              </h2>
              <button
                onClick={closeMigrationPreview}
                aria-label="Close import preview"
                title="Close"
              >
                <X />
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt>Menu rows</dt>
              <dd className="text-right font-bold">
                {migrationPreview.menuRows}
              </dd>
              <dt>Sales rows</dt>
              <dd className="text-right font-bold">
                {migrationPreview.salesRows}
              </dd>
              <dt>Bill rows</dt>
              <dd className="text-right font-bold">
                {migrationPreview.billRows}
              </dd>
              <dt>Cancelled bills</dt>
              <dd className="text-right font-bold">
                {migrationPreview.cancelledBills}
              </dd>
            </dl>
            {migrationPreview.conflicts.length > 0 && (
              <section className="mt-5">
                <h3 className="font-bold text-lg text-brand-navy">
                  Conflicting menu items
                </h3>
                <p className="mt-1 text-sm font-semibold text-brand-muted">
                  Choose what to do for every item before continuing. Historical
                  bills and their captured prices are always preserved.
                </p>
                <div className="mt-4 space-y-4">
                  {migrationPreview.conflicts.map((conflict) => (
                    <div
                      key={conflict.key}
                      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <h4 className="font-display font-bold text-lg text-brand-ink">
                            {conflict.cloudItem.name}
                          </h4>
                          <p className="text-xs font-semibold text-brand-muted">
                            Found in both Cloud and Legacy CSV
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-800">
                          {conflict.legacyOrderLineCount} legacy order line
                          {conflict.legacyOrderLineCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                        <div className="rounded-xl bg-white p-3">
                          <p className="text-xs font-bold uppercase text-brand-muted">
                            Cloud
                          </p>
                          <p className="mt-1 font-bold">
                            Cost Rs. {conflict.cloudItem.costPrice} · Sale Rs.{" "}
                            {conflict.cloudItem.salePrice}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-brand-muted">
                            Updated{" "}
                            {new Date(
                              conflict.cloudItem.updatedAt,
                            ).toLocaleString()}
                          </p>
                        </div>
                        <div className="rounded-xl bg-white p-3">
                          <p className="text-xs font-bold uppercase text-brand-muted">
                            Legacy Imported
                          </p>
                          <p className="mt-1 font-bold">
                            Cost Rs. {conflict.legacyItem.costPrice} · Sale Rs.{" "}
                            {conflict.legacyItem.salePrice}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-brand-muted">
                            Latest activity{" "}
                            {conflict.latestLegacyActivityAt
                              ? new Date(
                                  conflict.latestLegacyActivityAt,
                                ).toLocaleString()
                              : "not available"}
                          </p>
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-semibold text-amber-950">
                        {conflict.recommendationReason}
                      </p>
                      <div className="mt-3 space-y-2">
                        {conflictOptions.map((option) => {
                          const label =
                            option.value === "cloud"
                              ? `Use Cloud “${conflict.cloudItem.name}”`
                              : option.value === "legacy"
                                ? `Use Legacy Imported “${conflict.legacyItem.name}”`
                                : "Combine both records";
                          const recommended =
                            conflict.recommendedChoice === option.value;
                          return (
                            <label
                              key={option.value}
                              className={`block cursor-pointer rounded-xl border p-3 transition-colors ${
                                conflictResolutions[conflict.key] ===
                                option.value
                                  ? "border-brand-navy bg-white"
                                  : "border-transparent bg-white/70"
                              }`}
                            >
                              <span className="flex items-start gap-3">
                                <input
                                  type="radio"
                                  name={`legacy-conflict-${conflict.key}`}
                                  value={option.value}
                                  checked={
                                    conflictResolutions[conflict.key] ===
                                    option.value
                                  }
                                  onChange={() =>
                                    changeConflictResolution(
                                      conflict.key,
                                      option.value,
                                    )
                                  }
                                  className="mt-1"
                                />
                                <span>
                                  <span className="font-bold text-brand-ink">
                                    {label}
                                    {recommended && (
                                      <span className="ml-2 text-xs text-green-700">
                                        (Recommended)
                                      </span>
                                    )}
                                  </span>
                                  <span className="mt-0.5 block text-xs font-semibold text-brand-muted">
                                    {option.description}
                                  </span>
                                </span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
            <h3 className="font-bold mt-5 mb-2">Source files</h3>
            {migrationPreview.sourceFiles.length ? (
              <ul className="list-disc pl-5 text-sm space-y-1 break-all">
                {migrationPreview.sourceFiles.map((file) => (
                  <li key={file}>{file}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-brand-muted">No source files found.</p>
            )}
            {migrationPreview.warnings.length > 0 && (
              <>
                <h3 className="font-bold mt-5 mb-2 text-amber-800">Warnings</h3>
                <ul className="list-disc pl-5 text-sm space-y-1 text-amber-900">
                  {migrationPreview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="mt-5 text-sm font-semibold text-brand-muted">
              Importing creates a timestamped backup first. The original CSV
              files remain untouched.
            </p>
            <div className="flex gap-2 mt-5">
              <button
                onClick={closeMigrationPreview}
                className="flex-1 py-3 rounded-xl bg-gray-100 font-bold"
              >
                Cancel
              </button>
              <button
                disabled={
                  busy ||
                  migrationPreview.sourceFiles.length === 0 ||
                  !allConflictsResolved
                }
                onClick={runMigration}
                className="flex-1 py-3 rounded-xl bg-brand-red text-white font-bold disabled:opacity-40"
              >
                {busy
                  ? migrationPreview.alreadyImported
                    ? "Resolving…"
                    : "Importing…"
                  : migrationPreview.alreadyImported
                    ? "Resolve and continue"
                    : "Import data"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ManageMembers;
