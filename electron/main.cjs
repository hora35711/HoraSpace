// Electron 主进程：启动窗口、注册 IPC，并桥接笔记变更事件。
const path = require("node:path")
const fs = require("node:fs")
const http = require("node:http")
const { pathToFileURL } = require("node:url")
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron")
const db = require("./db.cjs")
const space = require("./space.cjs")

let mainWindow = null
const RENDERER_PORT = Number(process.env.HORA_RENDERER_PORT || 3000)

// 根据运行环境选择真实文件路径，避免把图标路径指向 asar 内部。
function getAppIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "icon", "hora_space_icon.png")
  }

  return path.join(app.getAppPath(), "icon", "hora_space_icon.png")
}

// 广播笔记变更：通知所有渲染进程刷新侧边栏目录。
function notifyNotesChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("notes-changed")
  }
}

// 广播空间变化：左上角切换器、设置页和首次引导会一起刷新。
function notifySpacesChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("spaces-changed")
  }
}

// 切换空间后重建 DB 和监听器，避免旧路径继续占用。
function reloadCurrentSpaceRuntime() {
  db.resetRuntime()
  db.syncVaultToDatabase()
  db.startNotesWatcher(() => {
    notifyNotesChanged()
  })
  notifySpacesChanged()
  notifyNotesChanged()
}

