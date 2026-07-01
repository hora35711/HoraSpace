// 空间注册模块：负责账号级空间清单、当前空间切换与空间级目录管理。
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { app } = require("electron")

let registryCache = null

const SPACE_REGISTRY_VERSION = 1
const DEFAULT_SPACE_ID = "space_default"

// 账号级配置目录：和空间数据目录分离，放全局配置与空间注册表。
function getHoraConfigPath() {
  if (process.platform === "darwin") {
    return path.join(app.getPath("home"), "Library", "hora-notes", "hora-config")
  }
  return path.join(app.getPath("userData"), "hora-config")
}

// 旧版默认数据目录：用于兼容既有用户的数据迁移与默认空间。
function getLegacyDefaultSpacePath() {
  if (process.platform === "darwin") {
    return path.join(app.getPath("home"), "Library", "hora-notes", "hora-data")
  }
  return path.join(app.getPath("userData"), "hora-data")
}

// 空间注册表路径：账号级，只保存空间元数据与当前空间指针。
function getSpaceRegistryPath() {
  return path.join(getHoraConfigPath(), "spaces.json")
}

// 统一生成空间 ID。
function buildSpaceId() {
  return `space_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
}

// 确保目录可用：配置目录是账号级，不会随着空间切换而移动。
function ensureConfigPath() {
  fs.mkdirSync(getHoraConfigPath(), { recursive: true })
}

// 确保空间目录基础结构存在。
function ensureSpaceLayout(spacePath) {
  fs.mkdirSync(spacePath, { recursive: true })
  fs.mkdirSync(path.join(spacePath, "vault", "notes"), { recursive: true })
  fs.mkdirSync(path.join(spacePath, "plugins"), { recursive: true })
}

// 判断空间目录是否已有真实数据。
function hasSpaceData(spacePath) {
  const dbPath = path.join(spacePath, "hora.db")
  const vaultPath = path.join(spacePath, "vault")
  const pluginsPath = path.join(spacePath, "plugins")
  return fs.existsSync(dbPath) || fs.existsSync(vaultPath) || fs.existsSync(pluginsPath)
}

// 标准化空间记录：补齐默认字段并做最小清洗。
function normalizeSpace(space) {
  if (!space || typeof space !== "object") return null

  const id = String(space.id || "").trim()
  const name = String(space.name || "").trim()
  const rootPath = String(space.rootPath || "").trim()
  if (!id || !name || !rootPath) return null

  return {
    id,
    name,
    rootPath,
    createdAt: String(space.createdAt || new Date().toISOString()),
    updatedAt: String(space.updatedAt || new Date().toISOString()),
    lastOpenedAt: space.lastOpenedAt ? String(space.lastOpenedAt) : null,
  }
}

// 标准化注册表。
function normalizeRegistry(raw) {
  const spaces = Array.isArray(raw?.spaces)
    ? raw.spaces.map(normalizeSpace).filter(Boolean)
    : []

  let currentSpaceId = String(raw?.currentSpaceId || "").trim()
  if (!currentSpaceId || !spaces.some((space) => space.id === currentSpaceId)) {
    currentSpaceId = spaces[0]?.id || ""
  }

  return {
    version: SPACE_REGISTRY_VERSION,
    currentSpaceId,
    bootstrapRequired: Boolean(raw?.bootstrapRequired),
    spaces,
  }
}

// 新用户首次启动：先创建一个默认空间记录，方便后续选择/切换。
function buildDefaultRegistry() {
  const defaultRootPath = getLegacyDefaultSpacePath()
  const now = new Date().toISOString()
  ensureSpaceLayout(defaultRootPath)

  return {
    version: SPACE_REGISTRY_VERSION,
    currentSpaceId: DEFAULT_SPACE_ID,
    bootstrapRequired: !hasSpaceData(defaultRootPath),
    spaces: [
      {
        id: DEFAULT_SPACE_ID,
        name: "默认空间",
        rootPath: defaultRootPath,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now,
      },
    ],
  }
}

// 读取注册表：不存在时写入默认注册表。
function loadSpaceRegistry() {
  if (registryCache) return registryCache

  ensureConfigPath()
  const registryPath = getSpaceRegistryPath()
  if (!fs.existsSync(registryPath)) {
    registryCache = buildDefaultRegistry()
    saveSpaceRegistry(registryCache)
    return registryCache
  }

  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, "utf8"))
    registryCache = normalizeRegistry(raw)
  } catch {
    registryCache = buildDefaultRegistry()
    saveSpaceRegistry(registryCache)
  }

  if (!registryCache.currentSpaceId && registryCache.spaces[0]) {
    registryCache.currentSpaceId = registryCache.spaces[0].id
  }

  if (!registryCache.spaces.length) {
    registryCache = buildDefaultRegistry()
    saveSpaceRegistry(registryCache)
  }

  return registryCache
}

// 保存注册表：账号级配置写回全局 config 目录。
function saveSpaceRegistry(registry) {
  ensureConfigPath()
  const normalized = normalizeRegistry(registry)
  fs.writeFileSync(getSpaceRegistryPath(), JSON.stringify(normalized, null, 2), "utf8")
  registryCache = normalized
  return normalized
}

// 刷新缓存：当空间切换或迁移后，前端要读取新状态。
function reloadSpaceRegistry() {
  registryCache = null
  return loadSpaceRegistry()
}

// 当前激活空间。
function getCurrentSpace() {
  const registry = loadSpaceRegistry()
  return registry.spaces.find((space) => space.id === registry.currentSpaceId) || registry.spaces[0] || null
}

// 当前空间的数据根路径。
function getCurrentSpaceRootPath() {
  const currentSpace = getCurrentSpace()
  if (!currentSpace) return getLegacyDefaultSpacePath()
  ensureSpaceLayout(currentSpace.rootPath)
  return currentSpace.rootPath
}

// 当前空间是否需要首次引导。
function needsBootstrap() {
  const registry = loadSpaceRegistry()
  return Boolean(registry.bootstrapRequired)
}

// 当前空间数据是否是第一次打开后的引导状态。
function getSpaceBootstrapState() {
  const registry = loadSpaceRegistry()
  return {
    currentSpace: getCurrentSpace(),
    spaces: registry.spaces,
    bootstrapRequired: registry.bootstrapRequired,
  }
}

// 列出所有空间：设置页和顶部空间切换器都会用到。
function listSpaces() {
  return loadSpaceRegistry().spaces
}

// 创建新空间：name 必填，rootPath 由前端选择的文件夹传入。
function createSpace(input) {
  const name = String(input?.name || "").trim()
  const rootPath = String(input?.rootPath || "").trim()
  if (!name) {
    throw new Error("空间名称不能为空")
  }
  if (!rootPath) {
    throw new Error("空间路径不能为空")
  }

  ensureSpaceLayout(rootPath)
  const registry = loadSpaceRegistry()
  const existing = registry.spaces.find((space) => space.rootPath === rootPath)
  if (existing) {
    return switchSpace(existing.id)
  }

  const now = new Date().toISOString()
  const nextSpace = {
    id: buildSpaceId(),
    name,
    rootPath,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  }

  registry.spaces.push(nextSpace)
  registry.currentSpaceId = nextSpace.id
  registry.bootstrapRequired = false
  saveSpaceRegistry(registry)
  return nextSpace
}

// 切换当前空间：只改账号级注册表，不动空间内容。
function switchSpace(spaceId) {
  const registry = loadSpaceRegistry()
  const nextSpace = registry.spaces.find((space) => space.id === spaceId)
  if (!nextSpace) {
    throw new Error("空间不存在")
  }

  const now = new Date().toISOString()
  registry.currentSpaceId = nextSpace.id
  registry.bootstrapRequired = false
  registry.spaces = registry.spaces.map((space) =>
    space.id === nextSpace.id ? { ...space, lastOpenedAt: now, updatedAt: now } : space,
  )
  saveSpaceRegistry(registry)
  return nextSpace
}

// 重命名空间：只改显示名，不强制改物理路径，避免迁移风险。
function renameSpace(spaceId, name) {
  const nextName = String(name || "").trim()
  if (!nextName) {
    throw new Error("空间名称不能为空")
  }

  const registry = loadSpaceRegistry()
  let changedSpace = null
  const now = new Date().toISOString()
  registry.spaces = registry.spaces.map((space) => {
    if (space.id !== spaceId) return space
    changedSpace = { ...space, name: nextName, updatedAt: now }
    return changedSpace
  })

  if (!changedSpace) {
    throw new Error("空间不存在")
  }

  saveSpaceRegistry(registry)
  return changedSpace
}

// 删除空间：默认只从列表移除，不自动删盘，避免误删用户文件。
function deleteSpace(spaceId) {
  const registry = loadSpaceRegistry()
  const nextSpaces = registry.spaces.filter((space) => space.id !== spaceId)
  if (nextSpaces.length === 0) {
    throw new Error("至少保留一个空间")
  }

  registry.spaces = nextSpaces
  if (registry.currentSpaceId === spaceId) {
    registry.currentSpaceId = nextSpaces[0].id
  }
  saveSpaceRegistry(registry)
  return true
}

// 迁移当前空间到新路径：先复制再删除旧目录，确保数据完整。
function moveCurrentSpaceRootPath(targetRootPath) {
  const currentSpace = getCurrentSpace()
  if (!currentSpace) {
    throw new Error("当前没有可迁移的空间")
  }

  const nextRootPath = String(targetRootPath || "").trim()
  if (!nextRootPath) {
    throw new Error("目标路径不能为空")
  }
  if (path.resolve(nextRootPath) === path.resolve(currentSpace.rootPath)) {
    return currentSpace
  }

  const targetExists = fs.existsSync(nextRootPath)
  if (targetExists && fs.readdirSync(nextRootPath).length > 0) {
    throw new Error("目标路径不为空，请先选择空文件夹")
  }

  const sourceRootPath = currentSpace.rootPath
  ensureSpaceLayout(sourceRootPath)
  fs.mkdirSync(path.dirname(nextRootPath), { recursive: true })
  fs.mkdirSync(nextRootPath, { recursive: true })
  fs.cpSync(sourceRootPath, nextRootPath, { recursive: true, force: true })
  fs.rmSync(sourceRootPath, { recursive: true, force: true })

  const registry = loadSpaceRegistry()
  const now = new Date().toISOString()
  registry.spaces = registry.spaces.map((space) =>
    space.id === currentSpace.id
      ? { ...space, rootPath: nextRootPath, updatedAt: now, lastOpenedAt: now }
      : space,
  )
  saveSpaceRegistry(registry)
  return getCurrentSpace()
}

module.exports = {
  getHoraConfigPath,
  getLegacyDefaultSpacePath,
  getSpaceRegistryPath,
  ensureSpaceLayout,
  loadSpaceRegistry,
  saveSpaceRegistry,
  reloadSpaceRegistry,
  getCurrentSpace,
  getCurrentSpaceRootPath,
  getSpaceBootstrapState,
  needsBootstrap,
  listSpaces,
  createSpace,
  switchSpace,
  renameSpace,
  deleteSpace,
  moveCurrentSpaceRootPath,
}
