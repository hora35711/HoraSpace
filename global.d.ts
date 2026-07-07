// Electron 注入类型声明：为 window.horaDB 提供 TS 类型提示。

type ProjectRecord = {
  id: string
  title: string
  description: string | null
  status: "active" | "paused" | "done" | "archived"
  priority: "low" | "normal" | "high" | "urgent"
  color: string | null
  sortOrder: number
  startedAt: string | null
  dueAt: string | null
  completedAt: string | null
  updatedAt: string
}

type RequirementRecord = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: "todo" | "doing" | "done" | "archived"
  priority: "low" | "normal" | "high" | "urgent"
  color: string | null
  sortOrder: number
  dueAt: string | null
  completedAt: string | null
  updatedAt: string
}

type TaskRecord = {
  id: string
  projectId: string
  requirementId: string | null
  title: string
  description: string | null
  status: "todo" | "doing" | "done" | "cancelled"
  priority: "low" | "normal" | "high" | "urgent"
  color: string | null
  isCompleted: 0 | 1
  sortOrder: number
  dueAt: string | null
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
  projectTitle?: string | null
  requirementTitle?: string | null
}

type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
  filePath: string | null
}

type NoteRecord = {
  id: string
  title: string
  nodeType: "folder" | "file"
  filePath: string | null
  updatedAt: string
}

type LinkedNoteRecord = {
  id: string
  title: string
  filePath: string | null
  updatedAt: string
}

type SpaceRecord = {
  id: string
  name: string
  rootPath: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
}

type PluginUiMode = "editor" | "display" | "panel"

type PluginModuleRecord = {
  id: string
  title: string
  orderIndex: number
}

type PluginManifestRecord = {
  name: string
  displayName: string
  version: string
  description: string | null
  sourcePath: string
  uiMode: PluginUiMode
  orderIndex: number
  permissions: {
    read: string[]
    write: string[]
  }
  modules: PluginModuleRecord[]
}

type PluginRecord = {
  id: string
  pluginKey: string
  displayName: string
  description: string | null
  version: string
  sourcePath: string
  sourceType: "local"
  uiMode: PluginUiMode
  enabled: 0 | 1
  isInstalled: 0 | 1
  orderIndex: number
  manifestJson: string
  permissionsJson: string
  settingsJson: string
  createdAt: string
  updatedAt: string
  manifest: PluginManifestRecord
}

type UpdateSettings = {
  enabled: boolean
  schedule: "startup" | "daily"
  dailyHour: number
  lastCheckedAt: string | null
}

type UpdateReleaseInfo = {
  version: string
  tagName: string
  name: string
  publishedAt: string | null
  releaseUrl: string
  summary: string
  body: string
  assets: {
    name: string
    size: number
    downloadUrl: string
  }[]
}

type UpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "error"
  currentVersion: string
  update: UpdateReleaseInfo | null
  error: string | null
  checkedAt: string | null
}

type UpdateSnapshot = {
  settings: UpdateSettings
  status: UpdateStatus
}

