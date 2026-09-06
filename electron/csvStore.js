const fs = require('fs')
const path = require('path')
const Papa = require('papaparse')

const MENU_COLUMNS = ['name', 'costPrice', 'salePrice', 'icon']
const SALES_COLUMNS = ['orderId', 'dateTime', 'itemName', 'quantity', 'costPrice', 'salePrice', 'lineProfit']

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

function appendCsv(filePath, rows, columns) {
  if (!rows.length) return
  const body = serializeRows(rows, columns)
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, columns.join(',') + '\n' + body, 'utf8')
  } else {
    fs.appendFileSync(filePath, body, 'utf8')
  }
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

  getMenu() {
    return readCsv(this.menuPath, MENU_COLUMNS).map((r) => ({
      name: r.name,
      costPrice: Number(r.costPrice),
      salePrice: Number(r.salePrice),
      icon: r.icon || ''
    }))
  }

  saveMenu(items) {
    const rows = items.map((i) => ({
      name: i.name,
      costPrice: i.costPrice,
      salePrice: i.salePrice,
      icon: i.icon || ''
    }))
    writeCsv(this.menuPath, rows, MENU_COLUMNS)
    return this.getMenu()
  }

  appendSale(rows) {
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
      appendCsv(this.salesLogPath(year, month), groupRows, SALES_COLUMNS)
    }
  }

  getSalesForMonth(year, month) {
    return readCsv(this.salesLogPath(year, month), SALES_COLUMNS).map((r) => ({
      orderId: r.orderId,
      dateTime: r.dateTime,
      itemName: r.itemName,
      quantity: Number(r.quantity),
      costPrice: Number(r.costPrice),
      salePrice: Number(r.salePrice),
      lineProfit: Number(r.lineProfit)
    }))
  }
}

module.exports = { CsvStore }
