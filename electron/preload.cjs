// Preload 桥接：给前端提供最小 DB API，避免直接暴露 Node 能力。
const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("horaDB", {
  listProjects: () => ipcRenderer.invoke("db:projects:list"),
  createProject: (input) => ipcRenderer.invoke("db:projects:create", input),
  getProject: (projectId) => ipcRenderer.invoke("db:projects:get", projectId),
  updateProject: (input) => ipcRenderer.invoke("db:projects:update", input),
  deleteProject: (projectId) => ipcRenderer.invoke("db:projects:delete", projectId),
  reorderProjects: (input) => ipcRenderer.invoke("db:projects:reorder", input),

  listRequirementsByProject: (projectId) => ipcRenderer.invoke("db:requirements:listByProject", projectId),
  createRequirement: (input) => ipcRenderer.invoke("db:requirements:create", input),
  updateRequirement: (input) => ipcRenderer.invoke("db:requirements:update", input),
  deleteRequirement: (requirementId) => ipcRenderer.invoke("db:requirements:delete", requirementId),
  reorderRequirements: (input) => ipcRenderer.invoke("db:requirements:reorder", input),

  listTasksByProject: (projectId) => ipcRenderer.invoke("db:tasks:listByProject", projectId),
  listAllTasks: (filters) => ipcRenderer.invoke("db:tasks:listAll", filters),
  createTask: (input) => ipcRenderer.invoke("db:tasks:create", input),
  updateTask: (input) => ipcRenderer.invoke("db:tasks:update", input),
  updateTaskStatus: (input) => ipcRenderer.invoke("db:tasks:updateStatus", input),
  deleteTask: (taskId) => ipcRenderer.invoke("db:tasks:delete", taskId),
  reorderTasks: (input) => ipcRenderer.invoke("db:tasks:reorder", input),

  listNotesByProject: (projectId) => ipcRenderer.invoke("db:noteLinks:listByProject", projectId),
  listNotesByRequirement: (requirementId) => ipcRenderer.invoke("db:noteLinks:listByRequirement", requirementId),
  listNotesByTask: (taskId) => ipcRenderer.invoke("db:noteLinks:listByTask", taskId),
  linkNoteToProject: (noteId, projectId) => ipcRenderer.invoke("db:noteLinks:linkProject", noteId, projectId),
  unlinkNoteFromProject: (noteId, projectId) => ipcRenderer.invoke("db:noteLinks:unlinkProject", noteId, projectId),
  linkNoteToRequirement: (noteId, requirementId) => ipcRenderer.invoke("db:noteLinks:linkRequirement", noteId, requirementId),
  unlinkNoteFromRequirement: (noteId, requirementId) => ipcRenderer.invoke("db:noteLinks:unlinkRequirement", noteId, requirementId),
  linkNoteToTask: (noteId, taskId) => ipcRenderer.invoke("db:noteLinks:linkTask", noteId, taskId),
  unlinkNoteFromTask: (noteId, taskId) => ipcRenderer.invoke("db:noteLinks:unlinkTask", noteId, taskId),

  // 插件元数据和设置：通过数据库保存启用状态、排序和配置信息。
  listPlugins: () => ipcRenderer.invoke("db:plugins:list"),
  getPlugin: (pluginKey) => ipcRenderer.invoke("db:plugins:get", pluginKey),
  refreshPlugins: () => ipcRenderer.invoke("db:plugins:refresh"),
  updatePlugin: (input) => ipcRenderer.invoke("db:plugins:update", input),
  setPluginEnabled: (pluginKey, enabled) => ipcRenderer.invoke("db:plugins:setEnabled", pluginKey, enabled),
  reorderPlugins: (input) => ipcRenderer.invoke("db:plugins:reorder", input),
  updatePluginSettings: (input) => ipcRenderer.invoke("db:plugins:updateSettings", input),
  getPluginRootPath: () => ipcRenderer.invoke("db:plugins:getRootPath"),
  importPluginPackage: () => ipcRenderer.invoke("db:plugins:import"),
  restartApp: () => ipcRenderer.invoke("app:restart"),

  // 软件更新：第一版只检查 GitHub Release、提示新版并跳转下载页。
  getUpdateSnapshot: () => ipcRenderer.invoke("updates:getSettings"),
  setUpdateSettings: (input) => ipcRenderer.invoke("updates:setSettings", input),
  checkForUpdates: () => ipcRenderer.invoke("updates:checkNow"),
  openReleasePage: (releaseUrl) => ipcRenderer.invoke("updates:openReleasePage", releaseUrl),
  onUpdateStatusChanged: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on("updates:status-changed", listener)
    return () => {
      ipcRenderer.removeListener("updates:status-changed", listener)
    }
  },

  // 空间管理：首次引导、切换、重命名和路径迁移都走这里。
  getSpaceBootstrapState: () => ipcRenderer.invoke("db:spaces:bootstrapState"),
  listSpaces: () => ipcRenderer.invoke("db:spaces:list"),
  getCurrentSpace: () => ipcRenderer.invoke("db:spaces:getCurrent"),
  pickSpaceDirectory: (input) => ipcRenderer.invoke("db:spaces:pickDirectory", input),
  createSpace: (input) => ipcRenderer.invoke("db:spaces:create", input),
  switchSpace: (spaceId) => ipcRenderer.invoke("db:spaces:switch", spaceId),
  renameSpace: (input) => ipcRenderer.invoke("db:spaces:rename", input),
  deleteSpace: (spaceId) => ipcRenderer.invoke("db:spaces:delete", spaceId),
  migrateCurrentSpace: (input) => ipcRenderer.invoke("db:spaces:migrateCurrent", input),
  reloadSpaceRuntime: () => ipcRenderer.invoke("db:spaces:reload"),

  listNoteNodes: () => ipcRenderer.invoke("db:notes:list"),
  getNote: (noteId) => ipcRenderer.invoke("db:notes:get", noteId),
  readNoteContent: (noteId) => ipcRenderer.invoke("db:notes:read", noteId),
  saveNoteContent: (input) => ipcRenderer.invoke("db:notes:save", input),
  createNoteNode: (input) => ipcRenderer.invoke("db:notes:create", input),
  renameNoteNode: (input) => ipcRenderer.invoke("db:notes:rename", input),
  deleteNoteNode: (input) => ipcRenderer.invoke("db:notes:delete", input),
  moveNoteNode: (input) => ipcRenderer.invoke("db:notes:move", input),
  showNoteInFinder: (noteId) => ipcRenderer.invoke("shell:notes:showInFinder", noteId),
  openNoteWithDefaultApp: (noteId) => ipcRenderer.invoke("shell:notes:openDefault", noteId),

  // 前端订阅笔记目录变化：返回取消订阅函数。
  onNotesChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("notes-changed", listener)
    return () => {
      ipcRenderer.removeListener("notes-changed", listener)
    }
  },
  onSpacesChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on("spaces-changed", listener)
    return () => {
      ipcRenderer.removeListener("spaces-changed", listener)
    }
  },
})
