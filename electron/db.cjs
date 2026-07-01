// Electron 本地数据库模块：文件系统驱动 Markdown，SQLite 仅做索引与 metadata。
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { app } = require("electron")
const Database = require("better-sqlite3")
const chokidar = require("chokidar")
const space = require("./space.cjs")

let dbInstance = null
let notesWatcher = null

const WORKSPACE_ID = "ws_local_default"
const LOCAL_OWNER = "local_owner"

// 统一路径：Hora 数据目录。
function getHoraDataPath() {
  return space.getCurrentSpaceRootPath()
}

// 统一路径：Vault 根目录。
function getVaultPath() {
  return path.join(getHoraDataPath(), "vault")
}

// 统一路径：notes 目录。
function getNotesPath() {
  return path.join(getVaultPath(), "notes")
}

// 统一路径：SQLite 文件。
function getDbPath() {
  return path.join(getHoraDataPath(), "hora.db")
}

// 统一路径：插件包根目录。
function getPluginsRootPath() {
  return path.join(getHoraDataPath(), "plugins")
}

// 确保插件根目录存在：打包后插件包必须落在用户可写路径。
function ensurePluginsRootPath() {
  const pluginsPath = getPluginsRootPath()
  fs.mkdirSync(pluginsPath, { recursive: true })
  return pluginsPath
}

// 重置运行时：切换空间后关闭数据库和监听器，重新按新路径初始化。
function resetRuntime() {
  if (notesWatcher) {
    try {
      notesWatcher.close()
    } catch {
      // 关闭失败时不阻断空间切换，后续会重新创建监听。
    }
    notesWatcher = null
  }

  if (dbInstance) {
    try {
      dbInstance.close()
    } catch {
      // 数据库关闭失败时忽略，确保后续能继续重建新空间实例。
    }
    dbInstance = null
  }
}

// 解析初始化 SQL 路径：兼容开发与打包。
function resolveSqlPath() {
  if (app.isPackaged) {
    const packagedCandidates = [
      path.join(process.resourcesPath, "resources", "sql", "init_local_full.sql"),
      path.join(process.resourcesPath, "sql", "init_local_full.sql"),
    ]
    const packagedFound = packagedCandidates.find((filePath) => fs.existsSync(filePath))
    if (packagedFound) return packagedFound
    return packagedCandidates[0]
  }

  const appPath = app.getAppPath()
  const devCandidates = [
    path.join(appPath, "resources", "sql", "init_local_full.sql"),
    path.join(appPath, "electron", "resources", "sql", "init_local_full.sql"),
  ]
  const devFound = devCandidates.find((filePath) => fs.existsSync(filePath))
  if (devFound) return devFound
  return devCandidates[0]
}

// 计算文本哈希：用于内容变更识别。
function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex")
}

// 可显示在左侧目录中的常见文件类型：文本尽量内嵌展示，办公文档交给系统默认应用。
const SUPPORTED_NOTE_FILE_SUFFIXES = [
  ".excalidraw.md",
  ".excalidraw",
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".log",
  ".csv",
  ".tsv",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".rtf",
]

// 可按 UTF-8 安全读取的文本文件：二进制文件不进入编辑器读写链路。
const TEXT_READABLE_NOTE_FILE_SUFFIXES = [
  ".excalidraw.md",
  ".excalidraw",
  ".md",
  ".markdown",
  ".txt",
  ".text",
  ".log",
  ".csv",
  ".tsv",
]

// 计算文件哈希：使用 Buffer，避免 PDF/Word/Excel 等二进制文件被 UTF-8 转码破坏。
function sha256File(filePath) {
  if (!fs.existsSync(filePath)) return null
  const buffer = fs.readFileSync(filePath)
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

// 取得受支持文件的真实后缀；.excalidraw.md 需要作为组合后缀处理。
function getSupportedFileSuffix(fileName) {
  const lower = String(fileName || "").toLowerCase()
  return SUPPORTED_NOTE_FILE_SUFFIXES.find((suffix) => lower.endsWith(suffix)) || ""
}

// 去掉已知后缀后作为标题/基础文件名，避免 a.pdf 显示成 a.pdf。
function stripSupportedFileSuffix(fileName) {
  const suffix = getSupportedFileSuffix(fileName)
  return suffix ? fileName.slice(0, -suffix.length) : fileName
}

// 标题派生：xxx.md / xxx.pdf / xxx.excalidraw.md => xxx。
function titleFromFileName(fileName) {
  return stripSupportedFileSuffix(fileName)
}

// 判断是否是受支持的笔记区文件。
function isSupportedNoteFileName(fileName) {
  return Boolean(getSupportedFileSuffix(fileName))
}

// 判断是否可以按文本读取，避免二进制文件进入 read/write 文本逻辑。
function isTextReadableNoteFileName(fileName) {
  const lower = String(fileName || "").toLowerCase()
  return TEXT_READABLE_NOTE_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

// 判断是否是绘图文件（Obsidian 风格后缀）。
function isDrawingFileName(fileName) {
  const lower = fileName.toLowerCase()
  return lower.endsWith(".excalidraw.md") || lower.endsWith(".excalidraw")
}

// 根据路径保留真实文件后缀：移动/重命名时不能把 PDF/Word/Excel 误改成 .md。
function getFileSuffixFromPath(filePath) {
  const fileName = path.posix.basename(filePath || "")
  return getSupportedFileSuffix(fileName) || path.posix.extname(fileName) || ".md"
}

// 生成稳定节点 ID：同一路径保持稳定。
function buildNodeId(prefix, relativePath) {
  const seed = `${prefix}:${relativePath}`
  const short = crypto.createHash("sha1").update(seed, "utf8").digest("hex").slice(0, 16)
  return `${prefix}_${short}`
}

// 生成业务实体 ID：项目/需求/任务不依赖文件路径，使用随机种子避免毫秒冲突。
function buildEntityId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
}

// 插件 UI 模式：用于设置页和插件清单同步。
const PLUGIN_UI_MODES = new Set(["editor", "display", "panel"])

// 规范化插件模块条目：即使清单缺字段也尽量给出稳定结构。
function normalizePluginModule(module, index) {
  const id = String(module?.id || module?.name || `module-${index}`).trim()
  return {
    id,
    title: String(module?.title || module?.displayName || id).trim(),
    orderIndex: Number.isFinite(Number(module?.orderIndex)) ? Number(module.orderIndex) : index,
  }
}

// 规范化插件清单：把可选字段压平成可写入数据库的结构。
function normalizePluginManifest(manifest, folderName, sourcePath, orderIndex) {
  const pluginKey = String(manifest?.name || folderName || "").trim()
  const displayName = String(manifest?.displayName || pluginKey || folderName || "plugin").trim()
  const version = String(manifest?.version || "1.0.0").trim() || "1.0.0"
  const description = typeof manifest?.description === "string" && manifest.description.trim()
    ? manifest.description.trim()
    : null
  const uiMode = PLUGIN_UI_MODES.has(manifest?.uiMode) ? manifest.uiMode : "panel"
  const permissions = manifest?.permissions && typeof manifest.permissions === "object"
    ? {
        read: Array.isArray(manifest.permissions.read)
          ? manifest.permissions.read.map((item) => String(item).trim()).filter(Boolean)
          : [],
        write: Array.isArray(manifest.permissions.write)
          ? manifest.permissions.write.map((item) => String(item).trim()).filter(Boolean)
          : [],
      }
    : { read: [], write: [] }
  const modules = Array.isArray(manifest?.modules)
    ? manifest.modules.map((module, index) => normalizePluginModule(module, index)).filter((module) => module.id)
    : []

  return {
    name: pluginKey,
    displayName,
    version,
    description,
    sourcePath,
    uiMode,
    orderIndex,
    permissions,
    modules,
  }
}

// 绝对路径 => 相对 vault 路径。
function toVaultRelativePath(absPath) {
  const vaultPath = getVaultPath()
  const relative = path.relative(vaultPath, absPath)
  return relative.split(path.sep).join("/")
}

// 相对 vault 路径 => 绝对路径。
function toVaultAbsolutePath(relativePath) {
  return path.join(getVaultPath(), relativePath)
}

// 确保 note_nodes 具备文件系统驱动字段。
function ensureNoteSchema(db) {
  const columns = db.prepare("PRAGMA table_info(note_nodes)").all()
  const hasColumn = (name) => columns.some((col) => col.name === name)

  if (!hasColumn("file_path")) db.exec("ALTER TABLE note_nodes ADD COLUMN file_path TEXT")
  if (!hasColumn("file_size")) db.exec("ALTER TABLE note_nodes ADD COLUMN file_size INTEGER NOT NULL DEFAULT 0")
  if (!hasColumn("file_hash")) db.exec("ALTER TABLE note_nodes ADD COLUMN file_hash TEXT")
  if (!hasColumn("sync_status")) db.exec("ALTER TABLE note_nodes ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'local'")
  if (!hasColumn("content_updated_at")) db.exec("ALTER TABLE note_nodes ADD COLUMN content_updated_at TEXT")
  if (!hasColumn("meta_updated_at")) db.exec("ALTER TABLE note_nodes ADD COLUMN meta_updated_at TEXT")

  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_note_nodes_file_path_alive
    ON note_nodes(file_path)
    WHERE is_deleted = 0 AND file_path IS NOT NULL
  `)
}

// 判断表结构是否已经使用新版 CHECK 约束。
function tableSqlIncludes(db, tableName, expectedText) {
  const row = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName)
  return Boolean(row?.sql?.includes(expectedText))
}

// 旧表补列：重建复制前先补齐可空列，避免旧版本字段缺失导致迁移失败。
function ensureColumn(db, tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all()
  const hasColumn = columns.some((col) => col.name === columnName)
  if (!hasColumn) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`)
  }
}

