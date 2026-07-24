// 前端 DB 访问层：统一包一层 Electron IPC，浏览器环境只读返回空数据。
export type ProjectStatus = "active" | "paused" | "done" | "archived"
export type RequirementStatus = "todo" | "doing" | "done" | "archived"
export type TaskStatus = "todo" | "doing" | "done" | "cancelled"
export type Priority = "low" | "normal" | "high" | "urgent"

export type ProjectRecord = {
  id: string
  title: string
  description: string | null
  status: ProjectStatus
  priority: Priority
  color: string | null
  sortOrder: number
  startedAt: string | null
  dueAt: string | null
  completedAt: string | null
  updatedAt: string
}

export type RequirementRecord = {
  id: string
  projectId: string
  title: string
  description: string | null
  status: RequirementStatus
  priority: Priority
  color: string | null
  sortOrder: number
  dueAt: string | null
  completedAt: string | null
  updatedAt: string
}

export type TaskRecord = {
  id: string
  projectId: string
  requirementId: string | null
  title: string
  description: string | null
  status: TaskStatus
  priority: Priority
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

export type LinkedNoteRecord = {
  id: string
  title: string
  filePath: string | null
  updatedAt: string
}

// 笔记记录：用于 dashboard 读取笔记更新时间和标题。
export type NoteRecord = {
  id: string
  title: string
  nodeType: "folder" | "file"
  filePath: string | null
  updatedAt: string
}

export type SpaceRecord = {
  id: string
  name: string
  rootPath: string
  createdAt: string
  updatedAt: string
  lastOpenedAt: string | null
}

export type PluginUiMode = "editor" | "display" | "panel"

export type PluginModuleRecord = {
  id: string
  title: string
  orderIndex: number
}

export type PluginManifestRecord = {
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

export type PluginRecord = {
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

export type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
  filePath: string | null
}

export type TaskFilters = {
  projectId?: string
  requirementId?: string
  status?: TaskStatus | ""
  statuses?: TaskStatus[]
  priority?: Priority | ""
  dueAt?: string
  dueAtFrom?: string
  dueAtTo?: string
  isCompleted?: boolean | ""
}

export type UpdateSettings = {
  enabled: boolean
  schedule: "startup" | "daily"
  dailyHour: number
  lastCheckedAt: string | null
}

export type UpdateReleaseInfo = {
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

export type UpdateStatus = {
  state: "idle" | "checking" | "available" | "not-available" | "error"
  currentVersion: string
  update: UpdateReleaseInfo | null
  error: string | null
  checkedAt: string | null
}

export type UpdateSnapshot = {
  settings: UpdateSettings
  status: UpdateStatus
}

export type MailAddress = {
  name: string
  address: string
}

export type MailFolderRole = "inbox" | "sent" | "drafts" | "trash" | "archive" | "junk" | "custom"

export type MailAccountRecord = {
  id: string
  scope: "global" | "space"
  workspaceId: string | null
  emailAddress: string
  displayName: string | null
  authType: "password" | "oauth2"
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  syncEnabled: boolean
  syncMode: "manual" | "interval" | "realtime"
  syncIntervalMinutes: number
  lastSyncAt: string | null
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type MailFolderRecord = {
  id: string
  accountId: string
  path: string
  name: string
  role: MailFolderRole
  delimiter: string | null
  uidValidity: string | null
  uidNext: number | null
  highestModseq: string | null
  totalCount: number
  unreadCount: number
  sortOrder: number
  isRemote: boolean
  updatedAt: string
}

export type MailTreeAccount = MailAccountRecord & {
  folders: MailFolderRecord[]
}

export type MailAttachmentRecord = {
  id: string
  filename: string
  contentType: string | null
  size: number
  contentId: string | null
  cachePath: string | null
  downloadedAt: string | null
}

export type MailMessageRecord = {
  id: string
  accountId: string
  folderId: string
  messageUid: string | null
  messageId: string | null
  subject: string | null
  from: MailAddress[]
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  replyTo: MailAddress[]
  sentAt: string | null
  receivedAt: string | null
  snippet: string | null
  flags: string[]
  isRead: boolean
  isStarred: boolean
  hasAttachments: boolean
  size: number
  bodyCachePath: string | null
  rawCachePath: string | null
  pendingAction: string | null
  syncStatus: "synced" | "pending" | "error"
  lastError: string | null
  updatedAt: string
  reminderId?: string | null
  remindAt?: string | null
}

export type MailMessageDetail = MailMessageRecord & {
  body: {
    textBody: string | null
    htmlBody: string | null
    downloadedAt: string | null
  }
  attachments: MailAttachmentRecord[]
}

export type MailDraftRecord = {
  id: string
  accountId: string
  folderId: string | null
  messageId: string | null
  to: MailAddress[]
  cc: MailAddress[]
  bcc: MailAddress[]
  subject: string | null
  textBody: string | null
  htmlBody: string | null
  attachments: unknown[]
  syncStatus: "local" | "pending" | "synced" | "error"
  lastError: string | null
  createdAt: string
  updatedAt: string
}

export type MailNotificationSettings = {
  workspaceId: string
  enabled: boolean
  inboxOnly: boolean
  includeBodyPreview: boolean
  quietStart: string | null
  quietEnd: string | null
  updatedAt: string | null
}

export type MailReminderRecord = {
  id: string
  messageId: string
  remindAt: string
  status: "pending" | "delivered" | "cancelled"
  note: string | null
  createdAt: string
  updatedAt: string
}

export type MailRuleRecord = {
  id: string
  accountId: string | null
  name: string
  ruleType: "archive" | "block"
  field: "from" | "sender_name" | "subject"
  operator: "contains" | "equals"
  value: string
  targetFolderId: string | null
  enabled: boolean
  appliedCount?: number
  createdAt: string
  updatedAt: string
}

export type MailAccountInput = {
  id?: string
  scope: "global" | "space"
  emailAddress: string
  displayName?: string | null
  authType?: "password" | "oauth2"
  imapHost: string
  imapPort: number
  imapSecure: boolean
  smtpHost: string
  smtpPort: number
  smtpSecure: boolean
  username: string
  password?: string
  syncEnabled?: boolean
  syncMode?: "manual" | "interval" | "realtime"
  syncIntervalMinutes?: number
}

function requireHoraDB() {
  if (typeof window !== "undefined" && window.horaDB) {
    return window.horaDB
  }
  throw new Error("当前不是 Electron 运行环境，无法写入本地数据库")
}

// 数据写入后统一广播一次，方便项目页、任务页和列表页互相刷新。
function notifyHoraDbUpdated(scope: string) {
  if (typeof window === "undefined") return
  const revision = `${Date.now()}-${scope}`
  window.localStorage.setItem("hora_db_revision", revision)
  window.dispatchEvent(new CustomEvent("hora:db-updated", { detail: { scope, revision } }))
}

export async function listProjects(): Promise<ProjectRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listProjects) return window.horaDB.listProjects()
  return []
}

export async function getProject(projectId: string): Promise<ProjectRecord | null> {
  if (typeof window !== "undefined" && window.horaDB?.getProject) return window.horaDB.getProject(projectId)
  return null
}

export async function createProject(input: Partial<ProjectRecord> & { title: string }) {
  const result = await requireHoraDB().createProject(input)
  notifyHoraDbUpdated("project")
  return result
}

export async function updateProject(input: Partial<ProjectRecord> & { id: string }) {
  const result = await requireHoraDB().updateProject(input)
  notifyHoraDbUpdated("project")
  return result
}

export async function deleteProject(projectId: string) {
  const result = await requireHoraDB().deleteProject(projectId)
  notifyHoraDbUpdated("project")
  return result
}

export async function reorderProjects(input: { items: { id: string; sortOrder: number }[] }) {
  const result = await requireHoraDB().reorderProjects(input)
  notifyHoraDbUpdated("project")
  return result
}

export async function listRequirementsByProject(projectId: string): Promise<RequirementRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listRequirementsByProject) {
    return window.horaDB.listRequirementsByProject(projectId)
  }
  return []
}