// 注册 IPC：渲染层通过 preload 调用本地数据库方法。
function registerDbIpc() {
  ipcMain.handle("shell:notes:showInFinder", (_event, noteId) => {
    const note = db.getNoteById(noteId)
    if (!note || !note.filePath) {
      throw new Error("目标节点不存在")
    }

    const targetPath = path.join(db.getVaultPath(), note.filePath)
    if (!fs.existsSync(targetPath)) {
      throw new Error("目标路径不存在")
    }

    // 只让系统 Finder 定位当前文件或文件夹，不触发目录刷新或路由变化。
    shell.showItemInFolder(targetPath)
    return true
  })

  ipcMain.handle("shell:notes:openDefault", async (_event, noteId) => {
    const note = db.getNoteById(noteId)
    if (!note || !note.filePath) {
      throw new Error("目标节点不存在")
    }

    const targetPath = path.join(db.getVaultPath(), note.filePath)
    if (!fs.existsSync(targetPath)) {
      throw new Error("目标路径不存在")
    }

    // 使用系统默认应用打开 PDF/Word/Excel 等不适合直接进入编辑器的文件。
    const errorMessage = await shell.openPath(targetPath)
    if (errorMessage) {
      throw new Error(errorMessage)
    }
    return true
  })

  ipcMain.handle("db:projects:list", () => db.listProjects())
  ipcMain.handle("db:projects:create", (_event, input) => db.createProject(input))
  ipcMain.handle("db:projects:get", (_event, projectId) => db.getProjectById(projectId))
  ipcMain.handle("db:projects:update", (_event, input) => db.updateProject(input))
  ipcMain.handle("db:projects:delete", (_event, projectId) => db.deleteProject(projectId))
  ipcMain.handle("db:projects:reorder", (_event, input) => db.reorderProjects(input))

  ipcMain.handle("db:requirements:listByProject", (_event, projectId) =>
    db.listRequirementsByProject(projectId),
  )
  ipcMain.handle("db:requirements:create", (_event, input) =>
    db.createRequirement(input),
  )
  ipcMain.handle("db:requirements:update", (_event, input) =>
    db.updateRequirement(input),
  )
  ipcMain.handle("db:requirements:delete", (_event, requirementId) => db.deleteRequirement(requirementId))
  ipcMain.handle("db:requirements:reorder", (_event, input) => db.reorderRequirements(input))

  ipcMain.handle("db:tasks:listByProject", (_event, projectId) => db.listTasksByProject(projectId))
  ipcMain.handle("db:tasks:listAll", (_event, filters) => db.listAllTasks(filters))
  ipcMain.handle("db:tasks:create", (_event, input) => db.createTask(input))
  ipcMain.handle("db:tasks:update", (_event, input) => db.updateTask(input))
  ipcMain.handle("db:tasks:updateStatus", (_event, input) => db.updateTaskStatus(input))
  ipcMain.handle("db:tasks:delete", (_event, taskId) => db.deleteTask(taskId))
  ipcMain.handle("db:tasks:reorder", (_event, input) => db.reorderTasks(input))

  // 插件管理：设置页通过这些接口同步插件目录与配置。
  ipcMain.handle("db:plugins:list", () => db.listPlugins())
  ipcMain.handle("db:plugins:get", (_event, pluginKey) => db.getPluginByKey(pluginKey))
  ipcMain.handle("db:plugins:refresh", () => db.refreshPlugins())
  ipcMain.handle("db:plugins:update", (_event, input) => db.updatePlugin(input))
  ipcMain.handle("db:plugins:setEnabled", (_event, pluginKey, enabled) => db.setPluginEnabled(pluginKey, enabled))
  ipcMain.handle("db:plugins:reorder", (_event, input) => db.reorderPlugins(input))
  ipcMain.handle("db:plugins:updateSettings", (_event, input) => db.updatePluginSettings(input))
  ipcMain.handle("db:plugins:getRootPath", () => db.getPluginsRootPath())
  ipcMain.handle("db:plugins:import", async () => {
    // 让用户选择一个插件文件夹，导入后提示重启以便完成菜单注册。
    const result = await dialog.showOpenDialog({
      title: "导入插件包",
      properties: ["openDirectory", "createDirectory"],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { imported: false, reason: "canceled" }
    }

    const sourceDir = result.filePaths[0]
    const targetDir = db.importPluginPackage(sourceDir)
    const plugins = db.refreshPlugins()
    return {
      imported: true,
      targetDir,
      plugins,
      restartRecommended: true,
    }
  })
  ipcMain.handle("app:restart", () => {
    // 重启应用：插件导入后如果需要重新挂载侧边栏入口，可以直接走这一条。
    app.relaunch()
    app.exit(0)
    return true
  })

  // 空间管理：账号级注册表，和空间数据路径分开存放。
  ipcMain.handle("db:spaces:bootstrapState", () => space.getSpaceBootstrapState())
  ipcMain.handle("db:spaces:list", () => space.listSpaces())
  ipcMain.handle("db:spaces:getCurrent", () => space.getCurrentSpace())
  ipcMain.handle("db:spaces:pickDirectory", async (_event, input) => {
    const result = await dialog.showOpenDialog({
      title: "选择空间目录",
      defaultPath: input?.defaultPath || app.getPath("documents"),
      properties: ["openDirectory", "createDirectory"],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { canceled: true, filePath: "" }
    }

    return { canceled: false, filePath: result.filePaths[0] }
  })
  ipcMain.handle("db:spaces:create", (_event, input) => {
    const result = space.createSpace(input)
    reloadCurrentSpaceRuntime()
    return result
  })
  ipcMain.handle("db:spaces:switch", (_event, spaceId) => {
    const result = space.switchSpace(spaceId)
    reloadCurrentSpaceRuntime()
    return result
  })
  ipcMain.handle("db:spaces:rename", (_event, input) => {
    const result = space.renameSpace(input.spaceId, input.name)
    notifySpacesChanged()
    return result
  })
  ipcMain.handle("db:spaces:delete", (_event, spaceId) => {
    const result = space.deleteSpace(spaceId)
    reloadCurrentSpaceRuntime()
    return result
  })
  ipcMain.handle("db:spaces:migrateCurrent", (_event, input) => {
    const result = space.moveCurrentSpaceRootPath(input.rootPath)
    reloadCurrentSpaceRuntime()
    return result
  })
  ipcMain.handle("db:spaces:reload", () => {
    reloadCurrentSpaceRuntime()
    return space.getSpaceBootstrapState()
  })

  ipcMain.handle("db:noteLinks:listByProject", (_event, projectId) => db.listNotesByProject(projectId))
  ipcMain.handle("db:noteLinks:listByRequirement", (_event, requirementId) => db.listNotesByRequirement(requirementId))
  ipcMain.handle("db:noteLinks:listByTask", (_event, taskId) => db.listNotesByTask(taskId))
  ipcMain.handle("db:noteLinks:linkProject", (_event, noteId, projectId) => db.linkNoteToProject(noteId, projectId))
  ipcMain.handle("db:noteLinks:unlinkProject", (_event, noteId, projectId) => db.unlinkNoteFromProject(noteId, projectId))
  ipcMain.handle("db:noteLinks:linkRequirement", (_event, noteId, requirementId) => db.linkNoteToRequirement(noteId, requirementId))
  ipcMain.handle("db:noteLinks:unlinkRequirement", (_event, noteId, requirementId) => db.unlinkNoteFromRequirement(noteId, requirementId))
  ipcMain.handle("db:noteLinks:linkTask", (_event, noteId, taskId) => db.linkNoteToTask(noteId, taskId))
  ipcMain.handle("db:noteLinks:unlinkTask", (_event, noteId, taskId) => db.unlinkNoteFromTask(noteId, taskId))

  ipcMain.handle("db:notes:list", () => db.listNoteNodes())
  ipcMain.handle("db:notes:get", (_event, noteId) => db.getNoteById(noteId))
  ipcMain.handle("db:notes:read", (_event, noteId) => db.readNoteContent(noteId))
  ipcMain.handle("db:notes:save", (_event, input) => db.saveNoteContent(input))
  ipcMain.handle("db:notes:create", (_event, input) => {
    const result = db.createNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:rename", (_event, input) => {
    const result = db.renameNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:delete", (_event, input) => {
    const result = db.deleteNoteNode(input)
    notifyNotesChanged()
    return result
  })
  ipcMain.handle("db:notes:move", (_event, input) => {
    const result = db.moveNoteNode(input)
    notifyNotesChanged()
    return result
  })
}

// 创建窗口：开发态加载 Next dev server，打包态加载本地占位页面。
function createMainWindow(rendererUrl) {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1080,
    minHeight: 720,
    // 先隐藏，等首帧渲染完成再显示，避免 mac 上出现“只有菜单栏、窗口没露出来”的错觉。
    show: false,
    // 统一使用 Hora Space 品牌图标，确保窗口标题栏、任务栏和快捷方式视觉一致。
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow = win

  const devUrl = process.env.ELECTRON_RENDERER_URL

  if (devUrl) {
    // 开发模式
    win.loadURL(devUrl)
  } else {
    // 生产模式：优先加载由打包产物启动的本地 Next 服务。
    win.loadURL(rendererUrl)
  }

  // 页面准备完成后再展示，减少白屏和后台窗口不显形的问题。
  win.once("ready-to-show", () => {
    if (!win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })

  // 记录渲染层加载情况，便于区分“窗口没出来”和“页面加载失败”。
  win.webContents.on("did-finish-load", () => {
    console.log("[hora] renderer loaded:", win.webContents.getURL())
  })
  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[hora] renderer failed to load:", {
      errorCode,
      errorDescription,
      validatedURL,
    })
  })
  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("[hora] renderer process gone:", details)
  })
  win.on("unresponsive", () => {
    console.error("[hora] main window became unresponsive")
  })
}

