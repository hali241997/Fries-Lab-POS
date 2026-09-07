const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { CsvStore } = require('./csvStore')

const isDev = process.env.NODE_ENV === 'development'

// Keep the userData folder name identical in dev and in the packaged app
// (electron-builder's productName would otherwise only apply post-packaging).
app.setName('Fries Lab POS')

// Only meaningful in dev: a packaged build isn't shipped with build/icon.png
// (electron-builder embeds build/icon.icns / icon.ico into the app itself,
// so the OS picks up the icon automatically without any code needing this path).
const iconPath = isDev ? path.join(__dirname, '..', 'build', 'icon.png') : undefined

let store

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }
}

app.whenReady().then(() => {
  // In dev (unpackaged), macOS shows Electron's default Dock icon unless set explicitly.
  // A packaged build picks up build/icon.icns automatically, so this only matters for `npm run electron:dev`.
  if (isDev && process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  store = new CsvStore(path.join(app.getPath('userData'), 'data'))

  ipcMain.handle('pos:getMenu', () => store.getMenu())
  ipcMain.handle('pos:saveMenu', (_event, items) => store.saveMenu(items))
  ipcMain.handle('pos:appendSale', (_event, rows) => store.appendSale(rows))
  ipcMain.handle('pos:getSalesForMonth', (_event, { year, month }) => store.getSalesForMonth(year, month))
  ipcMain.handle('pos:appendBill', (_event, rows) => store.appendBill(rows))
  ipcMain.handle('pos:getBillsForMonth', (_event, { year, month }) => store.getBillsForMonth(year, month))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
