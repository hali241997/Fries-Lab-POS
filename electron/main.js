const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const { CsvStore } = require('./csvStore')

const isDev = process.env.NODE_ENV === 'development'

// Keep the userData folder name identical in dev and in the packaged app
// (electron-builder's productName would otherwise only apply post-packaging).
app.setName('Fries Lab POS')

const iconPath = path.join(__dirname, '..', 'build', 'icon.png')

let store

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
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
  if (process.platform === 'darwin' && app.dock) {
    app.dock.setIcon(iconPath)
  }

  store = new CsvStore(path.join(app.getPath('userData'), 'data'))

  ipcMain.handle('pos:getMenu', () => store.getMenu())
  ipcMain.handle('pos:saveMenu', (_event, items) => store.saveMenu(items))
  ipcMain.handle('pos:appendSale', (_event, rows) => store.appendSale(rows))
  ipcMain.handle('pos:getSalesForMonth', (_event, { year, month }) => store.getSalesForMonth(year, month))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
