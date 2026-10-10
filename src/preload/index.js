import { contextBridge, ipcRenderer } from 'electron'

// 页面可用的接口：记账的增删改查 + 分类管理 + 数据管理（通过 IPC 安全地调用主进程的数据库）
const api = {
  addRecord: (data) => ipcRenderer.invoke('record:add', data),
  listRecords: (month, type) => ipcRenderer.invoke('record:list', month, type),
  listRecordsRange: (start, end, type) => ipcRenderer.invoke('record:listRange', start, end, type),
  deleteRecord: (id) => ipcRenderer.invoke('record:delete', id),
  updateRecord: (id, data) => ipcRenderer.invoke('record:update', id, data),
  listCategories: () => ipcRenderer.invoke('category:list'),
  renameCategory: (data) => ipcRenderer.invoke('category:rename', data),
  addCategory: (data) => ipcRenderer.invoke('category:add', data),
  setCategoryEnabled: (data) => ipcRenderer.invoke('category:toggle', data),
  exportCsv: () => ipcRenderer.invoke('data:exportCsv'),
  backupDatabase: () => ipcRenderer.invoke('data:backup'),
  restoreDatabase: () => ipcRenderer.invoke('data:restore')
}

// 通过 contextBridge 安全地把接口暴露给页面
if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('api', api)
} else {
  window.api = api
}