export async function createRequirement(input: {
  projectId: string
  title: string
  description?: string
  status?: RequirementStatus
  priority?: Priority
  color?: string | null
  dueAt?: string | null
}) {
  const result = await requireHoraDB().createRequirement(input)
  notifyHoraDbUpdated("requirement")
  return result
}

export async function updateRequirement(input: Partial<RequirementRecord> & { id: string }) {
  const result = await requireHoraDB().updateRequirement(input)
  notifyHoraDbUpdated("requirement")
  return result
}

export async function deleteRequirement(requirementId: string) {
  const result = await requireHoraDB().deleteRequirement(requirementId)
  notifyHoraDbUpdated("requirement")
  return result
}

export async function reorderRequirements(input: { projectId: string; items: { id: string; sortOrder: number }[] }) {
  const result = await requireHoraDB().reorderRequirements(input)
  notifyHoraDbUpdated("requirement")
  return result
}

export async function listTasksByProject(projectId: string): Promise<TaskRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listTasksByProject) {
    return window.horaDB.listTasksByProject(projectId)
  }
  return []
}

export async function listAllTasks(filters: TaskFilters = {}): Promise<TaskRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listAllTasks) return window.horaDB.listAllTasks(filters)
  return []
}

export async function createTask(input: {
  projectId: string
  requirementId?: string | null
  title: string
  description?: string
  status?: TaskStatus
  priority?: Priority
  color?: string | null
  isCompleted?: boolean
  dueAt?: string | null
  startedAt?: string | null
}) {
  const result = await requireHoraDB().createTask(input)
  notifyHoraDbUpdated("task")
  return result
}