// 重建 projects：旧表 CHECK 约束不支持 paused/done，必须重建才能写入新版状态。
function rebuildProjectsTable(db) {
  db.exec(`
    ALTER TABLE projects RENAME TO projects_old;
  `)

  ensureColumn(db, "projects_old", "priority", "TEXT NOT NULL DEFAULT 'normal'")
  ensureColumn(db, "projects_old", "color", "TEXT")
  ensureColumn(db, "projects_old", "started_at", "TEXT")
  ensureColumn(db, "projects_old", "due_at", "TEXT")
  ensureColumn(db, "projects_old", "completed_at", "TEXT")

  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'done', 'archived')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      started_at TEXT,
      due_at TEXT,
      completed_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'local_owner',
      updated_by TEXT NOT NULL DEFAULT 'local_owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    INSERT INTO projects (
      id, workspace_id, title, description, status, priority, color, sort_order,
      started_at, due_at, completed_at, is_deleted, created_by, updated_by, created_at, updated_at
    )
    SELECT
      id,
      workspace_id,
      title,
      description,
      CASE WHEN status IN ('active', 'paused', 'done', 'archived') THEN status ELSE 'active' END,
      CASE WHEN priority IN ('low', 'normal', 'high', 'urgent') THEN priority ELSE 'normal' END,
      color,
      sort_order,
      started_at,
      due_at,
      completed_at,
      is_deleted,
      COALESCE(created_by, 'local_owner'),
      COALESCE(updated_by, 'local_owner'),
      created_at,
      updated_at
    FROM projects_old;

    DROP TABLE projects_old;
  `)
}

// 重建 requirements：旧 requirements 曾被当作任务使用，这里只保留需求语义字段，不自动拆成 tasks。
function rebuildRequirementsTable(db) {
  db.exec(`
    ALTER TABLE requirements RENAME TO requirements_old;
  `)

  ensureColumn(db, "requirements_old", "color", "TEXT")

  db.exec(`
    CREATE TABLE requirements (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'doing', 'done', 'archived')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      color TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      due_at TEXT,
      completed_at TEXT,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'local_owner',
      updated_by TEXT NOT NULL DEFAULT 'local_owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    INSERT INTO requirements (
      id, project_id, title, description, status, priority, color, sort_order,
      due_at, completed_at, is_deleted, created_by, updated_by, created_at, updated_at
    )
    SELECT
      id,
      project_id,
      title,
      description,
      CASE WHEN status IN ('todo', 'doing', 'done', 'archived') THEN status ELSE 'todo' END,
      CASE WHEN priority IN ('low', 'normal', 'high', 'urgent') THEN priority ELSE 'normal' END,
      color,
      sort_order,
      due_at,
      completed_at,
      is_deleted,
      COALESCE(created_by, 'local_owner'),
      COALESCE(updated_by, 'local_owner'),
      created_at,
      updated_at
    FROM requirements_old;

    DROP TABLE requirements_old;
  `)
}

// 确保 Projects / Requirements / Tasks / 关联表为新版结构，不触碰 note_nodes。
function ensureProjectSchema(db) {
  db.exec("DROP VIEW IF EXISTS v_dashboard_summary")

  const rebuiltProjects = !tableSqlIncludes(db, "projects", "'paused'")
  if (rebuiltProjects) {
    rebuildProjectsTable(db)
  }

  if (rebuiltProjects || !tableSqlIncludes(db, "requirements", "'doing'")) {
    rebuildRequirementsTable(db)
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      requirement_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'todo'
        CHECK (status IN ('todo', 'doing', 'done', 'cancelled')),
      priority TEXT NOT NULL DEFAULT 'normal'
        CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
      color TEXT,
      is_completed INTEGER NOT NULL DEFAULT 0,
      is_deleted INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      due_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      created_by TEXT NOT NULL DEFAULT 'local_owner',
      updated_by TEXT NOT NULL DEFAULT 'local_owner',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id),
      FOREIGN KEY (requirement_id) REFERENCES requirements(id)
    );

    CREATE TABLE IF NOT EXISTS note_project_links (
      note_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (note_id, project_id),
      FOREIGN KEY (note_id) REFERENCES note_nodes(id),
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS note_requirement_links (
      note_id TEXT NOT NULL,
      requirement_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (note_id, requirement_id),
      FOREIGN KEY (note_id) REFERENCES note_nodes(id),
      FOREIGN KEY (requirement_id) REFERENCES requirements(id)
    );

    CREATE TABLE IF NOT EXISTS note_task_links (
      note_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (note_id, task_id),
      FOREIGN KEY (note_id) REFERENCES note_nodes(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id)
    );

    CREATE INDEX IF NOT EXISTS idx_projects_workspace
    ON projects(workspace_id, is_deleted, sort_order);

    CREATE INDEX IF NOT EXISTS idx_projects_status_priority
    ON projects(status, priority, updated_at DESC);

    CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_title_alive
    ON projects(workspace_id, title)
    WHERE is_deleted = 0;

    CREATE INDEX IF NOT EXISTS idx_requirements_project
    ON requirements(project_id, is_deleted, sort_order);

    CREATE INDEX IF NOT EXISTS idx_requirements_status
    ON requirements(status, priority, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tasks_project
    ON tasks(project_id, is_deleted, sort_order);

    CREATE INDEX IF NOT EXISTS idx_tasks_requirement
    ON tasks(requirement_id, is_deleted, sort_order);

    CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
    ON tasks(status, priority, due_at, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_tasks_due
    ON tasks(due_at, status, is_deleted);

    CREATE VIEW IF NOT EXISTS v_dashboard_summary AS
    SELECT
      p.workspace_id AS workspace_id,
      COUNT(DISTINCT p.id) AS project_total,
      SUM(CASE WHEN p.status = 'active' AND p.is_deleted = 0 THEN 1 ELSE 0 END) AS project_active,
      SUM(CASE WHEN p.status = 'archived' AND p.is_deleted = 0 THEN 1 ELSE 0 END) AS project_archived,
      SUM(CASE WHEN r.status = 'todo' AND r.is_deleted = 0 THEN 1 ELSE 0 END) AS requirement_todo,
      SUM(CASE WHEN r.status = 'done' AND r.is_deleted = 0 THEN 1 ELSE 0 END) AS requirement_done,
      SUM(CASE WHEN r.priority = 'urgent' AND r.is_deleted = 0 THEN 1 ELSE 0 END) AS requirement_urgent
    FROM projects p
    LEFT JOIN requirements r ON r.project_id = p.id
    WHERE p.is_deleted = 0
    GROUP BY p.workspace_id;
  `)
}

