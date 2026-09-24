import { contextBridge, ipcRenderer } from "electron";
import type { BillRow, IpcResult, MenuItem, PosApi, SaleRow } from "../shared/contracts";

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>;
  if (result.ok) return result.value;

  const error = new Error(result.error.message);
  error.name = result.error.name;
  throw error;
}

const posApi: PosApi = {
  getMenu: () => invoke<MenuItem[]>("pos:getMenu"),
  saveMenu: (items) => invoke<MenuItem[]>("pos:saveMenu", items),
  appendSale: (rows: SaleRow[]) => invoke<void>("pos:appendSale", rows),
  getSalesForMonth: (year, month) => invoke<SaleRow[]>("pos:getSalesForMonth", { year, month }),
  appendBill: (rows: BillRow[]) => invoke<void>("pos:appendBill", rows),
  getBillsForMonth: (year, month) => invoke<BillRow[]>("pos:getBillsForMonth", { year, month }),
  voidBill: (billId, reason) => invoke<void>("pos:voidBill", { billId, reason }),
  searchBillsByName: (query) => invoke<BillRow[]>("pos:searchBillsByName", query)
};

contextBridge.exposeInMainWorld("pos", posApi);