export async function updateTask(input: Omit<Partial<TaskRecord>, "isCompleted"> & { id: string; isCompleted?: boolean | 0 | 1 }) {
  const result = await requireHoraDB().updateTask(input)
  notifyHoraDbUpdated("task")
  return result
}

export async function updateTaskStatus(input: { id: string; status?: TaskStatus; done?: boolean }) {
  const result = await requireHoraDB().updateTaskStatus(input)
  notifyHoraDbUpdated("task")
  return result
}

export async function deleteTask(taskId: string) {
  const result = await requireHoraDB().deleteTask(taskId)
  notifyHoraDbUpdated("task")
  return result
}

export async function reorderTasks(input: { projectId: string; items: { id: string; sortOrder: number }[] }) {
  const result = await requireHoraDB().reorderTasks(input)
  notifyHoraDbUpdated("task")
  return result
}

export async function listNotesByProject(projectId: string): Promise<LinkedNoteRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listNotesByProject) {
    return window.horaDB.listNotesByProject(projectId)
  }
  return []
}

export async function getNote(noteId: string): Promise<NoteRecord | null> {
  if (typeof window !== "undefined" && window.horaDB?.getNote) {
    return window.horaDB.getNote(noteId)
  }
  return null
}

export async function listPlugins(): Promise<PluginRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listPlugins) return window.horaDB.listPlugins()
  return []
}

export async function getPlugin(pluginKey: string): Promise<PluginRecord | null> {
  if (typeof window !== "undefined" && window.horaDB?.getPlugin) return window.horaDB.getPlugin(pluginKey)
  return null
}

export async function refreshPlugins(): Promise<PluginRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.refreshPlugins) return window.horaDB.refreshPlugins()
  return []
}

export async function updatePlugin(input: Partial<PluginRecord> & { pluginKey: string }) {
  const result = await requireHoraDB().updatePlugin(input)
  notifyHoraDbUpdated("plugin")
  return result
}