// 确保插件表存在：记录插件元数据、排序、启用状态和设置 JSON。
function ensurePluginSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS plugins (
      id TEXT PRIMARY KEY,
      plugin_key TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      description TEXT,
      version TEXT NOT NULL DEFAULT '1.0.0',
      source_path TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'local',
      ui_mode TEXT NOT NULL DEFAULT 'panel'
        CHECK (ui_mode IN ('editor', 'display', 'panel')),
      enabled INTEGER NOT NULL DEFAULT 1,
      is_installed INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 0,
      manifest_json TEXT NOT NULL DEFAULT '{}',
      permissions_json TEXT NOT NULL DEFAULT '{}',
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_plugins_enabled_order
    ON plugins(is_installed DESC, enabled DESC, order_index ASC, updated_at DESC);
  `)
}

// 读取插件清单：扫描根目录 plugins/ 下的每个插件包。
function scanPluginManifests() {
  const pluginsPath = ensurePluginsRootPath()
  if (!fs.existsSync(pluginsPath)) {
    return []
  }

  const entries = fs.readdirSync(pluginsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))

  const results = []

  for (const [index, entry] of entries.entries()) {
    const manifestPath = path.join(pluginsPath, entry.name, ".codex-plugin", "plugin.json")
    if (!fs.existsSync(manifestPath)) continue

    try {
      const raw = fs.readFileSync(manifestPath, "utf8")
      const parsed = JSON.parse(raw)
      const manifest = normalizePluginManifest(parsed, entry.name, `./plugins/${entry.name}`, index)
      if (!manifest.name) continue
      results.push({
        folderName: entry.name,
        manifest,
        manifestJson: JSON.stringify(parsed),
      })
    } catch (error) {
      console.warn("[hora] invalid plugin manifest:", manifestPath, error)
    }
  }

  return results
}

// 读取插件清单文件：导入时先校验 manifest，再决定目标目录名。
function readPluginManifestFromDirectory(sourceDir) {
  const manifestPath = path.join(sourceDir, ".codex-plugin", "plugin.json")
  if (!fs.existsSync(manifestPath)) {
    throw new Error("插件包缺少 .codex-plugin/plugin.json")
  }

  const raw = fs.readFileSync(manifestPath, "utf8")
  const parsed = JSON.parse(raw)
  const folderName = path.basename(sourceDir)
  return normalizePluginManifest(parsed, folderName, `./plugins/${folderName}`, 0)
}

// 导入插件包：复制整个目录到运行时插件根目录。
function importPluginPackage(sourceDir) {
  const manifest = readPluginManifestFromDirectory(sourceDir)
  if (!manifest.name) {
    throw new Error("插件清单缺少 name")
  }

  const pluginsPath = ensurePluginsRootPath()
  const targetDir = path.join(pluginsPath, manifest.name)

  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.cpSync(sourceDir, targetDir, { recursive: true })
  return targetDir
}

// 把磁盘里的插件清单同步到数据库。
function syncPluginsFromFilesystem(db = dbInstance) {
  if (!db) {
    return []
  }

  const scanned = scanPluginManifests()
  const existingRows = db.prepare(`
    SELECT
      id,
      plugin_key AS pluginKey,
      enabled,
      is_installed AS isInstalled,
      order_index AS orderIndex,
      settings_json AS settingsJson,
      created_at AS createdAt
    FROM plugins
  `).all()
  const existingMap = new Map(existingRows.map((row) => [row.pluginKey, row]))
  const now = new Date().toISOString()

  const upsertStmt = db.prepare(`
    INSERT INTO plugins (
      id, plugin_key, display_name, description, version, source_path, source_type, ui_mode,
      enabled, is_installed, order_index, manifest_json, permissions_json, settings_json,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'local', ?, ?, 1, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(plugin_key) DO UPDATE SET
      display_name = excluded.display_name,
      description = excluded.description,
      version = excluded.version,
      source_path = excluded.source_path,
      source_type = excluded.source_type,
      ui_mode = excluded.ui_mode,
      is_installed = 1,
      manifest_json = excluded.manifest_json,
      permissions_json = excluded.permissions_json,
      updated_at = excluded.updated_at
  `)

  const txn = db.transaction(() => {
    for (const item of scanned) {
      const existing = existingMap.get(item.manifest.name)
      const pluginId = existing?.id || buildEntityId("plugin")
      const settingsJson = existing?.settingsJson || "{}"
      const orderIndex = existing?.orderIndex ?? item.manifest.orderIndex
      const enabled = existing?.enabled ?? 1
      upsertStmt.run(
        pluginId,
        item.manifest.name,
        item.manifest.displayName,
        item.manifest.description,
        item.manifest.version,
        item.manifest.sourcePath,
        item.manifest.uiMode,
        enabled,
        orderIndex,
        item.manifestJson,
        JSON.stringify(item.manifest.permissions),
        settingsJson,
        existing?.createdAt || now,
        now,
      )
    }

    db.prepare(`
      UPDATE plugins
      SET is_installed = 0, updated_at = ?
      WHERE plugin_key NOT IN (${scanned.length > 0 ? scanned.map(() => "?").join(", ") : "''"})
    `).run(now, ...scanned.map((item) => item.manifest.name))
  })

  txn()
  return listPlugins()
}

// 递归扫描 notes：收集文件夹与受支持文件。
function scanNotesTree() {
  const notesPath = getNotesPath()
  const folders = []
  const files = []

  // 深度优先扫描：保证父目录先于子目录处理。
  function walk(currentAbsPath, relativePath) {
    const entries = fs.readdirSync(currentAbsPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))

    const childFolders = []
    const childFiles = []

    for (const entry of entries) {
      const childAbsPath = path.join(currentAbsPath, entry.name)
      const childRelativePath = relativePath
        ? `${relativePath}/${entry.name}`
        : `notes/${entry.name}`

      if (entry.isDirectory()) {
        childFolders.push(childRelativePath)
        walk(childAbsPath, childRelativePath)
        continue
      }

      if (entry.isFile()) {
        const lower = entry.name.toLowerCase()
        if (isSupportedNoteFileName(lower)) {
          childFiles.push(childRelativePath)
        }
      }
    }

    // 记录当前目录下节点顺序：先目录后文件。
    childFolders.forEach((folderPath, index) => {
      folders.push({ relativePath: folderPath, sortOrder: index })
    })
    childFiles.forEach((filePath, index) => {
      files.push({ relativePath: filePath, sortOrder: childFolders.length + index })
    })
  }

  if (!fs.existsSync(notesPath)) {
    return { folders, files }
  }

  walk(notesPath, "")
  return { folders, files }
}

// 确保首启默认文件：notes 为空时创建 welcome.md。
function ensureDefaultWelcomeFile() {
  const notesPath = getNotesPath()
  fs.mkdirSync(notesPath, { recursive: true })

  const hasAnyNote = fs.readdirSync(notesPath).some((name) => {
    const lower = name.toLowerCase()
    return isSupportedNoteFileName(lower)
  })
  if (hasAnyNote) {
    return
  }

  const welcomePath = path.join(notesPath, "welcome.md")
  const welcomeText = "# Welcome to Hora\n\n这是你的第一篇本地 Markdown 笔记。\n"
  fs.writeFileSync(welcomePath, welcomeText, "utf8")
}

// 全量同步：文件系统 -> SQLite。
function syncVaultToDatabase() {
  const db = getDb()
  const now = new Date().toISOString()

  const { folders, files } = scanNotesTree()
  const alivePaths = new Set()

  const selectByPath = db.prepare(`
    SELECT id, node_type AS nodeType
    FROM note_nodes
    WHERE workspace_id = ? AND file_path = ?
    LIMIT 1
  `)

  const upsertNode = db.prepare(`
    INSERT INTO note_nodes (
      id, workspace_id, parent_id, node_type, title, file_path, file_size, file_hash, sync_status,
      sort_order, is_deleted, created_by, updated_by, created_at, updated_at, content_updated_at, meta_updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'local', ?, 0, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      parent_id = excluded.parent_id,
      node_type = excluded.node_type,
      title = excluded.title,
      file_path = excluded.file_path,
      file_size = excluded.file_size,
      file_hash = excluded.file_hash,
      sort_order = excluded.sort_order,
      is_deleted = 0,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at,
      content_updated_at = excluded.content_updated_at,
      meta_updated_at = excluded.meta_updated_at
  `)

  const txn = db.transaction(() => {
    // 目录先按深度排序：保证父目录一定在子目录前插入，避免 parent_id 外键失败。
    const sortedFolders = [...folders].sort((a, b) => {
      const aDepth = a.relativePath.split("/").length
      const bDepth = b.relativePath.split("/").length
      if (aDepth !== bDepth) {
        return aDepth - bDepth
      }
      return a.relativePath.localeCompare(b.relativePath, "zh-Hans-CN")
    })

    // 目录节点同步：用于构建树。
    for (const folder of sortedFolders) {
      const existing = selectByPath.get(WORKSPACE_ID, folder.relativePath)
      const folderId = existing?.id || buildNodeId("folder", folder.relativePath)

      const parentRelative = path.posix.dirname(folder.relativePath)
      const parentPath = parentRelative === "notes" ? null : parentRelative
      const parentId = parentPath
        ? (selectByPath.get(WORKSPACE_ID, parentPath)?.id || buildNodeId("folder", parentPath))
        : null

      const title = path.posix.basename(folder.relativePath)
      upsertNode.run(
        folderId,
        WORKSPACE_ID,
        parentId,
        "folder",
        title,
        folder.relativePath,
        0,
        null,
        folder.sortOrder,
        LOCAL_OWNER,
        LOCAL_OWNER,
        now,
        now,
        now,
        now,
      )
      alivePaths.add(folder.relativePath)
    }

    // 文件节点同步：正文以 .md 为准，DB 存 metadata。
    for (const file of files) {
      const absPath = toVaultAbsolutePath(file.relativePath)
      const stat = fs.statSync(absPath)
      const hash = sha256File(absPath)

      const existing = selectByPath.get(WORKSPACE_ID, file.relativePath)
      const fileId = existing?.id || buildNodeId("note", file.relativePath)

      const parentRelative = path.posix.dirname(file.relativePath)
      const parentPath = parentRelative === "notes" ? null : parentRelative
      const parentId = parentPath
        ? (selectByPath.get(WORKSPACE_ID, parentPath)?.id || buildNodeId("folder", parentPath))
        : null

      const title = titleFromFileName(path.posix.basename(file.relativePath))
      upsertNode.run(
        fileId,
        WORKSPACE_ID,
        parentId,
        "file",
        title,
        file.relativePath,
        stat.size,
        hash,
        file.sortOrder,
        LOCAL_OWNER,
        LOCAL_OWNER,
        now,
        now,
        now,
        now,
      )
      alivePaths.add(file.relativePath)
    }

    // 逻辑删除：DB 有但文件系统已不存在。
    const rows = db.prepare(`
      SELECT id, file_path AS filePath
      FROM note_nodes
      WHERE workspace_id = ?
        AND is_deleted = 0
        AND file_path IS NOT NULL
        AND (file_path = 'notes' OR file_path LIKE 'notes/%')
    `).all(WORKSPACE_ID)

    const markDeleted = db.prepare(`
      UPDATE note_nodes
      SET is_deleted = 1, updated_by = ?, updated_at = ?, meta_updated_at = ?
      WHERE id = ?
    `)

    for (const row of rows) {
      if (!alivePaths.has(row.filePath)) {
        markDeleted.run(LOCAL_OWNER, now, now, row.id)
      }
    }
  })

  txn()
}

// 初始化数据库：首启建库 + 默认文件 + 全量同步。
function initDatabase() {
  const dbPath = getDbPath()
  const sqlPath = resolveSqlPath()

  const isFirstInit = !fs.existsSync(dbPath)
  space.ensureSpaceLayout(getHoraDataPath())
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  fs.mkdirSync(getVaultPath(), { recursive: true })
  fs.mkdirSync(getNotesPath(), { recursive: true })

  const db = new Database(dbPath)
  db.pragma("journal_mode = DELETE")

  if (isFirstInit) {
    const initSql = fs.readFileSync(sqlPath, "utf8")
    db.exec(initSql)
  }

  ensureNoteSchema(db)
  ensureProjectSchema(db)
  ensurePluginSchema(db)
  ensureDefaultWelcomeFile()

  return db
}

// 懒加载 DB 实例：首次调用时触发同步。
function getDb() {
  if (dbInstance) return dbInstance
  dbInstance = initDatabase()
  syncVaultToDatabase()
  syncPluginsFromFilesystem(dbInstance)
  return dbInstance
}

// 对外：查询项目列表。
function listProjects() {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT
      id,
      title,
      description,
      status,
      priority,
      color,
      sort_order AS sortOrder,
      started_at AS startedAt,
      due_at AS dueAt,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM projects
    WHERE workspace_id = ? AND is_deleted = 0
    ORDER BY sort_order ASC, updated_at DESC
  `)
  return stmt.all(WORKSPACE_ID)
}

// 对外：创建项目。
function createProject(input) {
  const db = getDb()
  const id = buildEntityId("proj")
  const now = new Date().toISOString()
  const sortStmt = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort
    FROM projects
    WHERE workspace_id = ? AND is_deleted = 0
  `)
  const { nextSort } = sortStmt.get(WORKSPACE_ID)
  const insertStmt = db.prepare(`
    INSERT INTO projects (
      id, workspace_id, title, description, status, priority, color, sort_order,
      started_at, due_at, completed_at, is_deleted, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `)
  const status = input.status || "active"
  const priority = input.priority || "normal"
  insertStmt.run(
    id,
    WORKSPACE_ID,
    input.title,
    input.description || null,
    status,
    priority,
    input.color || null,
    nextSort,
    input.startedAt || null,
    input.dueAt || null,
    status === "done" ? now : null,
    LOCAL_OWNER,
    LOCAL_OWNER,
    now,
    now,
  )
  return getProjectById(id)
}

// 对外：更新项目元信息。
function updateProject(input) {
  const db = getDb()
  const current = getProjectById(input.id)
  if (!current) throw new Error("项目不存在")

  const now = new Date().toISOString()
  const nextStatus = input.status ?? current.status
  const stmt = db.prepare(`
    UPDATE projects
    SET title = ?, description = ?, status = ?, priority = ?, color = ?,
        started_at = ?, due_at = ?, completed_at = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND is_deleted = 0
  `)
  stmt.run(
    input.title ?? current.title,
    input.description ?? current.description,
    nextStatus,
    input.priority ?? current.priority,
    input.color ?? current.color,
    input.startedAt ?? current.startedAt,
    input.dueAt ?? current.dueAt,
    nextStatus === "done" ? (current.completedAt || now) : null,
    LOCAL_OWNER,
    now,
    input.id,
  )
  return getProjectById(input.id)
}

// 对外：软删除项目，同时隐藏其需求与任务。
function deleteProject(projectId) {
  const db = getDb()
  const now = new Date().toISOString()
  const txn = db.transaction(() => {
    db.prepare("UPDATE projects SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?")
      .run(LOCAL_OWNER, now, projectId)
    db.prepare("UPDATE requirements SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE project_id = ?")
      .run(LOCAL_OWNER, now, projectId)
    db.prepare("UPDATE tasks SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE project_id = ?")
      .run(LOCAL_OWNER, now, projectId)
  })
  txn()
  return true
}

// 对外：调整项目排序。
function reorderProjects(input) {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE projects
    SET sort_order = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND workspace_id = ? AND is_deleted = 0
  `)
  const txn = db.transaction(() => {
    for (const item of input.items || []) {
      stmt.run(item.sortOrder, LOCAL_OWNER, now, item.id, WORKSPACE_ID)
    }
  })
  txn()
  return true
}

// 对外：按项目查询需求。
function listRequirementsByProject(projectId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT
      id,
      project_id AS projectId,
      title,
      description,
      status,
      priority,
      color,
      sort_order AS sortOrder,
      due_at AS dueAt,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM requirements
    WHERE project_id = ? AND is_deleted = 0
    ORDER BY sort_order ASC, updated_at DESC
  `)
  return stmt.all(projectId)
}

// 对外：创建需求。
function createRequirement(input) {
  const db = getDb()
  const id = buildEntityId("req")
  const now = new Date().toISOString()
  const sortStmt = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort
    FROM requirements
    WHERE project_id = ? AND is_deleted = 0
  `)
  const { nextSort } = sortStmt.get(input.projectId)
  const insertStmt = db.prepare(`
    INSERT INTO requirements (
      id, project_id, title, description, status, priority, color, sort_order,
      due_at, completed_at, is_deleted, created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
  `)
  const status = input.status || "todo"
  insertStmt.run(
    id,
    input.projectId,
    input.title,
    input.description || null,
    status,
    input.priority || "normal",
    input.color || null,
    nextSort,
    input.dueAt || null,
    status === "done" ? now : null,
    LOCAL_OWNER,
    LOCAL_OWNER,
    now,
    now,
  )
  return listRequirementsByProject(input.projectId).find((row) => row.id === id) || null
}

