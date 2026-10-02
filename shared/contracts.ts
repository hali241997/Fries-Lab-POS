export const PERMISSIONS = [
  "menu.view",
  "orders.create",
  "orders.edit",
  "orders.cancel",
  "bills.view",
  "menu.manage",
  "reports.daily.view",
  "reports.monthly.view",
] as const;

export type Permission = (typeof PERMISSIONS)[number];
export type MemberRole = "owner" | "manager" | "cashier";

export const ROLE_DEFAULTS: Record<MemberRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS,
  cashier: ["menu.view", "orders.create", "bills.view"],
};

export interface MenuItem {
  id: string;
  name: string;
  costPrice: number;
  salePrice: number;
  active: boolean;
  availableForSale: boolean;
  version: number;
  updatedAt: string;
}

export interface MenuItemInput {
  name: string;
  costPrice: number;
  salePrice: number;
  availableForSale: boolean;
}

export interface CartLine extends MenuItem {
  quantity: number;
}

export interface OrderLineInput {
  menuItemId: string;
  quantity: number;
  capturedName?: string;
  capturedCostPrice?: number;
  capturedSalePrice?: number;
}

export interface BillLine {
  id: string;
  menuItemId: string | null;
  name: string;
  quantity: number;
  salePrice: number;
  costPrice: number;
}

export type BillStatus = "active" | "cancelled";

export interface Bill {
  id: string;
  revisionId: string;
  revisionNumber: number;
  orderNo: string;
  dateTime: string;
  revisedAt: string;
  customerName: string;
  lines: BillLine[];
  total: number;
  status: BillStatus;
  cancellationReason: string | null;
  source: "app" | "legacy";
  employeeName: string | null;
  terminalCode: string | null;
}

export type CompletedOrder = Bill;

export interface CreateOrderRequest {
  customerName: string;
  lines: OrderLineInput[];
}

export interface CartDraft {
  customerName: string;
  lines: Array<{ menuItemId: string; quantity: number }>;
  updatedAt: string;
}

export interface ReviseOrderRequest {
  orderId: string;
  customerName: string;
  lines: OrderLineInput[];
}

export interface CancelOrderRequest {
  orderId: string;
  reason: string;
}

export type ReportRangeKind = "day" | "week" | "month" | "year" | "all";

export interface ReportRange {
  kind: ReportRangeKind;
  anchorDate?: string;
  year?: number;
  month?: number;
}

export interface SalesReportItem {
  itemName: string;
  quantity: number;
  profit: number;
  revenue: number;
  latestSalePrice: number;
  latestCostPrice: number;
  latestDateTime: string;
}

