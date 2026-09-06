const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pos', {
  getMenu: () => ipcRenderer.invoke('pos:getMenu'),
  saveMenu: (items) => ipcRenderer.invoke('pos:saveMenu', items),
  appendSale: (rows) => ipcRenderer.invoke('pos:appendSale', rows),
  getSalesForMonth: (year, month) => ipcRenderer.invoke('pos:getSalesForMonth', { year, month })
})