// 对外：更新需求元信息。
function updateRequirement(input) {
  const db = getDb()
  const current = db.prepare(`
    SELECT
      id,
      project_id AS projectId,
      title,
      description,
      status,
      priority,
      color,
      sort_order AS sortOrder,
      due_at AS dueAt,
      completed_at AS completedAt
    FROM requirements
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)
  if (!current) throw new Error("需求不存在")

  const now = new Date().toISOString()
  const nextStatus = input.status ?? current.status
  const stmt = db.prepare(`
    UPDATE requirements
    SET title = ?, description = ?, status = ?, priority = ?, color = ?,
        due_at = ?, completed_at = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND is_deleted = 0
  `)
  stmt.run(
    input.title ?? current.title,
    input.description ?? current.description,
    nextStatus,
    input.priority ?? current.priority,
    input.color ?? current.color,
    input.dueAt ?? current.dueAt,
    nextStatus === "done" ? (current.completedAt || now) : null,
    LOCAL_OWNER,
    now,
    input.id,
  )
  return listRequirementsByProject(current.projectId).find((row) => row.id === input.id) || null
}

// 对外：软删除需求，同时软删除该需求下的任务，保持层级删除语义一致。
function deleteRequirement(requirementId) {
  const db = getDb()
  const now = new Date().toISOString()
  const txn = db.transaction(() => {
    db.prepare("UPDATE requirements SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?")
      .run(LOCAL_OWNER, now, requirementId)
    db.prepare("UPDATE tasks SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE requirement_id = ?")
      .run(LOCAL_OWNER, now, requirementId)
  })
  txn()
  return true
}

// 对外：调整需求排序。
function reorderRequirements(input) {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE requirements
    SET sort_order = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND is_deleted = 0
  `)
  const txn = db.transaction(() => {
    for (const item of input.items || []) {
      stmt.run(item.sortOrder, LOCAL_OWNER, now, item.id, input.projectId)
    }
  })
  txn()
  return true
}

