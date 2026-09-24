export interface MenuItem {
  name: string
  costPrice: number
  salePrice: number
}

export interface CartLine extends MenuItem {
  quantity: number
}

export interface SaleRow {
  orderId: string
  dateTime: string
  itemName: string
  quantity: number
  costPrice: number
  salePrice: number
  lineProfit: number
  voided?: boolean
  voidReason?: string | null
}

export interface BillRow {
  billId: string
  orderNo: string
  dateTime: string
  customerName: string
  itemName: string
  quantity: number
  salePrice: number
  lineTotal: number
  voided?: boolean
  voidReason?: string | null
}

export interface BillLine {
  name: string
  quantity: number
  salePrice: number
  costPrice?: number
}

export interface Bill {
  billId: string
  orderNo: string
  dateTime: string
  customerName: string
  lines: BillLine[]
  total: number
  voided?: boolean
  voidReason?: string | null
}

export interface CompletedOrder extends Omit<Bill, "lines"> {
  lines: CartLine[]
}

export interface SalesReportItem {
  itemName: string
  quantity: number
  profit: number
  revenue: number
  latestSalePrice: number
  latestCostPrice: number
  latestDateTime: string
}

export interface MonthlyReportItem {
  itemName: string
  quantity: number
}

export interface MonthRequest {
  year: number
  month: number
}

export interface VoidBillRequest {
  billId: string
  reason: string
}

export interface SerializedIpcError {
  name: string
  message: string
  code: "POS_IPC_ERROR"
}

export type IpcResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SerializedIpcError }

export interface PosApi {
  getMenu(): Promise<MenuItem[]>
  saveMenu(items: MenuItem[]): Promise<MenuItem[]>
  appendSale(rows: SaleRow[]): Promise<void>
  getSalesForMonth(year: number, month: number): Promise<SaleRow[]>
  appendBill(rows: BillRow[]): Promise<void>
  getBillsForMonth(year: number, month: number): Promise<BillRow[]>
  voidBill(billId: string, reason: string): Promise<void>
  searchBillsByName(query: string): Promise<BillRow[]>
}
