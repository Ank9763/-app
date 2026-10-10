import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import icon from '../../resources/icon.png?asset'
import {
  initDatabase,
  addRecord,
  listRecords,
  listRecordsRange,
  deleteRecord,
  updateRecord,
  listCategories,
  renameCategory,
  addCategory,
  setCategoryEnabled,
  exportCsv,
  backupDatabase,
  restoreDatabase
} from './db'

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1024,
    height: 700,
    minWidth: 900,
    minHeight: 620,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#fbf3e4', // 与主题背景一致，避免打开时白屏闪烁
    icon, // 窗口图标（曲奇）
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.mjs'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  app.setAppUserModelId('com.quqi.jizhang')

  // 初始化数据库，并注册页面可调用的记账接口
  const dbPath = initDatabase()
  console.log('数据库文件位置:', dbPath)
  ipcMain.handle('record:add', (_event, data) => addRecord(data))
  ipcMain.handle('record:list', (_event, month, type) => listRecords(month, type))
  ipcMain.handle('record:listRange', (_event, start, end, type) => listRecordsRange(start, end, type))
  ipcMain.handle('record:delete', (_event, id) => deleteRecord(id))
  ipcMain.handle('record:update', (_event, id, data) => updateRecord(id, data))
  // 分类管理与数据管理
  ipcMain.handle('category:list', () => listCategories())
  ipcMain.handle('category:rename', (_event, data) => renameCategory(data))
  ipcMain.handle('category:add', (_event, data) => addCategory(data))
  ipcMain.handle('category:toggle', (_event, data) => setCategoryEnabled(data))
  ipcMain.handle('data:exportCsv', (event) => exportCsv(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('data:backup', (event) => backupDatabase(BrowserWindow.fromWebContents(event.sender)))
  ipcMain.handle('data:restore', (event) => restoreDatabase(BrowserWindow.fromWebContents(event.sender)))

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  // 快捷键：开发模式按 F12 打开调试工具；正式版禁用 Ctrl+R 刷新
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      if (!app.isPackaged && input.key === 'F12') {
        window.webContents.toggleDevTools()
      }
      if (app.isPackaged && input.control && input.key.toLowerCase() === 'r') {
        event.preventDefault()
      }
    })
  })

  createWindow()

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