// 对外：按项目查询任务。
function listTasksByProject(projectId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT
      t.id,
      t.project_id AS projectId,
      t.requirement_id AS requirementId,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.color,
      t.is_completed AS isCompleted,
      t.sort_order AS sortOrder,
      t.due_at AS dueAt,
      t.started_at AS startedAt,
      t.completed_at AS completedAt,
      t.updated_at AS updatedAt,
      p.title AS projectTitle,
      r.title AS requirementTitle
    FROM tasks t
    JOIN projects p ON p.id = t.project_id AND p.is_deleted = 0
    LEFT JOIN requirements r ON r.id = t.requirement_id AND r.is_deleted = 0
    WHERE t.project_id = ? AND t.is_deleted = 0
    ORDER BY t.sort_order ASC, t.updated_at DESC
  `)
  return stmt.all(projectId)
}

// 对外：跨项目查询任务，供全局 Tasks 页面筛选。
function listAllTasks(filters = {}) {
  const db = getDb()
  const conditions = ["t.is_deleted = 0", "p.is_deleted = 0"]
  const params = []

  if (filters.projectId) {
    conditions.push("t.project_id = ?")
    params.push(filters.projectId)
  }
  if (filters.requirementId) {
    conditions.push("t.requirement_id = ?")
    params.push(filters.requirementId)
  }
  if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
    conditions.push(`t.status IN (${filters.statuses.map(() => "?").join(", ")})`)
    params.push(...filters.statuses)
  } else if (filters.status) {
    conditions.push("t.status = ?")
    params.push(filters.status)
  }
  if (filters.priority) {
    conditions.push("t.priority = ?")
    params.push(filters.priority)
  }
  if (filters.dueAtFrom && filters.dueAtTo) {
    conditions.push("t.due_at BETWEEN ? AND ?")
    params.push(filters.dueAtFrom, filters.dueAtTo)
  } else if (filters.dueAtFrom) {
    conditions.push("t.due_at = ?")
    params.push(filters.dueAtFrom)
  } else if (filters.dueAt) {
    conditions.push("t.due_at = ?")
    params.push(filters.dueAt)
  }
  if (filters.isCompleted !== undefined && filters.isCompleted !== null && filters.isCompleted !== "") {
    conditions.push("t.is_completed = ?")
    params.push(filters.isCompleted ? 1 : 0)
  }

  const stmt = db.prepare(`
    SELECT
      t.id,
      t.project_id AS projectId,
      t.requirement_id AS requirementId,
      t.title,
      t.description,
      t.status,
      t.priority,
      t.color,
      t.is_completed AS isCompleted,
      t.sort_order AS sortOrder,
      t.due_at AS dueAt,
      t.started_at AS startedAt,
      t.completed_at AS completedAt,
      t.updated_at AS updatedAt,
      p.title AS projectTitle,
      r.title AS requirementTitle
    FROM tasks t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN requirements r ON r.id = t.requirement_id AND r.is_deleted = 0
    WHERE ${conditions.join(" AND ")}
    ORDER BY t.due_at IS NULL ASC, t.due_at ASC, t.updated_at DESC
  `)
  return stmt.all(...params)
}

// 对外：创建任务，requirement_id 允许为空。
function createTask(input) {
  const db = getDb()
  const id = buildEntityId("task")
  const now = new Date().toISOString()
  const sortStmt = db.prepare(`
    SELECT COALESCE(MAX(sort_order), -1) + 1 AS nextSort
    FROM tasks
    WHERE project_id = ? AND is_deleted = 0
  `)
  const { nextSort } = sortStmt.get(input.projectId)
  const status = input.status || (input.isCompleted ? "done" : "todo")
  const isCompleted = input.isCompleted || status === "done" ? 1 : 0

  const insertStmt = db.prepare(`
    INSERT INTO tasks (
      id, project_id, requirement_id, title, description, status, priority, color,
      is_completed, is_deleted, sort_order, due_at, started_at, completed_at,
      created_by, updated_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  insertStmt.run(
    id,
    input.projectId,
    input.requirementId || null,
    input.title,
    input.description || null,
    status,
    input.priority || "normal",
    input.color || null,
    isCompleted,
    nextSort,
    input.dueAt || null,
    input.startedAt || null,
    isCompleted ? now : null,
    LOCAL_OWNER,
    LOCAL_OWNER,
    now,
    now,
  )
  return listTasksByProject(input.projectId).find((row) => row.id === id) || null
}

// 对外：更新任务元信息。
function updateTask(input) {
  const db = getDb()
  const current = db.prepare(`
    SELECT
      id,
      project_id AS projectId,
      requirement_id AS requirementId,
      title,
      description,
      status,
      priority,
      color,
      is_completed AS isCompleted,
      due_at AS dueAt,
      started_at AS startedAt,
      completed_at AS completedAt
    FROM tasks
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)
  if (!current) throw new Error("任务不存在")

  const now = new Date().toISOString()
  const nextStatus = input.status ?? current.status
  const nextCompleted = input.isCompleted !== undefined
    ? (input.isCompleted ? 1 : 0)
    : (nextStatus === "done" ? 1 : current.isCompleted)
  const stmt = db.prepare(`
    UPDATE tasks
    SET project_id = ?, requirement_id = ?, title = ?, description = ?, status = ?,
        priority = ?, color = ?, is_completed = ?, due_at = ?, started_at = ?,
        completed_at = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND is_deleted = 0
  `)
  stmt.run(
    input.projectId ?? current.projectId,
    input.requirementId === undefined ? current.requirementId : (input.requirementId || null),
    input.title ?? current.title,
    input.description ?? current.description,
    nextStatus,
    input.priority ?? current.priority,
    input.color ?? current.color,
    nextCompleted,
    input.dueAt ?? current.dueAt,
    input.startedAt ?? current.startedAt,
    nextCompleted ? (current.completedAt || now) : null,
    LOCAL_OWNER,
    now,
    input.id,
  )
  return listTasksByProject(input.projectId ?? current.projectId).find((row) => row.id === input.id) || null
}

// 对外：快速更新任务状态和勾选完成。
function updateTaskStatus(input) {
  const nextStatus = input.status || (input.done ? "done" : "todo")
  return updateTask({
    id: input.id,
    status: nextStatus,
    isCompleted: input.done !== undefined ? input.done : nextStatus === "done",
  })
}

// 对外：软删除任务。
function deleteTask(taskId) {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare("UPDATE tasks SET is_deleted = 1, updated_by = ?, updated_at = ? WHERE id = ?")
    .run(LOCAL_OWNER, now, taskId)
  return true
}

// 对外：调整任务排序。
function reorderTasks(input) {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE tasks
    SET sort_order = ?, updated_by = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND is_deleted = 0
  `)
  const txn = db.transaction(() => {
    for (const item of input.items || []) {
      stmt.run(item.sortOrder, LOCAL_OWNER, now, item.id, input.projectId)
    }
  })
  txn()
  return true
}

// 把数据库行转成前端可直接使用的插件记录。
function hydratePluginRow(row) {
  if (!row) return null

  let manifest = null
  try {
    manifest = JSON.parse(row.manifestJson || "{}")
  } catch {
    manifest = {}
  }

  const normalizedManifest = normalizePluginManifest(
    manifest,
    row.pluginKey,
    row.sourcePath,
    row.orderIndex,
  )

  return {
    id: row.id,
    pluginKey: row.pluginKey,
    displayName: row.displayName,
    description: row.description,
    version: row.version,
    sourcePath: row.sourcePath,
    sourceType: row.sourceType,
    uiMode: row.uiMode,
    enabled: row.enabled,
    isInstalled: row.isInstalled,
    orderIndex: row.orderIndex,
    manifestJson: row.manifestJson,
    permissionsJson: row.permissionsJson,
    settingsJson: row.settingsJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    manifest: normalizedManifest,
  }
}

// 对外：查询全部插件清单。
function listPlugins() {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      id,
      plugin_key AS pluginKey,
      display_name AS displayName,
      description,
      version,
      source_path AS sourcePath,
      source_type AS sourceType,
      ui_mode AS uiMode,
      enabled,
      is_installed AS isInstalled,
      order_index AS orderIndex,
      manifest_json AS manifestJson,
      permissions_json AS permissionsJson,
      settings_json AS settingsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM plugins
    ORDER BY is_installed DESC, enabled DESC, order_index ASC, updated_at DESC
  `).all()
  return rows.map((row) => hydratePluginRow(row))
}

// 对外：按 pluginKey 获取单个插件。
function getPluginByKey(pluginKey) {
  const db = getDb()
  const row = db.prepare(`
    SELECT
      id,
      plugin_key AS pluginKey,
      display_name AS displayName,
      description,
      version,
      source_path AS sourcePath,
      source_type AS sourceType,
      ui_mode AS uiMode,
      enabled,
      is_installed AS isInstalled,
      order_index AS orderIndex,
      manifest_json AS manifestJson,
      permissions_json AS permissionsJson,
      settings_json AS settingsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM plugins
    WHERE plugin_key = ?
    LIMIT 1
  `).get(pluginKey)
  return hydratePluginRow(row)
}

// 对外：刷新插件目录并重新同步数据库。
function refreshPlugins() {
  syncPluginsFromFilesystem(getDb())
  return listPlugins()
}

// 对外：更新插件的展示信息和模式。
function updatePlugin(input) {
  const db = getDb()
  const current = getPluginByKey(input.pluginKey)
  if (!current) throw new Error("插件不存在")

  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE plugins
    SET display_name = ?, description = ?, version = ?, ui_mode = ?, updated_at = ?
    WHERE plugin_key = ?
  `)
  stmt.run(
    input.displayName ?? current.displayName,
    input.description ?? current.description,
    input.version ?? current.version,
    PLUGIN_UI_MODES.has(input.uiMode) ? input.uiMode : current.uiMode,
    now,
    input.pluginKey,
  )

  if (typeof input.settingsJson === "string") {
    db.prepare(`
      UPDATE plugins
      SET settings_json = ?, updated_at = ?
      WHERE plugin_key = ?
    `).run(input.settingsJson, now, input.pluginKey)
  }

  return getPluginByKey(input.pluginKey)
}