type HoraDBBridge = {
  listProjects: () => Promise<ProjectRecord[]>
  createProject: (input: Partial<ProjectRecord> & { title: string }) => Promise<ProjectRecord | null>
  getProject: (projectId: string) => Promise<ProjectRecord | null>
  updateProject: (input: Partial<ProjectRecord> & { id: string }) => Promise<ProjectRecord | null>
  deleteProject: (projectId: string) => Promise<boolean>
  reorderProjects: (input: { items: { id: string; sortOrder: number }[] }) => Promise<boolean>
  listRequirementsByProject: (projectId: string) => Promise<RequirementRecord[]>
  createRequirement: (input: {
    projectId: string
    title: string
    description?: string
    status?: RequirementRecord["status"]
    priority?: RequirementRecord["priority"]
    color?: string | null
    dueAt?: string | null
  }) => Promise<RequirementRecord | null>
  updateRequirement: (input: Partial<RequirementRecord> & { id: string }) => Promise<RequirementRecord | null>
  deleteRequirement: (requirementId: string) => Promise<boolean>
  reorderRequirements: (input: { projectId: string; items: { id: string; sortOrder: number }[] }) => Promise<boolean>
  listTasksByProject: (projectId: string) => Promise<TaskRecord[]>
  listAllTasks: (filters?: {
    projectId?: string
    requirementId?: string
    status?: TaskRecord["status"] | ""
    statuses?: TaskRecord["status"][]
    priority?: TaskRecord["priority"] | ""
    dueAt?: string
    dueAtFrom?: string
    dueAtTo?: string
    isCompleted?: boolean | ""
  }) => Promise<TaskRecord[]>
  createTask: (input: {
    projectId: string
    requirementId?: string | null
    title: string
    description?: string
    status?: TaskRecord["status"]
    priority?: TaskRecord["priority"]
    color?: string | null
    isCompleted?: boolean
    dueAt?: string | null
    startedAt?: string | null
  }) => Promise<TaskRecord | null>
  updateTask: (input: Omit<Partial<TaskRecord>, "isCompleted"> & { id: string; isCompleted?: boolean | 0 | 1 }) => Promise<TaskRecord | null>
  updateTaskStatus: (input: { id: string; status?: TaskRecord["status"]; done?: boolean }) => Promise<TaskRecord | null>
  deleteTask: (taskId: string) => Promise<boolean>
  reorderTasks: (input: { projectId: string; items: { id: string; sortOrder: number }[] }) => Promise<boolean>
  listNotesByProject: (projectId: string) => Promise<LinkedNoteRecord[]>
  listNotesByRequirement: (requirementId: string) => Promise<LinkedNoteRecord[]>
  listNotesByTask: (taskId: string) => Promise<LinkedNoteRecord[]>
  linkNoteToProject: (noteId: string, projectId: string) => Promise<boolean>
  unlinkNoteFromProject: (noteId: string, projectId: string) => Promise<boolean>
  linkNoteToRequirement: (noteId: string, requirementId: string) => Promise<boolean>
  unlinkNoteFromRequirement: (noteId: string, requirementId: string) => Promise<boolean>
  linkNoteToTask: (noteId: string, taskId: string) => Promise<boolean>
  unlinkNoteFromTask: (noteId: string, taskId: string) => Promise<boolean>
  listNoteNodes: () => Promise<NoteNodeRow[]>
  getNote: (noteId: string) => Promise<NoteRecord | null>
  readNoteContent: (noteId: string) => Promise<string>
  saveNoteContent: (input: { noteId: string; content: string }) => Promise<{
    id: string
    filePath: string
    fileSize: number
    fileHash: string
    updatedAt: string
  }>
  createNoteNode: (input: {
    parentId?: string | null
    nodeType: "folder" | "file"
    // 文件节点类型：markdown 为普通笔记，drawing 为 Excalidraw 绘图。
    fileKind?: "markdown" | "drawing"
    title: string
  }) => Promise<NoteNodeRow | null>
  renameNoteNode: (input: { id: string; title: string }) => Promise<boolean>
  deleteNoteNode: (input: { id: string }) => Promise<boolean>
  moveNoteNode: (input: { id: string; parentId?: string | null }) => Promise<boolean>
  // 在系统 Finder 中定位指定笔记文件或目录。
  showNoteInFinder: (noteId: string) => Promise<boolean>
  // 使用系统默认应用打开指定笔记区文件。
  openNoteWithDefaultApp: (noteId: string) => Promise<boolean>
  onNotesChanged: (callback: () => void) => (() => void) | undefined
  listPlugins: () => Promise<PluginRecord[]>
  getPlugin: (pluginKey: string) => Promise<PluginRecord | null>
  refreshPlugins: () => Promise<PluginRecord[]>
  updatePlugin: (input: Partial<PluginRecord> & { pluginKey: string }) => Promise<PluginRecord | null>
  setPluginEnabled: (pluginKey: string, enabled: boolean) => Promise<PluginRecord | null>
  reorderPlugins: (input: { items: { pluginKey: string; orderIndex: number }[] }) => Promise<boolean>
  updatePluginSettings: (input: { pluginKey: string; settingsJson: string }) => Promise<PluginRecord | null>
  getPluginRootPath: () => Promise<string>
  importPluginPackage: () => Promise<{ imported: boolean; reason?: string; targetDir?: string; restartRecommended?: boolean; plugins?: PluginRecord[] }>
  restartApp: () => Promise<boolean>
  getUpdateSnapshot: () => Promise<UpdateSnapshot>
  setUpdateSettings: (input: Partial<UpdateSettings>) => Promise<UpdateSettings>
  checkForUpdates: () => Promise<UpdateStatus>
  openReleasePage: (releaseUrl?: string) => Promise<boolean>
  onUpdateStatusChanged: (callback: (status: UpdateStatus) => void) => (() => void) | undefined
  getSpaceBootstrapState: () => Promise<{
    currentSpace: SpaceRecord | null
    spaces: SpaceRecord[]
    bootstrapRequired: boolean
  }>
  listSpaces: () => Promise<SpaceRecord[]>
  getCurrentSpace: () => Promise<SpaceRecord | null>
  pickSpaceDirectory: (input?: { defaultPath?: string }) => Promise<{ canceled: boolean; filePath: string }>
  createSpace: (input: { name: string; rootPath: string }) => Promise<SpaceRecord>
  switchSpace: (spaceId: string) => Promise<SpaceRecord>
  renameSpace: (input: { spaceId: string; name: string }) => Promise<SpaceRecord>
  deleteSpace: (spaceId: string) => Promise<boolean>
  migrateCurrentSpace: (input: { rootPath: string }) => Promise<SpaceRecord>
  reloadSpaceRuntime: () => Promise<{
    currentSpace: SpaceRecord | null
    spaces: SpaceRecord[]
    bootstrapRequired: boolean
  }>
  onSpacesChanged: (callback: () => void) => (() => void) | undefined
}

declare global {
  interface Window {
    horaDB?: HoraDBBridge
  }
}

export {}
