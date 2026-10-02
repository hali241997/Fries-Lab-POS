import fs from "node:fs";
import path from "node:path";
import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  powerMonitor,
  type IpcMainInvokeEvent,
  type MenuItemConstructorOptions,
} from "electron";
import type {
  BillsQuery,
  CancelOrderRequest,
  CartDraft,
  ChangePasswordRequest,
  CreateOrderRequest,
  ExportRequest,
  IpcResult,
  LoginRequest,
  MenuMutationRequest,
  ReportRange,
  ReviseOrderRequest,
  RunLegacyMigrationRequest,
  SaveMemberRequest,
  UnlockRequest,
} from "../shared/contracts";
import { CloudClient, type CloudConfig } from "./cloud";
import { createLocalDatabase, getLocalDatabasePath } from "./database/client";
import { serializeError, PosError } from "./errors";
import { ExportService } from "./services/exportService";
import { LegacyMigrationService } from "./services/legacyMigrationService";
import { PosService } from "./services/posService";
import { SessionService } from "./services/sessionService";
import { ConnectivityService } from "./services/syncService";

const isDev = !app.isPackaged && process.env.NODE_ENV === "development";
app.setName("Fries Lab POS");
const hasSingleInstanceLock = app.requestSingleInstanceLock();
let mainWindow: BrowserWindow | null = null;
let databaseUsageMarkerPath: string | null = null;

if (!hasSingleInstanceLock) app.quit();

const iconPath = isDev
  ? path.join(app.getAppPath(), "build", "icon.png")
  : undefined;

function loadCloudConfig(): CloudConfig | undefined {
  try {
    const configPath = path.join(app.getAppPath(), "config", "supabase.json");
    const config = JSON.parse(
      fs.readFileSync(configPath, "utf8"),
    ) as Partial<CloudConfig>;
    return config.url && config.publishableKey
      ? { url: config.url, publishableKey: config.publishableKey }
      : undefined;
  } catch {
    return undefined;
  }
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      devTools: isDev,
      nodeIntegration: false,
    },
  });
  if (isDev) {
    void window.loadURL("http://localhost:5173");
    window.webContents.openDevTools();
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
  return window;
}

function configureApplicationMenu(): void {
  const viewSubmenu: MenuItemConstructorOptions[] = [
    ...(isDev
      ? [
          { role: "reload" as const },
          { role: "forceReload" as const },
          { role: "toggleDevTools" as const },
          { type: "separator" as const },
        ]
      : []),
    { role: "resetZoom" },
    { role: "zoomIn" },
    { role: "zoomOut" },
    { type: "separator" },
    { role: "togglefullscreen" },
  ];
  const template: MenuItemConstructorOptions[] = [
    ...(process.platform === "darwin"
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : [{ role: "fileMenu" as const }]),
    { role: "editMenu" },
    { label: "View", submenu: viewSubmenu },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function focusMainWindow(): void {
  const window =
    mainWindow && !mainWindow.isDestroyed()
      ? mainWindow
      : BrowserWindow.getAllWindows()[0];
  if (!window) {
    if (app.isReady()) mainWindow = createWindow();
    return;
  }
  if (window.isMinimized()) window.restore();
  if (!window.isVisible()) window.show();
  window.focus();
}

function broadcast(channel: string, value: unknown): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(channel, value);
}

function markLocalDatabaseInUse(userDataPath: string): void {
  databaseUsageMarkerPath = `${getLocalDatabasePath(userDataPath)}.running`;
  fs.writeFileSync(
    databaseUsageMarkerPath,
    JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    "utf8",
  );
}

function clearLocalDatabaseUsageMarker(): void {
  if (!databaseUsageMarkerPath) return;
  try {
    const marker = JSON.parse(
      fs.readFileSync(databaseUsageMarkerPath, "utf8"),
    ) as { pid?: number };
    if (marker.pid === process.pid) fs.rmSync(databaseUsageMarkerPath);
  } catch (error: unknown) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    )
      console.warn("Could not remove the local database usage marker.", error);
  } finally {
    databaseUsageMarkerPath = null;
  }
}

function handle<Args extends unknown[], Result>(
  channel: string,
  listener: (...args: Args) => Result | Promise<Result>,
): void {
  ipcMain.handle(
    channel,
    async (
      _event: IpcMainInvokeEvent,
      ...args: unknown[]
    ): Promise<IpcResult<Result>> => {
      try {
        return { ok: true, value: await listener(...(args as Args)) };
      } catch (error: unknown) {
        return { ok: false, error: serializeError(error) };
      }
    },
  );
}