// 对外：切换插件启用状态。
function setPluginEnabled(pluginKey, enabled) {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE plugins
    SET enabled = ?, updated_at = ?
    WHERE plugin_key = ?
  `).run(enabled ? 1 : 0, now, pluginKey)
  return getPluginByKey(pluginKey)
}

// 对外：按顺序重排插件。
function reorderPlugins(input) {
  const db = getDb()
  const now = new Date().toISOString()
  const stmt = db.prepare(`
    UPDATE plugins
    SET order_index = ?, updated_at = ?
    WHERE plugin_key = ?
  `)
  const txn = db.transaction(() => {
    for (const item of input.items || []) {
      stmt.run(item.orderIndex, now, item.pluginKey)
    }
  })
  txn()
  return true
}

// 对外：只更新插件设置 JSON。
function updatePluginSettings(input) {
  const db = getDb()
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE plugins
    SET settings_json = ?, updated_at = ?
    WHERE plugin_key = ?
  `).run(input.settingsJson, now, input.pluginKey)
  return getPluginByKey(input.pluginKey)
}

// 对外：按 ID 获取项目。
function getProjectById(projectId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT
      id,
      title,
      description,
      status,
      priority,
      color,
      sort_order AS sortOrder,
      started_at AS startedAt,
      due_at AS dueAt,
      completed_at AS completedAt,
      updated_at AS updatedAt
    FROM projects
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `)
  return stmt.get(projectId) || null
}

// 查询关联笔记基础字段：仅返回未删除文件节点，不读取 Markdown 正文。
function selectLinkedNotes(sql, ...params) {
  const db = getDb()
  return db.prepare(sql).all(...params)
}

// 对外：查询项目关联笔记，包含项目/需求/任务三类关联。
function listNotesByProject(projectId) {
  return selectLinkedNotes(`
    SELECT DISTINCT
      n.id,
      n.title,
      n.file_path AS filePath,
      n.updated_at AS updatedAt
    FROM note_nodes n
    WHERE n.node_type = 'file'
      AND n.is_deleted = 0
      AND (
        EXISTS (
          SELECT 1 FROM note_project_links l
          WHERE l.note_id = n.id AND l.project_id = ?
        )
        OR EXISTS (
          SELECT 1
          FROM note_requirement_links l
          JOIN requirements r ON r.id = l.requirement_id
          WHERE l.note_id = n.id AND r.project_id = ? AND r.is_deleted = 0
        )
        OR EXISTS (
          SELECT 1
          FROM note_task_links l
          JOIN tasks t ON t.id = l.task_id
          WHERE l.note_id = n.id AND t.project_id = ? AND t.is_deleted = 0
        )
      )
    ORDER BY n.updated_at DESC
  `, projectId, projectId, projectId)
}

// 对外：查询需求关联笔记。
function listNotesByRequirement(requirementId) {
  return selectLinkedNotes(`
    SELECT n.id, n.title, n.file_path AS filePath, n.updated_at AS updatedAt
    FROM note_requirement_links l
    JOIN note_nodes n ON n.id = l.note_id
    WHERE l.requirement_id = ? AND n.node_type = 'file' AND n.is_deleted = 0
    ORDER BY n.updated_at DESC
  `, requirementId)
}

// 对外：查询任务关联笔记。
function listNotesByTask(taskId) {
  return selectLinkedNotes(`
    SELECT n.id, n.title, n.file_path AS filePath, n.updated_at AS updatedAt
    FROM note_task_links l
    JOIN note_nodes n ON n.id = l.note_id
    WHERE l.task_id = ? AND n.node_type = 'file' AND n.is_deleted = 0
    ORDER BY n.updated_at DESC
  `, taskId)
}

// 校验关联笔记：只允许关联文件节点。
function ensureNoteFile(noteId) {
  const note = getNoteById(noteId)
  if (!note || note.nodeType !== "file") {
    throw new Error("只能关联文件笔记")
  }
}

// 对外：关联/取消关联笔记与项目。
function linkNoteToProject(noteId, projectId) {
  ensureNoteFile(noteId)
  getDb().prepare("INSERT OR IGNORE INTO note_project_links (note_id, project_id) VALUES (?, ?)")
    .run(noteId, projectId)
  return true
}

function unlinkNoteFromProject(noteId, projectId) {
  getDb().prepare("DELETE FROM note_project_links WHERE note_id = ? AND project_id = ?")
    .run(noteId, projectId)
  return true
}

// 对外：关联/取消关联笔记与需求。
function linkNoteToRequirement(noteId, requirementId) {
  ensureNoteFile(noteId)
  getDb().prepare("INSERT OR IGNORE INTO note_requirement_links (note_id, requirement_id) VALUES (?, ?)")
    .run(noteId, requirementId)
  return true
}

function unlinkNoteFromRequirement(noteId, requirementId) {
  getDb().prepare("DELETE FROM note_requirement_links WHERE note_id = ? AND requirement_id = ?")
    .run(noteId, requirementId)
  return true
}

// 对外：关联/取消关联笔记与任务。
function linkNoteToTask(noteId, taskId) {
  ensureNoteFile(noteId)
  getDb().prepare("INSERT OR IGNORE INTO note_task_links (note_id, task_id) VALUES (?, ?)")
    .run(noteId, taskId)
  return true
}

function unlinkNoteFromTask(noteId, taskId) {
  getDb().prepare("DELETE FROM note_task_links WHERE note_id = ? AND task_id = ?")
    .run(noteId, taskId)
  return true
}

// 对外：列出笔记节点（侧边栏树）。
function listNoteNodes() {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, parent_id AS parentId, node_type AS nodeType, title, sort_order AS sortOrder, file_path AS filePath
    FROM note_nodes
    WHERE workspace_id = ? AND is_deleted = 0
      AND file_path IS NOT NULL
      AND (file_path = 'notes' OR file_path LIKE 'notes/%')
    ORDER BY parent_id ASC, sort_order ASC, title ASC
  `)
  return stmt.all(WORKSPACE_ID)
}