export interface DailyReportResult {
  rangeLabel: string;
  items: SalesReportItem[];
  totalQuantity: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface MonthlyReportItem {
  itemName: string;
  quantity: number;
}

export interface MonthlyReportResult {
  rangeLabel: string;
  items: MonthlyReportItem[];
  totalQuantity: number;
}

export interface BillsQuery {
  range: ReportRange;
  customerSearch?: string;
}

export type ConnectivityState =
  | "online"
  | "syncing"
  | "reconnecting"
  | "offline"
  | "degraded";

export interface ConnectivityStatus {
  state: ConnectivityState;
  lastCheckedAt: string | null;
  lastSyncAt: string | null;
  offlineLeaseExpiresAt: string | null;
  offlineLeaseRemainingMs: number | null;
  pendingOutboxCount: number;
  permanentErrorCount: number;
  conflictCount: number;
  message: string;
}

export interface SessionMember {
  id: string;
  employeeId: string;
  name: string;
  role: MemberRole;
  permissions: Permission[];
  mustChangePassword: boolean;
}

export type SessionState = "signed-out" | "active" | "locked";

export interface SessionInfo {
  state: SessionState;
  member: SessionMember | null;
  lockReason: string | null;
  connectivity: ConnectivityStatus;
}

export interface LoginRequest {
  employeeId: string;
  password: string;
}

export interface UnlockRequest {
  password: string;
}

export interface ChangePasswordRequest {
  newPassword: string;
  confirmPassword: string;
}

export interface MemberSummary extends SessionMember {
  active: boolean;
  createdAt: string;
}

export interface SaveMemberRequest {
  id?: string;
  name: string;
  password?: string;
  role: Exclude<MemberRole, "owner">;
  permissions: Permission[];
  active: boolean;
}

export interface MenuMutationRequest {
  id?: string;
  name: string;
  costPrice: number;
  salePrice: number;
  availableForSale: boolean;
  expectedVersion?: number;
}

export type ExportKind = "menu" | "daily-report" | "monthly-report" | "bills";

export interface ExportRequest {
  kind: ExportKind;
  range?: ReportRange;
  customerSearch?: string;
}

export interface ExportResult {
  cancelled: boolean;
  filePath: string | null;
}

export interface LegacyMigrationPreview {
  alreadyImported: boolean;
  sourceFiles: string[];
  menuRows: number;
  salesRows: number;
  billRows: number;
  cancelledBills: number;
  warnings: string[];
  conflicts: LegacyMenuConflict[];
}

export interface LegacyMigrationResult extends LegacyMigrationPreview {
  importedOrders: number;
  backupPath: string | null;
}

export type LegacyMenuConflictChoice = "cloud" | "legacy" | "combine";

export interface LegacyMenuConflict {
  key: string;
  cloudItem: MenuItem;
  legacyItem: {
    name: string;
    costPrice: number;
    salePrice: number;
  };
  legacyOrderLineCount: number;
  latestLegacyActivityAt: string | null;
  recommendedChoice: LegacyMenuConflictChoice;
  recommendationReason: string;
}

export interface LegacyMenuConflictResolution {
  key: string;
  choice: LegacyMenuConflictChoice;
}

export interface RunLegacyMigrationRequest {
  resolutions: LegacyMenuConflictResolution[];
}

export const POS_ERROR_CODES = [
  "AUTH_REQUIRED",
  "SESSION_LOCKED",
  "OFFLINE_LEASE_EXPIRED",
  "FORBIDDEN",
  "ONLINE_REQUIRED",
  "VALIDATION_ERROR",
  "CONFLICT",
  "SYNC_ERROR",
  "POS_IPC_ERROR",
] as const;

export type PosErrorCode = (typeof POS_ERROR_CODES)[number];

export interface SerializedIpcError {
  name: string;
  message: string;
  code: PosErrorCode;
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SerializedIpcError };

export interface PosApi {
  getSession(): Promise<SessionInfo>;
  login(request: LoginRequest): Promise<SessionInfo>;
  unlock(request: UnlockRequest): Promise<SessionInfo>;
  logout(): Promise<SessionInfo>;
  changePassword(request: ChangePasswordRequest): Promise<SessionInfo>;
  onSessionChanged(listener: (session: SessionInfo) => void): () => void;
  getConnectivity(): Promise<ConnectivityStatus>;
  syncNow(): Promise<ConnectivityStatus>;
  onConnectivityChanged(
    listener: (status: ConnectivityStatus) => void,
  ): () => void;
  getMenu(): Promise<MenuItem[]>;
  createMenuItem(request: MenuMutationRequest): Promise<MenuItem>;
  updateMenuItem(request: MenuMutationRequest): Promise<MenuItem>;
  archiveMenuItem(id: string): Promise<MenuItem>;
  getCartDraft(): Promise<CartDraft>;
  saveCartDraft(draft: CartDraft): Promise<void>;
  createOrder(request: CreateOrderRequest): Promise<CompletedOrder>;
  reviseOrder(request: ReviseOrderRequest): Promise<CompletedOrder>;
  cancelOrder(request: CancelOrderRequest): Promise<CompletedOrder>;
  getBills(query: BillsQuery): Promise<Bill[]>;
  getDailyReport(range: ReportRange): Promise<DailyReportResult>;
  getMonthlyReport(range: ReportRange): Promise<MonthlyReportResult>;
  getMembers(): Promise<MemberSummary[]>;
  saveMember(request: SaveMemberRequest): Promise<MemberSummary>;
  deactivateMember(id: string): Promise<void>;
  exportCsv(request: ExportRequest): Promise<ExportResult>;
  previewLegacyMigration(): Promise<LegacyMigrationPreview>;
  runLegacyMigration(
    request: RunLegacyMigrationRequest,
  ): Promise<LegacyMigrationResult>;
}
