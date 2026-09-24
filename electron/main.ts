import path from "node:path";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import type {
  BillRow,
  IpcResult,
  MenuItem,
  MonthRequest,
  SaleRow,
  SerializedIpcError,
  VoidBillRequest
} from "../shared/contracts";
import { CsvStore } from "./csvStore";

const isDev = process.env.NODE_ENV === "development";

app.setName("Fries Lab POS");

const iconPath = isDev ? path.join(app.getAppPath(), "build", "icon.png") : undefined;

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (isDev) {
    void window.loadURL("http://localhost:5173");
    window.webContents.openDevTools();
  } else {
    void window.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

function serializeError(error: unknown): SerializedIpcError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, code: "POS_IPC_ERROR" };
  }
  return { name: "Error", message: "An unexpected local operation error occurred.", code: "POS_IPC_ERROR" };
}

function handle<Args extends unknown[], Result>(
  channel: string,
  listener: (...args: Args) => Result | Promise<Result>
): void {
  ipcMain.handle(channel, async (_event: IpcMainInvokeEvent, ...args: unknown[]): Promise<IpcResult<Result>> => {
    try {
      return { ok: true, value: await listener(...(args as Args)) };
    } catch (error: unknown) {
      return { ok: false, error: serializeError(error) };
    }
  });
}

function registerIpcHandlers(store: CsvStore): void {
  handle("pos:getMenu", () => store.getMenu());
  handle<[MenuItem[]], MenuItem[]>("pos:saveMenu", (items) => store.saveMenu(items));
  handle<[SaleRow[]], void>("pos:appendSale", (rows) => store.appendSale(rows));
  handle<[MonthRequest], SaleRow[]>("pos:getSalesForMonth", (request) =>
    store.getSalesForMonth(request.year, request.month)
  );
  handle<[BillRow[]], void>("pos:appendBill", (rows) => store.appendBill(rows));
  handle<[MonthRequest], BillRow[]>("pos:getBillsForMonth", (request) =>
    store.getBillsForMonth(request.year, request.month)
  );
  handle<[VoidBillRequest], void>("pos:voidBill", (request) => store.voidBill(request.billId, request.reason));
  handle<[string], BillRow[]>("pos:searchBillsByName", (query) => store.searchBillsByName(query));
}

void app.whenReady().then(() => {
  if (isDev && process.platform === "darwin" && app.dock && iconPath) app.dock.setIcon(iconPath);

  const store = new CsvStore(path.join(app.getPath("userData"), "data"));
  registerIpcHandlers(store);
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