// 对外：按 ID 获取笔记。
function getNoteById(noteId) {
  const db = getDb()
  const stmt = db.prepare(`
    SELECT id, title, node_type AS nodeType, file_path AS filePath, updated_at AS updatedAt
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `)
  return stmt.get(noteId) || null
}

// 对外：读取可文本化的正文；PDF/Word/Excel 等二进制文件必须走系统默认应用。
function readNoteContent(noteId) {
  const note = getNoteById(noteId)
  if (!note || note.nodeType !== "file" || !note.filePath) return ""
  if (!isTextReadableNoteFileName(note.filePath)) {
    throw new Error("该文件类型不支持在编辑器中直接读取")
  }

  const targetPath = toVaultAbsolutePath(note.filePath)
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
    fs.writeFileSync(targetPath, "", "utf8")
  }
  return fs.readFileSync(targetPath, "utf8")
}

// 对外：保存文本正文，只允许 Markdown/文本/绘图 JSON 容器走 UTF-8 写入。
function saveNoteContent(input) {
  const db = getDb()
  const note = getNoteById(input.noteId)
  if (!note || note.nodeType !== "file" || !note.filePath) throw new Error("目标笔记不存在或不是文件")
  if (!isTextReadableNoteFileName(note.filePath)) {
    throw new Error("该文件类型不支持在编辑器中直接保存")
  }

  const now = new Date().toISOString()
  const targetPath = toVaultAbsolutePath(note.filePath)
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, input.content, "utf8")

  const stats = fs.statSync(targetPath)
  const hash = sha256(input.content)

  const stmt = db.prepare(`
    UPDATE note_nodes
    SET file_size = ?, file_hash = ?, sync_status = 'local', updated_by = ?, updated_at = ?, content_updated_at = ?, meta_updated_at = COALESCE(meta_updated_at, ?)
    WHERE id = ?
  `)
  stmt.run(stats.size, hash, LOCAL_OWNER, now, now, now, note.id)

  return { id: note.id, filePath: note.filePath, fileSize: stats.size, fileHash: hash, updatedAt: now }
}

