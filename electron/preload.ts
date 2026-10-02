import { contextBridge, ipcRenderer } from "electron";
import type {
  Bill,
  CartDraft,
  ConnectivityStatus,
  DailyReportResult,
  ExportResult,
  IpcResult,
  LegacyMigrationPreview,
  LegacyMigrationResult,
  MemberSummary,
  MenuItem,
  MonthlyReportResult,
  PosApi,
  RunLegacyMigrationRequest,
  SessionInfo,
} from "../shared/contracts";

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (result.ok) return result.value;
  const error = new Error(result.error.message) as Error & { code: string };
  error.name = result.error.name;
  error.code = result.error.code;
  throw error;
}

function subscribe<T>(
  channel: string,
  listener: (value: T) => void,
): () => void {
  const handler = (_event: Electron.IpcRendererEvent, value: T): void =>
    listener(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const posApi: PosApi = {
  getSession: () => invoke<SessionInfo>("pos:getSession"),
  login: (request) => invoke<SessionInfo>("pos:login", request),
  unlock: (request) => invoke<SessionInfo>("pos:unlock", request),
  logout: () => invoke<SessionInfo>("pos:logout"),
  changePassword: (request) =>
    invoke<SessionInfo>("pos:changePassword", request),
  onSessionChanged: (listener) => subscribe("pos:sessionChanged", listener),
  getConnectivity: () => invoke<ConnectivityStatus>("pos:getConnectivity"),
  syncNow: () => invoke<ConnectivityStatus>("pos:syncNow"),
  onConnectivityChanged: (listener) =>
    subscribe("pos:connectivityChanged", listener),
  getMenu: () => invoke<MenuItem[]>("pos:getMenu"),
  createMenuItem: (request) => invoke<MenuItem>("pos:createMenuItem", request),
  updateMenuItem: (request) => invoke<MenuItem>("pos:updateMenuItem", request),
  archiveMenuItem: (id) => invoke<MenuItem>("pos:archiveMenuItem", id),
  getCartDraft: () => invoke<CartDraft>("pos:getCartDraft"),
  saveCartDraft: (draft) => invoke<void>("pos:saveCartDraft", draft),
  createOrder: (request) => invoke<Bill>("pos:createOrder", request),
  reviseOrder: (request) => invoke<Bill>("pos:reviseOrder", request),
  cancelOrder: (request) => invoke<Bill>("pos:cancelOrder", request),
  getBills: (query) => invoke<Bill[]>("pos:getBills", query),
  getDailyReport: (range) =>
    invoke<DailyReportResult>("pos:getDailyReport", range),
  getMonthlyReport: (range) =>
    invoke<MonthlyReportResult>("pos:getMonthlyReport", range),
  getMembers: () => invoke<MemberSummary[]>("pos:getMembers"),
  saveMember: (request) => invoke<MemberSummary>("pos:saveMember", request),
  deactivateMember: (id) => invoke<void>("pos:deactivateMember", id),
  exportCsv: (request) => invoke<ExportResult>("pos:exportCsv", request),
  previewLegacyMigration: () =>
    invoke<LegacyMigrationPreview>("pos:previewLegacyMigration"),
  runLegacyMigration: (request: RunLegacyMigrationRequest) =>
    invoke<LegacyMigrationResult>("pos:runLegacyMigration", request),
};

contextBridge.exposeInMainWorld("pos", posApi);
