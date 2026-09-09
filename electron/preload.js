const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('pos', {
  getMenu: () => ipcRenderer.invoke('pos:getMenu'),
  saveMenu: (items) => ipcRenderer.invoke('pos:saveMenu', items),
  appendSale: (rows) => ipcRenderer.invoke('pos:appendSale', rows),
  getSalesForMonth: (year, month) => ipcRenderer.invoke('pos:getSalesForMonth', { year, month }),
  appendBill: (rows) => ipcRenderer.invoke('pos:appendBill', rows),
  getBillsForMonth: (year, month) => ipcRenderer.invoke('pos:getBillsForMonth', { year, month }),
  voidBill: (billId, reason) => ipcRenderer.invoke('pos:voidBill', { billId, reason }),
  searchBillsByName: (query) => ipcRenderer.invoke('pos:searchBillsByName', query)
})