// 生产态启动 Next standalone 服务，并等待端口可用。
async function startPackagedRendererServer() {
  // standalone 需要作为真实目录存在，不能被塞进 asar。
  const serverPath = path.join(process.resourcesPath, "standalone", "server.js")
  if (!fs.existsSync(serverPath)) {
    throw new Error(`未找到生产渲染器入口：${serverPath}`)
  }

  // 直接在 Electron 主进程内加载 standalone 服务，避免额外 Node 图标和第二个进程。
  process.env.NODE_ENV = "production"
  process.env.HOSTNAME = "127.0.0.1"
  process.env.PORT = String(RENDERER_PORT)

  await import(pathToFileURL(serverPath).href)

  return `http://127.0.0.1:${RENDERER_PORT}`
}

// 等待本地服务可用：避免窗口过早打开导致空白页。
function waitForServer(url, timeoutMs = 30000) {
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume()
        resolve(true)
      })

      request.on("error", (error) => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(error)
          return
        }
        setTimeout(probe, 300)
      })
    }

    probe()
  })
}

app.whenReady().then(async () => {
  // 启动后先做一次同步，保证 UI 初次读取就是最新目录。
  db.syncVaultToDatabase()

  // 启动文件监听：任何 notes 目录变化都推送前端刷新。
  db.startNotesWatcher(() => {
    notifyNotesChanged()
  })

  registerDbIpc()

  let rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://localhost:3000"
  if (app.isPackaged) {
    try {
      rendererUrl = await startPackagedRendererServer()
    } catch (error) {
      console.error("启动生产渲染服务失败:", error)
      app.quit()
      return
    }
  }

  if (app.isPackaged) {
    waitForServer(rendererUrl)
      .then(() => {
        createMainWindow(rendererUrl)
      })
      .catch((error) => {
        console.error("启动生产渲染服务失败:", error)
        app.quit()
      })
  } else {
    createMainWindow(rendererUrl)
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(rendererUrl)
    }
  })
})

process.on("uncaughtException", (error) => {
  console.error("[hora] uncaughtException:", error)
})

process.on("unhandledRejection", (reason) => {
  console.error("[hora] unhandledRejection:", reason)
})

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit()
  }
})