export async function setPluginEnabled(pluginKey: string, enabled: boolean) {
  const result = await requireHoraDB().setPluginEnabled(pluginKey, enabled)
  notifyHoraDbUpdated("plugin")
  return result
}

export async function reorderPlugins(input: { items: { pluginKey: string; orderIndex: number }[] }) {
  const result = await requireHoraDB().reorderPlugins(input)
  notifyHoraDbUpdated("plugin")
  return result
}

export async function updatePluginSettings(input: { pluginKey: string; settingsJson: string }) {
  const result = await requireHoraDB().updatePluginSettings(input)
  notifyHoraDbUpdated("plugin")
  return result
}

export async function getPluginRootPath(): Promise<string> {
  if (typeof window !== "undefined" && window.horaDB?.getPluginRootPath) return window.horaDB.getPluginRootPath()
  return ""
}

export async function importPluginPackage() {
  const result = await requireHoraDB().importPluginPackage()
  if (result?.imported) {
    notifyHoraDbUpdated("plugin")
  }
  return result
}

export async function restartApp() {
  return requireHoraDB().restartApp()
}

export async function getUpdateSnapshot(): Promise<UpdateSnapshot> {
  if (typeof window !== "undefined" && window.horaDB?.getUpdateSnapshot) return window.horaDB.getUpdateSnapshot()
  return {
    settings: {
      enabled: false,
      schedule: "daily",
      dailyHour: 10,
      lastCheckedAt: null,
    },
    status: {
      state: "idle",
      currentVersion: "0.0.0",
      update: null,
      error: null,
      checkedAt: null,
    },
  }
}

export async function setUpdateSettings(input: Partial<UpdateSettings>): Promise<UpdateSettings> {
  if (typeof window !== "undefined" && window.horaDB?.setUpdateSettings) return window.horaDB.setUpdateSettings(input)
  return {
    enabled: Boolean(input.enabled),
    schedule: input.schedule === "startup" ? "startup" : "daily",
    dailyHour: typeof input.dailyHour === "number" ? input.dailyHour : 10,
    lastCheckedAt: input.lastCheckedAt ?? null,
  }
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (typeof window !== "undefined" && window.horaDB?.checkForUpdates) return window.horaDB.checkForUpdates()
  return {
    state: "error",
    currentVersion: "0.0.0",
    update: null,
    error: "当前不是 Electron 运行环境，无法检查更新",
    checkedAt: new Date().toISOString(),
  }
}

export async function openReleasePage(releaseUrl?: string) {
  if (typeof window !== "undefined" && window.horaDB?.openReleasePage) return window.horaDB.openReleasePage(releaseUrl)
  if (releaseUrl) window.open(releaseUrl, "_blank", "noopener,noreferrer")
  return Boolean(releaseUrl)
}

export async function listMailAccounts(): Promise<MailAccountRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailAccounts) return window.horaDB.listMailAccounts()
  return []
}

export async function saveMailAccount(input: MailAccountInput): Promise<MailAccountRecord | null> {
  const result = await requireHoraDB().saveMailAccount(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function testMailAccount(input: MailAccountInput): Promise<{ ok: boolean; error: string | null }> {
  if (typeof window !== "undefined" && window.horaDB?.testMailAccount) return window.horaDB.testMailAccount(input)
  return { ok: false, error: "当前不是 Electron 运行环境，无法测试邮箱账号" }
}

export async function deleteMailAccount(accountId: string): Promise<boolean> {
  const result = await requireHoraDB().deleteMailAccount(accountId)
  notifyHoraDbUpdated("mail")
  return result
}

export async function syncMailAccount(accountId: string): Promise<{ ok: boolean; folders: number; messages: number; error: string | null }> {
  const result = await requireHoraDB().syncMailAccount(accountId)
  notifyHoraDbUpdated("mail")
  return result
}

export async function listMailTree(): Promise<MailTreeAccount[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailTree) return window.horaDB.listMailTree()
  return []
}

export async function listMailFolders(accountId: string): Promise<MailFolderRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailFolders) return window.horaDB.listMailFolders(accountId)
  return []
}