if (hasSingleInstanceLock) {
  app.on("second-instance", focusMainWindow);

  void app
    .whenReady()
    .then(async () => {
      configureApplicationMenu();
      if (isDev && process.platform === "darwin" && app.dock && iconPath)
        app.dock.setIcon(iconPath);
      const userDataPath = app.getPath("userData");
      const dataDir = path.join(userDataPath, "data");
      fs.mkdirSync(dataDir, { recursive: true });
      markLocalDatabaseInUse(userDataPath);
      const database = await createLocalDatabase(
        userDataPath,
        app.getAppPath(),
      );

      const cloud = new CloudClient(loadCloudConfig());
      const session = new SessionService(database, cloud);
      await session.initializeDevice();
      const connectivity = new ConnectivityService(database, cloud, session);
      session.attachConnectivity(connectivity);
      const pos = new PosService(database, cloud, session, connectivity);
      const exports = new ExportService(pos);
      const migration = new LegacyMigrationService(database, dataDir, session);

      session.onChange((value) => broadcast("pos:sessionChanged", value));
      connectivity.onChange((value) =>
        broadcast("pos:connectivityChanged", value),
      );

      handle("pos:getSession", () => session.getInfo());
      handle<[LoginRequest], ReturnType<SessionService["getInfo"]>>(
        "pos:login",
        async (request) => {
          const info = await session.login(request);
          void connectivity.syncNow();
          return info;
        },
      );
      handle<[UnlockRequest], ReturnType<SessionService["getInfo"]>>(
        "pos:unlock",
        async (request) => {
          const info = await session.unlock(request);
          void connectivity.syncNow();
          return info;
        },
      );
      handle("pos:logout", () => session.logout());
      handle<[ChangePasswordRequest], ReturnType<SessionService["getInfo"]>>(
        "pos:changePassword",
        (request) => session.changePassword(request),
      );
      handle("pos:getConnectivity", () => connectivity.getStatus());
      handle("pos:syncNow", () => connectivity.syncNow());
      handle("pos:getMenu", () => pos.getMenu());
      handle<
        [MenuMutationRequest],
        Awaited<ReturnType<PosService["createMenuItem"]>>
      >("pos:createMenuItem", (request) => pos.createMenuItem(request));
      handle<
        [MenuMutationRequest],
        Awaited<ReturnType<PosService["updateMenuItem"]>>
      >("pos:updateMenuItem", (request) => pos.updateMenuItem(request));
      handle<[string], Awaited<ReturnType<PosService["archiveMenuItem"]>>>(
        "pos:archiveMenuItem",
        (id) => pos.archiveMenuItem(id),
      );
      handle("pos:getCartDraft", () => pos.getCartDraft());
      handle<[CartDraft], void>("pos:saveCartDraft", (draft) =>
        pos.saveCartDraft(draft),
      );
      handle<
        [CreateOrderRequest],
        Awaited<ReturnType<PosService["createOrder"]>>
      >("pos:createOrder", (request) => pos.createOrder(request));
      handle<
        [ReviseOrderRequest],
        Awaited<ReturnType<PosService["reviseOrder"]>>
      >("pos:reviseOrder", (request) => pos.reviseOrder(request));
      handle<
        [CancelOrderRequest],
        Awaited<ReturnType<PosService["cancelOrder"]>>
      >("pos:cancelOrder", (request) => pos.cancelOrder(request));
      handle<[BillsQuery], Awaited<ReturnType<PosService["getBills"]>>>(
        "pos:getBills",
        (query) => pos.getBills(query),
      );
      handle<[ReportRange], Awaited<ReturnType<PosService["getDailyReport"]>>>(
        "pos:getDailyReport",
        (range) => pos.getDailyReport(range),
      );
      handle<
        [ReportRange],
        Awaited<ReturnType<PosService["getMonthlyReport"]>>
      >("pos:getMonthlyReport", (range) => pos.getMonthlyReport(range));
      handle("pos:getMembers", async () => {
        session.assertUsable();
        if (session.getMember().role !== "owner")
          throw new PosError("FORBIDDEN", "Only the owner can manage members.");
        connectivity.requireOnline();
        return cloud.getMembers();
      });
      handle<
        [SaveMemberRequest],
        Awaited<ReturnType<CloudClient["saveMember"]>>
      >("pos:saveMember", async (request) => {
        session.assertUsable();
        if (session.getMember().role !== "owner")
          throw new PosError("FORBIDDEN", "Only the owner can manage members.");
        connectivity.requireOnline();
        const member = await cloud.saveMember(request);
        void connectivity.syncNow();
        return member;
      });
      handle<[string], void>("pos:deactivateMember", async (id) => {
        session.assertUsable();
        if (session.getMember().role !== "owner")
          throw new PosError("FORBIDDEN", "Only the owner can manage members.");
        connectivity.requireOnline();
        await cloud.deactivateMember(id);
        void connectivity.syncNow();
      });
      handle<[ExportRequest], Awaited<ReturnType<ExportService["exportCsv"]>>>(
        "pos:exportCsv",
        (request) => exports.exportCsv(request),
      );
      handle("pos:previewLegacyMigration", () => {
        connectivity.requireOnline();
        return migration.preview();
      });
      handle<
        [RunLegacyMigrationRequest],
        Awaited<ReturnType<LegacyMigrationService["run"]>>
      >("pos:runLegacyMigration", async (request) => {
        connectivity.requireOnline();
        const result = await migration.run(request);
        void connectivity.syncNow();
        return result;
      });

      powerMonitor.on("resume", () => {
        session.checkLease();
        void connectivity.syncNow();
      });

      mainWindow = createWindow();
      void connectivity.start();
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0)
          mainWindow = createWindow();
      });

      app.on("before-quit", () => {
        connectivity.stop();
        void database.$disconnect();
      });
      app.on("will-quit", clearLocalDatabaseUsageMarker);
    })
    .catch((error: unknown) => {
      console.error("Failed to start Fries Lab POS", error);
      clearLocalDatabaseUsageMarker();
      app.quit();
    });

  app.on("window-all-closed", () => {
    app.quit();
  });
}
