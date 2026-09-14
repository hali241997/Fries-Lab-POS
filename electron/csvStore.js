const fs = require('fs')
const path = require('path')
const Papa = require('papaparse')

const MENU_COLUMNS = ['name', 'costPrice', 'salePrice']
const SALES_COLUMNS = ['orderId', 'dateTime', 'itemName', 'quantity', 'costPrice', 'salePrice', 'lineProfit']
const BILLS_COLUMNS = ['billId', 'orderNo', 'dateTime', 'customerName', 'itemName', 'quantity', 'salePrice', 'lineTotal']
const VOIDS_COLUMNS = ['billId', 'voidedAt', 'reason']
const BILLS_FILE_PATTERN = /^bills_(\d+)_(\d+)\.csv$/

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function readCsv(filePath, columns) {
  if (!fs.existsSync(filePath)) {
    return []
  }
  const raw = fs.readFileSync(filePath, 'utf8')
  if (!raw.trim()) {
    return []
  }
  const parsed = Papa.parse(raw, { header: true, skipEmptyLines: true })
  return parsed.data.map((row) => {
    const clean = {}
    for (const col of columns) {
      clean[col] = row[col]
    }
    return clean
  })
}

function serializeRows(rows, columns) {
  if (!rows.length) return ''
  return Papa.unparse(rows.map((r) => columns.map((c) => r[c])), { newline: '\n' }) + '\n'
}

function writeCsv(filePath, rows, columns) {
  const csv = columns.join(',') + '\n' + serializeRows(rows, columns)
  fs.writeFileSync(filePath, csv, 'utf8')
}

// If a schema (columns list) changes after a file was already created, its on-disk
// header stays frozen at whatever it was when first written. Blindly appending
// new-schema rows onto that stale header silently misaligns every field (Papa.parse
// maps by position against the *old* header), corrupting data with no error - e.g.
// a `quantity` column that actually holds an item name, reading back as NaN. This
// makes sure the file's header always matches the current schema before any append,
// migrating existing rows onto the new column set (missing fields default to '').
function migrateHeaderIfNeeded(filePath, columns) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, 'utf8')
  const firstLine = raw.split('\n')[0] || ''
  const existingCols = firstLine.split(',').map((s) => s.trim())
  const upToDate = existingCols.length === columns.length && existingCols.every((c, i) => c === columns[i])
  if (upToDate) return

  const existingRows = readCsv(filePath, columns)
  const migrated = existingRows.map((r) => {
    const clean = {}
    for (const c of columns) clean[c] = r[c] === undefined ? '' : r[c]
    return clean
  })
  writeCsv(filePath, migrated, columns)
}

function appendCsv(filePath, rows, columns) {
  if (!rows.length) return
  migrateHeaderIfNeeded(filePath, columns)
  const body = serializeRows(rows, columns)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, columns.join(',') + '\n' + body, 'utf8')
  } else {
    fs.appendFileSync(filePath, body, 'utf8')
  }
}

// Splits rows across per-month files based on each row's own dateTime, then
// appends each group to its month's file. Shared by appendSale/appendBill.
function appendGroupedByMonth(rows, pathForMonth, columns) {
  if (!rows.length) return
  const grouped = new Map()
  for (const row of rows) {
    const d = new Date(row.dateTime)
    const key = `${d.getFullYear()}_${d.getMonth() + 1}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(row)
  }
  for (const [key, groupRows] of grouped) {
    const [year, month] = key.split('_').map(Number)
    appendCsv(pathForMonth(year, month), groupRows, columns)
  }
}

// Local (not UTC) timestamp string, consistent with how the renderer stamps dateTime.
function localNow() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function attachVoidInfo(rows, idField, voidedMap) {
  return rows.map((r) => {
    const voidInfo = voidedMap.get(r[idField])
    return { ...r, voided: !!voidInfo, voidReason: voidInfo || null }
  })
}

class CsvStore {
  constructor(dataDir) {
    this.dataDir = dataDir
    ensureDir(this.dataDir)
    this.menuPath = path.join(this.dataDir, 'menu.csv')
  }

  salesLogPath(year, month) {
    const mm = String(month).padStart(2, '0')
    return path.join(this.dataDir, `sales_log_${year}_${mm}.csv`)
  }

  billsLogPath(year, month) {
    const mm = String(month).padStart(2, '0')
    return path.join(this.dataDir, `bills_${year}_${mm}.csv`)
  }

  voidsPath() {
    return path.join(this.dataDir, 'voids.csv')
  }

  // Not exposed via IPC - internal lookup used by getSalesForMonth/getBillsForMonth/searchBillsByName.
  getVoidedMap() {
    const map = new Map()
    for (const r of readCsv(this.voidsPath(), VOIDS_COLUMNS)) {
      map.set(r.billId, r.reason)
    }
    return map
  }

  voidBill(billId, reason) {
    appendCsv(this.voidsPath(), [{ billId, voidedAt: localNow(), reason }], VOIDS_COLUMNS)
  }

  getMenu() {
    return readCsv(this.menuPath, MENU_COLUMNS).map((r) => ({
      name: r.name,
      costPrice: Number(r.costPrice),
      salePrice: Number(r.salePrice)
    }))
  }

  saveMenu(items) {
    const rows = items.map((i) => ({
      name: i.name,
      costPrice: i.costPrice,
      salePrice: i.salePrice
    }))
    writeCsv(this.menuPath, rows, MENU_COLUMNS)
    return this.getMenu()
  }

  appendSale(rows) {
    appendGroupedByMonth(rows, (year, month) => this.salesLogPath(year, month), SALES_COLUMNS)
  }

  getSalesForMonth(year, month) {
    const rows = readCsv(this.salesLogPath(year, month), SALES_COLUMNS).map((r) => ({
      orderId: r.orderId,
      dateTime: r.dateTime,
      itemName: r.itemName,
      quantity: Number(r.quantity),
      costPrice: Number(r.costPrice),
      salePrice: Number(r.salePrice),
      lineProfit: Number(r.lineProfit)
    }))
    return attachVoidInfo(rows, 'orderId', this.getVoidedMap())
  }

  appendBill(rows) {
    appendGroupedByMonth(rows, (year, month) => this.billsLogPath(year, month), BILLS_COLUMNS)
  }

  getBillsForMonth(year, month) {
    const rows = this.readBillsFile(this.billsLogPath(year, month))
    return attachVoidInfo(rows, 'billId', this.getVoidedMap())
  }

  // Shared row-shape mapper for a single bills_YYYY_MM.csv file, used by
  // getBillsForMonth and searchBillsByName.
  readBillsFile(filePath) {
    return readCsv(filePath, BILLS_COLUMNS).map((r) => ({
      billId: r.billId,
      orderNo: r.orderNo,
      dateTime: r.dateTime,
      customerName: r.customerName || '',
      itemName: r.itemName,
      quantity: Number(r.quantity),
      salePrice: Number(r.salePrice),
      lineTotal: Number(r.lineTotal)
    }))
  }

  searchBillsByName(query) {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const files = fs.readdirSync(this.dataDir).filter((f) => BILLS_FILE_PATTERN.test(f))
    const voidedMap = this.getVoidedMap()
    const matches = []
    for (const file of files) {
      const rows = this.readBillsFile(path.join(this.dataDir, file))
      for (const r of rows) {
        if (r.customerName.toLowerCase().includes(q)) matches.push(r)
      }
    }
    return attachVoidInfo(matches, 'billId', voidedMap)
  }
}

module.exports = { CsvStore }