// 标准化标题：用于文件名/目录名生成。
function normalizeNodeName(rawName) {
  const base = String(rawName || "").trim()
  if (!base) return "untitled"
  return base.replace(/[\\/:*?"<>|]/g, "_")
}

// 生成唯一相对路径：避免同目录重名冲突。
function buildUniqueChildPath(parentRelativePath, targetName, isFile, fileExt = ".md") {
  const parentAbsPath = parentRelativePath
    ? toVaultAbsolutePath(parentRelativePath)
    : getNotesPath()
  const ext = isFile ? fileExt : ""
  // 目标名允许用户带后缀输入，这里统一去掉已知后缀后再追加保留后缀。
  const normalized = stripSupportedFileSuffix(normalizeNodeName(targetName))

  let seq = 0
  while (true) {
    const suffix = seq === 0 ? "" : `-${seq}`
    const nextName = `${normalized}${suffix}${ext}`
    const nextAbsPath = path.join(parentAbsPath, nextName)
    if (!fs.existsSync(nextAbsPath)) {
      const nextRelativePath = parentRelativePath
        ? `${parentRelativePath}/${nextName}`
        : `notes/${nextName}`
      return nextRelativePath
    }
    seq += 1
  }
}

// 新建节点：文件支持 .md/.excalidraw.md；目录创建文件夹。
function createNoteNode(input) {
  const db = getDb()
  const parentId = input.parentId || null
  const nodeType = input.nodeType === "folder" ? "folder" : "file"
  const title = normalizeNodeName(input.title || (nodeType === "folder" ? "新建文件夹" : "新建文件"))
  // 文件类型：默认 markdown，可选 drawing。
  const fileExt = input.fileKind === "drawing" ? ".excalidraw.md" : ".md"

  let parentRelativePath = null
  if (parentId) {
    const parent = db.prepare(`
      SELECT id, node_type AS nodeType, file_path AS filePath
      FROM note_nodes
      WHERE id = ? AND is_deleted = 0
      LIMIT 1
    `).get(parentId)
    if (!parent || parent.nodeType !== "folder") {
      throw new Error("父目录不存在或不是文件夹")
    }
    parentRelativePath = parent.filePath
  }

  const nextRelativePath = buildUniqueChildPath(parentRelativePath, title, nodeType === "file", fileExt)
  const nextAbsPath = toVaultAbsolutePath(nextRelativePath)

  if (nodeType === "folder") {
    fs.mkdirSync(nextAbsPath, { recursive: true })
  } else {
    fs.mkdirSync(path.dirname(nextAbsPath), { recursive: true })
    fs.writeFileSync(nextAbsPath, "", "utf8")
  }

  syncVaultToDatabase()

  const created = db.prepare(`
    SELECT id, parent_id AS parentId, node_type AS nodeType, title, file_path AS filePath
    FROM note_nodes
    WHERE workspace_id = ? AND file_path = ? AND is_deleted = 0
    LIMIT 1
  `).get(WORKSPACE_ID, nextRelativePath)

  return created || null
}

// 重命名节点：文件保留原始扩展名，目录重命名文件夹。
function renameNoteNode(input) {
  const db = getDb()
  const node = db.prepare(`
    SELECT id, parent_id AS parentId, node_type AS nodeType, file_path AS filePath
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)

  if (!node || !node.filePath) {
    throw new Error("节点不存在")
  }

  const oldAbsPath = toVaultAbsolutePath(node.filePath)
  const parentRelativePath = path.posix.dirname(node.filePath) === "notes"
    ? null
    : path.posix.dirname(node.filePath)
  const oldExt = node.nodeType === "file" ? getFileSuffixFromPath(node.filePath || "") : ""
  const nextRelativePath = buildUniqueChildPath(
    parentRelativePath,
    normalizeNodeName(input.title || "untitled"),
    node.nodeType === "file",
    oldExt,
  )
  const nextAbsPath = toVaultAbsolutePath(nextRelativePath)

  fs.mkdirSync(path.dirname(nextAbsPath), { recursive: true })
  fs.renameSync(oldAbsPath, nextAbsPath)

  syncVaultToDatabase()
  return true
}

// 删除节点：文件删除文件，目录递归删除。
function deleteNoteNode(input) {
  const db = getDb()
  const node = db.prepare(`
    SELECT id, node_type AS nodeType, file_path AS filePath
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)

  if (!node || !node.filePath) {
    throw new Error("节点不存在")
  }

  const targetAbsPath = toVaultAbsolutePath(node.filePath)
  if (fs.existsSync(targetAbsPath)) {
    if (node.nodeType === "folder") {
      fs.rmSync(targetAbsPath, { recursive: true, force: true })
    } else {
      fs.unlinkSync(targetAbsPath)
    }
  }

  syncVaultToDatabase()
  return true
}

// 移动节点：文件和目录都通过真实文件系统移动，再同步回数据库。
function moveNoteNode(input) {
  const db = getDb()
  const node = db.prepare(`
    SELECT id, node_type AS nodeType, title, file_path AS filePath
    FROM note_nodes
    WHERE id = ? AND is_deleted = 0
    LIMIT 1
  `).get(input.id)

  if (!node || !node.filePath) {
    throw new Error("节点不存在")
  }

  const targetParentId = input.parentId || null
  let targetParentPath = null
  if (targetParentId) {
    const parent = db.prepare(`
      SELECT id, node_type AS nodeType, file_path AS filePath
      FROM note_nodes
      WHERE id = ? AND is_deleted = 0
      LIMIT 1
    `).get(targetParentId)
    if (!parent || parent.nodeType !== "folder" || !parent.filePath) {
      throw new Error("目标目录不存在或不是文件夹")
    }
    if (parent.id === node.id || parent.filePath.startsWith(`${node.filePath}/`)) {
      throw new Error("不能移动到自身或子目录中")
    }
    targetParentPath = parent.filePath
  }

  const oldAbsPath = toVaultAbsolutePath(node.filePath)
  if (!fs.existsSync(oldAbsPath)) {
    throw new Error("源文件不存在")
  }

  // 文件移动时保留原始扩展名；目录移动时保留目录名。
  const fileExt = node.nodeType === "file" ? getFileSuffixFromPath(node.filePath || "") : ""
  const baseName = stripSupportedFileSuffix(path.posix.basename(node.filePath))
  const nextRelativePath = buildUniqueChildPath(targetParentPath, baseName, node.nodeType === "file", fileExt)
  const nextAbsPath = toVaultAbsolutePath(nextRelativePath)

  fs.mkdirSync(path.dirname(nextAbsPath), { recursive: true })
  fs.renameSync(oldAbsPath, nextAbsPath)

  syncVaultToDatabase()
  return true
}

// 文件变更处理：将 chokidar 事件收敛到一次同步。
function handleFsChanged(onNotesChanged) {
  try {
    syncVaultToDatabase()
    if (onNotesChanged) onNotesChanged()
  } catch (error) {
    console.error("[hora] syncVaultToDatabase failed:", error)
  }
}

// 启动实时监听：监听 notes 目录变更并通知前端。
function startNotesWatcher(onNotesChanged) {
  if (notesWatcher) {
    return notesWatcher
  }

  const notesPath = getNotesPath()
  fs.mkdirSync(notesPath, { recursive: true })

  notesWatcher = chokidar.watch(notesPath, {
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  })

  // add：新增受支持文件。
  notesWatcher.on("add", (filePath) => {
    const lower = filePath.toLowerCase()
    if (!isSupportedNoteFileName(lower)) return
    handleFsChanged(onNotesChanged)
  })

  // unlink：删除受支持文件。
  notesWatcher.on("unlink", (filePath) => {
    const lower = filePath.toLowerCase()
    if (!isSupportedNoteFileName(lower)) return
    handleFsChanged(onNotesChanged)
  })

  // change：文件内容变化。
  notesWatcher.on("change", (filePath) => {
    const lower = filePath.toLowerCase()
    if (!isSupportedNoteFileName(lower)) return
    handleFsChanged(onNotesChanged)
  })

  // addDir：新增文件夹。
  notesWatcher.on("addDir", () => {
    handleFsChanged(onNotesChanged)
  })

  // unlinkDir：删除文件夹。
  notesWatcher.on("unlinkDir", () => {
    handleFsChanged(onNotesChanged)
  })

  return notesWatcher
}

module.exports = {
  getHoraDataPath,
  getVaultPath,
  getNotesPath,
  getPluginsRootPath,
  resetRuntime,
  syncVaultToDatabase,
  startNotesWatcher,
  listProjects,
  createProject,
  updateProject,
  deleteProject,
  reorderProjects,
  listRequirementsByProject,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  reorderRequirements,
  listTasksByProject,
  listAllTasks,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  reorderTasks,
  listPlugins,
  getPluginByKey,
  refreshPlugins,
  updatePlugin,
  setPluginEnabled,
  reorderPlugins,
  updatePluginSettings,
  importPluginPackage,
  listNotesByProject,
  listNotesByRequirement,
  listNotesByTask,
  linkNoteToProject,
  unlinkNoteFromProject,
  linkNoteToRequirement,
  unlinkNoteFromRequirement,
  linkNoteToTask,
  unlinkNoteFromTask,
  getProjectById,
  listNoteNodes,
  getNoteById,
  readNoteContent,
  saveNoteContent,
  createNoteNode,
  renameNoteNode,
  deleteNoteNode,
  moveNoteNode,
}