export async function createMailFolder(input: { accountId: string; name: string }): Promise<MailFolderRecord | null> {
  const result = await requireHoraDB().createMailFolder(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function renameMailFolder(input: { folderId: string; name: string }): Promise<MailFolderRecord | null> {
  const result = await requireHoraDB().renameMailFolder(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function deleteMailFolder(input: { folderId: string }): Promise<{ ok: boolean; inboxFolderId: string }> {
  const result = await requireHoraDB().deleteMailFolder(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function listMailMessages(input: { folderId: string; limit?: number; offset?: number }): Promise<MailMessageRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailMessages) return window.horaDB.listMailMessages(input)
  return []
}

export async function listMailReminderMessages(): Promise<MailMessageRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailReminderMessages) return window.horaDB.listMailReminderMessages()
  return []
}

export async function getMailMessage(messageId: string): Promise<MailMessageDetail | null> {
  if (typeof window !== "undefined" && window.horaDB?.getMailMessage) return window.horaDB.getMailMessage(messageId)
  return null
}

export async function updateMailMessageState(input: {
  messageId: string
  isRead?: boolean
  isStarred?: boolean
  pendingAction?: string
}): Promise<MailMessageDetail | null> {
  const result = await requireHoraDB().updateMailMessageState(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function moveMailMessage(input: { messageId: string; targetFolderId: string }): Promise<MailMessageDetail | null> {
  const result = await requireHoraDB().moveMailMessage(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function deleteMailMessage(messageId: string): Promise<boolean> {
  const result = await requireHoraDB().deleteMailMessage(messageId)
  notifyHoraDbUpdated("mail")
  return result
}

export async function markMailFolderRead(folderId: string): Promise<{ ok: boolean; changedCount: number; error?: string | null }> {
  const result = await requireHoraDB().markMailFolderRead(folderId)
  notifyHoraDbUpdated("mail")
  return result
}

export async function saveMailReminder(input: { messageId: string; remindAt: string; note?: string | null }): Promise<MailReminderRecord | null> {
  const result = await requireHoraDB().saveMailReminder(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function listMailRules(accountId?: string | null): Promise<MailRuleRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailRules) return window.horaDB.listMailRules(accountId || null)
  return []
}

export async function saveMailRule(input: {
  id?: string
  accountId?: string | null
  name?: string
  ruleType: "archive" | "block"
  field: "from" | "sender_name" | "subject"
  operator?: "contains" | "equals"
  value: string
  targetFolderId?: string | null
  enabled?: boolean
  applyExisting?: boolean
}): Promise<MailRuleRecord | null> {
  const result = await requireHoraDB().saveMailRule(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function deleteMailRule(ruleId: string): Promise<boolean> {
  const result = await requireHoraDB().deleteMailRule(ruleId)
  notifyHoraDbUpdated("mail")
  return result
}

export async function blockMailSender(input: { messageId: string }): Promise<MailRuleRecord | null> {
  const result = await requireHoraDB().blockMailSender(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function getMailNotificationSettings(): Promise<MailNotificationSettings> {
  if (typeof window !== "undefined" && window.horaDB?.getMailNotificationSettings) {
    return window.horaDB.getMailNotificationSettings()
  }
  return {
    workspaceId: "local",
    enabled: false,
    inboxOnly: true,
    includeBodyPreview: false,
    quietStart: null,
    quietEnd: null,
    updatedAt: null,
  }
}

export async function saveMailNotificationSettings(input: Partial<Omit<MailNotificationSettings, "workspaceId" | "updatedAt">>): Promise<MailNotificationSettings> {
  const result = await requireHoraDB().saveMailNotificationSettings(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function listMailDrafts(accountId: string): Promise<MailDraftRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listMailDrafts) return window.horaDB.listMailDrafts(accountId)
  return []
}

export async function saveMailDraft(input: {
  id?: string
  accountId: string
  folderId?: string | null
  messageId?: string | null
  to?: MailAddress[]
  cc?: MailAddress[]
  bcc?: MailAddress[]
  subject?: string
  textBody?: string
  htmlBody?: string | null
  attachments?: unknown[]
  syncStatus?: "local" | "pending" | "synced" | "error"
  lastError?: string | null
}): Promise<MailDraftRecord | null> {
  const result = await requireHoraDB().saveMailDraft(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function deleteMailDraft(draftId: string): Promise<boolean> {
  const result = await requireHoraDB().deleteMailDraft(draftId)
  notifyHoraDbUpdated("mail")
  return result
}

export async function sendMail(input: {
  accountId: string
  draftId?: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject?: string
  textBody?: string
  htmlBody?: string
  attachments?: unknown[]
}): Promise<{ ok: boolean; messageId: string | null }> {
  const result = await requireHoraDB().sendMail(input)
  notifyHoraDbUpdated("mail")
  return result
}

export async function getSpaceBootstrapState(): Promise<{
  currentSpace: SpaceRecord | null
  spaces: SpaceRecord[]
  bootstrapRequired: boolean
}> {
  if (typeof window !== "undefined" && window.horaDB?.getSpaceBootstrapState) {
    return window.horaDB.getSpaceBootstrapState()
  }
  return { currentSpace: null, spaces: [], bootstrapRequired: false }
}

export async function listSpaces(): Promise<SpaceRecord[]> {
  if (typeof window !== "undefined" && window.horaDB?.listSpaces) return window.horaDB.listSpaces()
  return []
}

export async function getCurrentSpace(): Promise<SpaceRecord | null> {
  if (typeof window !== "undefined" && window.horaDB?.getCurrentSpace) return window.horaDB.getCurrentSpace()
  return null
}

export async function pickSpaceDirectory(input?: { defaultPath?: string }) {
  if (typeof window !== "undefined" && window.horaDB?.pickSpaceDirectory) return window.horaDB.pickSpaceDirectory(input)
  return { canceled: true, filePath: "" }
}

export async function createSpace(input: { name: string; rootPath: string }) {
  const result = await requireHoraDB().createSpace(input)
  notifyHoraDbUpdated("space")
  return result
}

export async function switchSpace(spaceId: string) {
  const result = await requireHoraDB().switchSpace(spaceId)
  notifyHoraDbUpdated("space")
  return result
}

export async function renameSpace(input: { spaceId: string; name: string }) {
  const result = await requireHoraDB().renameSpace(input)
  notifyHoraDbUpdated("space")
  return result
}

export async function deleteSpace(spaceId: string) {
  const result = await requireHoraDB().deleteSpace(spaceId)
  notifyHoraDbUpdated("space")
  return result
}

export async function migrateCurrentSpace(input: { rootPath: string }) {
  const result = await requireHoraDB().migrateCurrentSpace(input)
  notifyHoraDbUpdated("space")
  return result
}

export async function reloadSpaceRuntime() {
  return requireHoraDB().reloadSpaceRuntime()
}

export async function listNoteNodes(): Promise<NoteNodeRow[]> {
  if (typeof window !== "undefined" && window.horaDB?.listNoteNodes) return window.horaDB.listNoteNodes()
  return []
}

export async function createNoteNode(input: {
  parentId?: string | null
  nodeType: "folder" | "file"
  fileKind?: "markdown" | "drawing"
  title: string
}) {
  return requireHoraDB().createNoteNode(input)
}

export async function saveNoteContent(input: { noteId: string; content: string }) {
  return requireHoraDB().saveNoteContent(input)
}

export async function linkNoteToProject(noteId: string, projectId: string) {
  return requireHoraDB().linkNoteToProject(noteId, projectId)
}

export async function unlinkNoteFromProject(noteId: string, projectId: string) {
  return requireHoraDB().unlinkNoteFromProject(noteId, projectId)
}
