"use client"

import * as React from "react"

import {
  getPlugin,
  getPluginRootPath,
  getUpdateSnapshot,
  importPluginPackage,
  listPlugins,
  checkForUpdates,
  openReleasePage,
  refreshPlugins,
  reorderPlugins,
  restartApp,
  setPluginEnabled,
  setUpdateSettings,
  updatePlugin,
  type PluginRecord,
  type PluginUiMode,
  type UpdateSettings,
  type UpdateStatus,
} from "@/lib/hora-db"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ShimmerDemo } from "@/components/ui/shimmer"
import { ArrowDown, ArrowUp, ExternalLink, FolderUp, RefreshCw, Settings2, SlidersHorizontal } from "lucide-react"
import { SpaceDialog } from "@/components/space-dialog"
import { getLanguageOptions, useAppLanguage, useT } from "@/lib/app-language"

import {
  getCurrentSpace,
  getSpaceBootstrapState,
  listSpaces,
  createSpace,
  migrateCurrentSpace,
  type SpaceRecord,
} from "@/lib/hora-db"

type SettingsSection = "general" | "language" | "location" | "repository" | "plugins" | "extensions"

type PluginDraft = {
  pluginKey: string
  displayName: string
  description: string
  version: string
  uiMode: PluginUiMode
  settingsJson: string
}

const DEFAULT_DRAFT: PluginDraft = {
  pluginKey: "",
  displayName: "",
  description: "",
  version: "1.0.0",
  uiMode: "panel",
  settingsJson: "{}",
}

const DEFAULT_UPDATE_SETTINGS: UpdateSettings = {
  enabled: false,
  schedule: "daily",
  dailyHour: 10,
  lastCheckedAt: null,
}

const DEFAULT_UPDATE_STATUS: UpdateStatus = {
  state: "idle",
  currentVersion: "0.0.0",
  update: null,
  error: null,
  checkedAt: null,
}

function formatDateTime(value: string | null) {
  // 设置页仅做轻量展示，非法日期直接显示“暂未记录”。
  if (!value) return "暂未记录"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "暂未记录"
  return date.toLocaleString("zh-CN", { hour12: false })
}

function updateStateLabel(state: UpdateStatus["state"]) {
  const labels: Record<UpdateStatus["state"], string> = {
    idle: "尚未检查",
    checking: "正在检查",
    available: "发现新版本",
    "not-available": "已是最新",
    error: "检查失败",
  }
  return labels[state]
}

function safeParseManifest(raw: string): PluginRecord["manifest"] {
  // 清单解析失败时不阻断页面，直接回退到空结构。
  try {
    return JSON.parse(raw) as PluginRecord["manifest"]
  } catch {
    return {
      name: "",
      displayName: "",
      version: "1.0.0",
      description: null,
      sourcePath: "",
      uiMode: "panel",
      orderIndex: 0,
      permissions: { read: [], write: [] },
      modules: [],
    }
  }
}

function buildOrderUpdate(items: PluginRecord[], movingKey: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.pluginKey === movingKey)
  if (index < 0) return items

  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= items.length) return items

  const next = [...items]
  const [current] = next.splice(index, 1)
  next.splice(targetIndex, 0, current)

  return next.map((item, nextIndex) => ({
    pluginKey: item.pluginKey,
    orderIndex: nextIndex,
  }))
}

function MenuButton({
  active,
  icon,
  label,
  description,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}) {
  // 左侧菜单按钮：用 shadcn 的按钮样式伪装成设置菜单项。
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      className="h-auto w-full justify-start rounded-lg px-3 py-3 text-left"
      onClick={onClick}
    >
      <div className="flex w-full items-start gap-3">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
    </Button>
  )
}

export default function SettingsPage() {
  const t = useT()
  const { language, setLanguage } = useAppLanguage()
  const [section, setSection] = React.useState<SettingsSection>("plugins")
  const [plugins, setPlugins] = React.useState<PluginRecord[]>([])
  const [loading, setLoading] = React.useState(true)
  const [savingKey, setSavingKey] = React.useState<string | null>(null)
  const [editorOpen, setEditorOpen] = React.useState(false)
  const [restartOpen, setRestartOpen] = React.useState(false)
  const [spaceRestartOpen, setSpaceRestartOpen] = React.useState(false)
  const [spaceDialogOpen, setSpaceDialogOpen] = React.useState(false)
  const [spaceDialogMode, setSpaceDialogMode] = React.useState<"create" | "migrate">("create")
  const [currentSpace, setCurrentSpace] = React.useState<SpaceRecord | null>(null)
  const [spaceList, setSpaceList] = React.useState<SpaceRecord[]>([])
  const [storagePath, setStoragePath] = React.useState("")
  const [draft, setDraft] = React.useState<PluginDraft>(DEFAULT_DRAFT)
  const [updateSettings, setUpdateSettingsState] = React.useState<UpdateSettings>(DEFAULT_UPDATE_SETTINGS)
  const [updateStatus, setUpdateStatus] = React.useState<UpdateStatus>(DEFAULT_UPDATE_STATUS)
  const [checkingUpdate, setCheckingUpdate] = React.useState(false)

  const loadPlugins = React.useCallback(async () => {
    setLoading(true)
    try {
      const rows = await listPlugins()
      setPlugins(rows)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadSpaceState = React.useCallback(async () => {
    // 空间信息来自账号级注册表，设置页只展示当前空间并提供迁移入口。
    const [bootstrapState, current, spaces] = await Promise.all([
      getSpaceBootstrapState(),
      getCurrentSpace(),
      listSpaces(),
    ])

    setCurrentSpace(current || bootstrapState.currentSpace)
    setSpaceList(spaces.length > 0 ? spaces : bootstrapState.spaces)
    setSpaceDialogMode("create")
    setSpaceDialogOpen(bootstrapState.bootstrapRequired || !current)
  }, [])

  React.useEffect(() => {
    // 首次进入设置页时同时加载插件列表和插件存放路径。
    void loadPlugins()
    void getPluginRootPath().then((path) => setStoragePath(path))
    void loadSpaceState()
    void getUpdateSnapshot().then((snapshot) => {
      setUpdateSettingsState(snapshot.settings)
      setUpdateStatus(snapshot.status)
    })
  }, [loadPlugins, loadSpaceState])

  React.useEffect(() => {
    // 空间发生切换或迁移时刷新当前空间信息，避免设置页显示旧路径。
    const unsubscribeSpaces = window.horaDB?.onSpacesChanged?.(() => {
      void loadSpaceState()
      void getPluginRootPath().then((path) => setStoragePath(path))
    })
    const unsubscribeUpdates = window.horaDB?.onUpdateStatusChanged?.((status) => {
      setUpdateStatus(status)
      setCheckingUpdate(status.state === "checking")
    })

    return () => {
      unsubscribeSpaces?.()
      unsubscribeUpdates?.()
    }
  }, [loadSpaceState])

  const stats = React.useMemo(() => {
    return {
      total: plugins.length,
      enabled: plugins.filter((item) => item.enabled === 1).length,
      editor: plugins.filter((item) => item.uiMode === "editor").length,
      display: plugins.filter((item) => item.uiMode === "display").length,
      panel: plugins.filter((item) => item.uiMode === "panel").length,
    }
  }, [plugins])

  async function handleRefresh() {
    setSavingKey("refresh")
    try {
      const rows = await refreshPlugins()
      setPlugins(rows)
    } finally {
      setSavingKey(null)
    }
  }

  async function saveUpdateSettings(input: Partial<UpdateSettings>) {
    const next = await setUpdateSettings({ ...updateSettings, ...input })
    setUpdateSettingsState(next)
  }

  async function handleCheckUpdates() {
    setCheckingUpdate(true)
    try {
      const status = await checkForUpdates()
      setUpdateStatus(status)
      const snapshot = await getUpdateSnapshot()
      setUpdateSettingsState(snapshot.settings)
    } finally {
      setCheckingUpdate(false)
    }
  }

  async function handleOpenReleasePage() {
    await openReleasePage(updateStatus.update?.releaseUrl)
  }

  async function handleImportPlugin() {
    setSavingKey("import")
    try {
      const result = await importPluginPackage()
      if (result?.plugins) {
        setPlugins(result.plugins)
      } else {
        await loadPlugins()
      }

      if (result?.restartRecommended) {
        setRestartOpen(true)
      }
    } finally {
      setSavingKey(null)
    }
  }

  async function handleMigrateSpace({ rootPath }: { rootPath: string }) {
    // 迁移当前空间时只接受目标路径，名称沿用现有空间名，避免路径变更时误改结构名。
    await migrateCurrentSpace({ rootPath })
    await loadSpaceState()
    await getPluginRootPath().then((path) => setStoragePath(path))
    setSpaceRestartOpen(true)
  }

  function openCreateSpaceDialog() {
    setSpaceDialogMode("create")
    setSpaceDialogOpen(true)
  }

  function openMigrateSpaceDialog() {
    setSpaceDialogMode("migrate")
    setSpaceDialogOpen(true)
  }

  async function handleSpaceSubmit(input: { name: string; rootPath: string }) {
    // 根据模式区分创建与迁移，避免在迁移场景里误创建新空间记录。
    if (spaceDialogMode === "migrate") {
      await handleMigrateSpace(input)
      return
    }

    await createSpace(input)
    await loadSpaceState()
    await getPluginRootPath().then((path) => setStoragePath(path))
  }

  async function handleToggleEnabled(plugin: PluginRecord) {
    setSavingKey(plugin.pluginKey)
    try {
      const next = await setPluginEnabled(plugin.pluginKey, plugin.enabled !== 1)
      if (!next) return
      setPlugins((current) => current.map((item) => (item.pluginKey === plugin.pluginKey ? next : item)))
    } finally {
      setSavingKey(null)
    }
  }

  async function handleMove(pluginKey: string, direction: -1 | 1) {
    const nextItems = buildOrderUpdate(plugins, pluginKey, direction)
    if (nextItems.length === 0) return

    setSavingKey(pluginKey)
    try {
      await reorderPlugins({ items: nextItems })
      setPlugins((current) => {
        const orderMap = new Map(nextItems.map((item) => [item.pluginKey, item.orderIndex]))
        return [...current]
          .sort((left, right) => (orderMap.get(left.pluginKey) ?? left.orderIndex) - (orderMap.get(right.pluginKey) ?? right.orderIndex))
          .map((item, index) => ({ ...item, orderIndex: index }))
      })
    } finally {
      setSavingKey(null)
    }
  }

  async function openEditor(pluginKey: string) {
    const current = await getPlugin(pluginKey)
    if (!current) return

    setDraft({
      pluginKey: current.pluginKey,
      displayName: current.displayName,
      description: current.description ?? "",
      version: current.version,
      uiMode: current.uiMode,
      settingsJson: current.settingsJson || "{}",
    })
    setEditorOpen(true)
  }

  async function saveEditor() {
    if (!draft.pluginKey) return

    setSavingKey(draft.pluginKey)
    try {
      const next = await updatePlugin({
        pluginKey: draft.pluginKey,
        displayName: draft.displayName,
        description: draft.description,
        version: draft.version,
        uiMode: draft.uiMode,
        settingsJson: draft.settingsJson,
      })

      if (!next) return
      setPlugins((current) => current.map((item) => (item.pluginKey === next.pluginKey ? next : item)))
      setEditorOpen(false)
    } finally {
      setSavingKey(null)
    }
  }

  const currentDraftPlugin = plugins.find((item) => item.pluginKey === draft.pluginKey) || null
  const currentDraftManifest = currentDraftPlugin ? safeParseManifest(currentDraftPlugin.manifestJson) : null
  const storagePathLabel = storagePath || "正在加载插件存放路径..."
  const truncatedStoragePath =
    storagePathLabel.length > 34 ? `${storagePathLabel.slice(0, 18)}…${storagePathLabel.slice(-14)}` : storagePathLabel
  const currentSpaceName = currentSpace?.name || t("chooseSpace")
  const currentSpacePath = currentSpace?.rootPath || t("chooseSpaceToStart")

  return (
    <TooltipProvider>
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Settings2 className="size-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">{t("settings")}</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">这里会作为所有全局设置的入口。</p>
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("chooseSpace")}</CardDescription>
              <CardTitle className="text-base">{currentSpaceName}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              <Tooltip>
                <TooltipTrigger asChild>
                  <p className="truncate">{currentSpacePath}</p>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[420px] break-all">
                  {currentSpacePath}
                </TooltipContent>
              </Tooltip>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{t("spaceList")}</CardDescription>
              <CardTitle className="text-base">{spaceList.length}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-muted-foreground">
              {spaceList.length > 0 ? "左上角可以直接切换空间，设置页也会同步刷新。" : "首次启动会要求创建或选择一个空间目录。"}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">{t("settings")}</CardTitle>
            <CardDescription>后续的新设置项直接加在这里。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <MenuButton
              active={section === "general"}
              icon={<SlidersHorizontal className="size-4" />}
              label={t("general")}
              description="主题、布局、同步等常规选项"
              onClick={() => setSection("general")}
            />
            <MenuButton
              active={section === "language"}
              icon={<Settings2 className="size-4" />}
              label={t("language")}
              description="界面语言、时间格式和区域偏好"
              onClick={() => setSection("language")}
            />
            <MenuButton
              active={section === "location"}
              icon={<Settings2 className="size-4" />}
              label={t("location")}
              description="存储位置"
              onClick={() => setSection("location")}
            />
            <MenuButton
              active={section === "repository"}
              icon={<Settings2 className="size-4" />}
              label={t("repository")}
              description="仓库地址、同步源和分支策略"
              onClick={() => setSection("repository")}
            />
            <MenuButton
              active={section === "plugins"}
              icon={<FolderUp className="size-4" />}
              label={t("plugins")}
              description="导入、启用、排序和编辑插件"
              onClick={() => setSection("plugins")}
            />
            <MenuButton
              active={section === "extensions"}
              icon={<Settings2 className="size-4" />}
              label={t("extensions")}
              description="其他模块和插件面板使用"
              onClick={() => setSection("extensions")}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {section === "plugins" ? (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>{t("plugins")}</CardDescription>
                    <CardTitle className="text-3xl">{stats.total}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>已启用</CardDescription>
                    <CardTitle className="text-3xl">{stats.enabled}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>面板模式</CardDescription>
                    <CardTitle className="text-3xl">{stats.panel}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader className="pb-2">
                    <CardDescription>存放路径</CardDescription>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <CardTitle className="max-w-full cursor-default truncate text-sm leading-6">
                          {truncatedStoragePath}
                        </CardTitle>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[420px] break-all">
                        {storagePathLabel}
                      </TooltipContent>
                    </Tooltip>
                  </CardHeader>
                </Card>
              </div>

              <Card>
                <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <CardTitle>{t("plugins")}</CardTitle>
                    <CardDescription>
                      上传后会自动复制到当前空间的插件目录。
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => void handleRefresh()} disabled={savingKey === "refresh"}>
                      <RefreshCw className="mr-2 size-4" />
                      {t("refresh")}
                    </Button>
                    <Button onClick={() => void handleImportPlugin()} disabled={savingKey === "import"}>
                      <FolderUp className="mr-2 size-4" />
                      {t("import")}
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                    插件会被复制到当前空间下的{" "}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default font-medium text-foreground">{truncatedStoragePath}</span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[420px] break-all">
                        {storagePathLabel}
                      </TooltipContent>
                    </Tooltip>
                    。
                  </div>

                  <Separator />

                  {loading ? (
                    <div className="grid gap-3 lg:grid-cols-2">
                      {[0, 1].map((item) => (
                        <Card key={item} className="p-4">
                          <div className="space-y-3">
                            <ShimmerDemo className="h-4 w-40" />
                            <ShimmerDemo className="h-4 w-3/5" />
                            <ShimmerDemo className="h-20 w-full rounded-xl" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : plugins.length === 0 ? (
                    <Empty className="rounded-xl border border-dashed py-10">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <FolderUp className="size-4" />
                        </EmptyMedia>
                        <EmptyTitle>还没有导入任何插件</EmptyTitle>
                        <EmptyDescription>
                          先点击“导入插件包”，把插件文件夹复制到当前空间目录下。
                        </EmptyDescription>
                      </EmptyHeader>
                      <EmptyContent className="flex-row justify-center">
                        <Button onClick={() => void handleImportPlugin()} disabled={savingKey === "import"}>
                          <FolderUp className="mr-2 size-4" />
                          {t("import")}
                        </Button>
                      </EmptyContent>
                    </Empty>
                  ) : (
                    <div className="grid gap-4 lg:grid-cols-2">
                      {plugins.map((plugin, index) => {
                        const manifest = safeParseManifest(plugin.manifestJson)
                        const permissionsRead = manifest.permissions.read.join(" / ") || "无"
                        const permissionsWrite = manifest.permissions.write.join(" / ") || "无"

                        return (
                          <Card key={plugin.pluginKey} className="overflow-hidden">
                            <CardHeader className="gap-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <CardTitle className="text-lg">{plugin.displayName}</CardTitle>
                                    <Badge variant={plugin.enabled === 1 ? "default" : "secondary"}>
                                      {plugin.enabled === 1 ? "已启用" : "已停用"}
                                    </Badge>
                                    <Badge variant={plugin.isInstalled === 1 ? "outline" : "secondary"}>
                                      {plugin.isInstalled === 1 ? "已挂载" : "离线"}
                                    </Badge>
                                    <Badge variant="outline">{plugin.uiMode}</Badge>
                                  </div>
                                  <CardDescription className="max-w-xl">{plugin.description || "暂无描述"}</CardDescription>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Switch
                                    checked={plugin.enabled === 1}
                                    onCheckedChange={() => void handleToggleEnabled(plugin)}
                                    disabled={savingKey === plugin.pluginKey}
                                  />
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                <span>key: {plugin.pluginKey}</span>
                                <span>·</span>
                                <span>version: {plugin.version}</span>
                                <span>·</span>
                                <span>source: {plugin.sourcePath}</span>
                                <span>·</span>
                                <span>order: {index}</span>
                              </div>
                            </CardHeader>

                            <CardContent className="space-y-4">
                              <div className="space-y-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">插件模块</p>
                                <div className="flex flex-wrap gap-2">
                                  {manifest.modules.length > 0 ? (
                                    manifest.modules.map((module) => (
                                      <Badge key={module.id} variant="secondary">
                                        {module.title}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span className="text-sm text-muted-foreground">暂无模块</span>
                                  )}
                                </div>
                              </div>

                              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm md:grid-cols-2">
                                <div>
                                  <p className="text-xs text-muted-foreground">读取权限</p>
                                  <p className="mt-1">{permissionsRead}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-muted-foreground">写入权限</p>
                                  <p className="mt-1">{permissionsWrite}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleMove(plugin.pluginKey, -1)}
                                  disabled={savingKey === plugin.pluginKey || index === 0}
                                >
                                  <ArrowUp className="mr-2 size-4" />
                                  上移
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => void handleMove(plugin.pluginKey, 1)}
                                  disabled={savingKey === plugin.pluginKey || index === plugins.length - 1}
                                >
                                  <ArrowDown className="mr-2 size-4" />
                                  下移
                                </Button>
                                <Button size="sm" onClick={() => void openEditor(plugin.pluginKey)} disabled={savingKey === plugin.pluginKey}>
                                  编辑设置
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : section === "general" ? (
            <div className="space-y-6">
              <Card>
                <CardHeader className="gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <CardTitle>软件更新</CardTitle>
                    <CardDescription>
                      第一版只检查 GitHub Release 并提示下载，不会自动下载或自动安装。
                    </CardDescription>
                  </div>
                  <Badge variant={updateStatus.state === "available" ? "default" : "secondary"}>
                    {updateStateLabel(updateStatus.state)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">当前版本</p>
                      <p className="mt-1 text-lg font-semibold">{updateStatus.currentVersion}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">最近检查</p>
                      <p className="mt-1 text-sm">{formatDateTime(updateSettings.lastCheckedAt || updateStatus.checkedAt)}</p>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-3">
                      <p className="text-xs text-muted-foreground">更新源</p>
                      <p className="mt-1 truncate text-sm">GitHub Releases</p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-[1fr_220px_160px]">
                    <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                      <div>
                        <Label>自动检查更新</Label>
                        <p className="mt-1 text-xs text-muted-foreground">开启后按规则检查新版，但不会自动下载安装。</p>
                      </div>
                      <Switch
                        checked={updateSettings.enabled}
                        onCheckedChange={(checked) => void saveUpdateSettings({ enabled: checked })}
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label>检查规则</Label>
                      <Select
                        value={updateSettings.schedule}
                        onValueChange={(value) => void saveUpdateSettings({ schedule: value as UpdateSettings["schedule"] })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择规则" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">每天固定时间</SelectItem>
                          <SelectItem value="startup">每次启动后</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="grid gap-2">
                      <Label>每日小时</Label>
                      <Select
                        value={String(updateSettings.dailyHour)}
                        onValueChange={(value) => void saveUpdateSettings({ dailyHour: Number.parseInt(value, 10) })}
                        disabled={updateSettings.schedule !== "daily"}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="选择时间" />
                        </SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 24 }, (_, hour) => (
                            <SelectItem key={hour} value={String(hour)}>
                              {String(hour).padStart(2, "0")}:00
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => void handleCheckUpdates()} disabled={checkingUpdate}>
                      <RefreshCw className="mr-2 size-4" />
                      {checkingUpdate ? "正在检查..." : "立即检查更新"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void handleOpenReleasePage()}
                      disabled={!updateStatus.update?.releaseUrl}
                    >
                      <ExternalLink className="mr-2 size-4" />
                      前往下载
                    </Button>
                  </div>

                  {updateStatus.state === "available" && updateStatus.update ? (
                    <div className="rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">发现新版本</p>
                          <h3 className="mt-1 text-xl font-semibold">{updateStatus.update.name}</h3>
                        </div>
                        <Badge variant="outline">{updateStatus.update.tagName}</Badge>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">{updateStatus.update.summary}</p>
                      <p className="mt-3 text-xs text-muted-foreground">
                        发布时间：{formatDateTime(updateStatus.update.publishedAt)}
                      </p>
                    </div>
                  ) : null}

                  {updateStatus.state === "not-available" ? (
                    <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                      当前已经是最新稳定版。
                    </div>
                  ) : null}

                  {updateStatus.state === "error" ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                      {updateStatus.error || "检查更新失败，请稍后重试。"}
                    </div>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>常规设置</CardTitle>
                  <CardDescription>主题、布局、同步和其他系统设置会继续放在这里。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>当前版本先接入软件更新提示，后续再补自动下载和自动安装。</p>
                </CardContent>
              </Card>
            </div>
          ) : section === "language" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("language")}</CardTitle>
                <CardDescription>界面语言、日期格式、时区和数字格式的预留区。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>{t("interfaceLanguage")}</Label>
                  <Select value={language} onValueChange={(value) => setLanguage(value as typeof language)}>
                    <SelectTrigger>
                      <SelectValue placeholder={t("chooseLanguage")} />
                    </SelectTrigger>
                    <SelectContent>
                      {getLanguageOptions().map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>{t("dateFormat")}</Label>
                  <Select defaultValue="YYYY-MM-DD">
                    <SelectTrigger>
                      <SelectValue placeholder={t("selectFormat")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
                      <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                      <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ) : section === "location" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("location")}</CardTitle>
                <CardDescription>本地数据、附件、插件包和缓存的路径配置预留。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2">
                  <Label>{t("spacePath")}</Label>
                  <div className="rounded-lg border bg-muted/20 px-3 py-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <p className="truncate text-sm text-foreground">{currentSpacePath}</p>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[420px] break-all">
                        {currentSpacePath}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  <p className="text-xs text-muted-foreground">这里会承载当前空间的数据、数据库和插件目录，账号配置不随空间切换而移动。</p>
                </div>
                <div className="grid gap-2">
                  <Label>{t("plugins")}</Label>
                  <Input value={storagePathLabel} readOnly />
                  <p className="text-xs text-muted-foreground">插件仍然复制到当前空间的 plugins 目录，导入后建议重启一次。</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => void openMigrateSpaceDialog()}>
                    更改当前空间路径
                  </Button>
                  <Button type="button" onClick={() => void openCreateSpaceDialog()}>
                    创建或切换空间
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : section === "repository" ? (
            <Card>
              <CardHeader>
                <CardTitle>{t("repository")}</CardTitle>
                <CardDescription>仓库源、同步源、分支和版本策略的预留区。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2">
                  <Label>仓库地址</Label>
                  <Input placeholder="https://..." />
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label>默认分支</Label>
                    <Input placeholder="main" />
                  </div>
                  <div className="grid gap-2">
                    <Label>同步策略</Label>
                    <Select defaultValue="manual">
                      <SelectTrigger>
                        <SelectValue placeholder={t("selectStrategy")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">手动同步</SelectItem>
                        <SelectItem value="auto">自动同步</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>预留设置区</CardTitle>
                <CardDescription>这里会放主题、布局、同步和其他系统设置。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-muted-foreground">
                <p>我先把结构留好，后面你要加什么设置项，直接往这里塞就行。</p>
                <p>当前版本先把插件管理和导入流程跑通，保证打包后也能用。</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("editSettings")}</DialogTitle>
            <DialogDescription>这里只调整插件管理元数据，不改插件内部业务逻辑。</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="plugin-key">插件 key</Label>
              <Input id="plugin-key" value={draft.pluginKey} disabled />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plugin-name">显示名称</Label>
              <Input
                id="plugin-name"
                value={draft.displayName}
                onChange={(event) => setDraft((current) => ({ ...current, displayName: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plugin-version">版本号</Label>
              <Input
                id="plugin-version"
                value={draft.version}
                onChange={(event) => setDraft((current) => ({ ...current, version: event.target.value }))}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plugin-mode">展示模式</Label>
              <Select
                value={draft.uiMode}
                onValueChange={(value) => setDraft((current) => ({ ...current, uiMode: value as PluginUiMode }))}
              >
                <SelectTrigger id="plugin-mode">
                  <SelectValue placeholder={t("selectMode")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="panel">panel</SelectItem>
                  <SelectItem value="editor">editor</SelectItem>
                  <SelectItem value="display">display</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plugin-desc">描述</Label>
              <Textarea
                id="plugin-desc"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                className="min-h-24"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="plugin-settings">插件设置 JSON</Label>
              <Textarea
                id="plugin-settings"
                value={draft.settingsJson}
                onChange={(event) => setDraft((current) => ({ ...current, settingsJson: event.target.value }))}
                className="min-h-28 font-mono text-xs"
              />
            </div>

            <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
              {currentDraftManifest ? (
                <>当前模块：{currentDraftManifest.modules.map((module) => module.title).join(" / ") || "暂无模块"}</>
              ) : (
                "插件清单暂不可读。"
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void saveEditor()} disabled={savingKey === draft.pluginKey}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={restartOpen} onOpenChange={setRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>插件已导入</AlertDialogTitle>
            <AlertDialogDescription>建议重启应用，让新插件的入口和菜单注册完全生效。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>稍后重启</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restartApp()}>立即重启</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={spaceRestartOpen} onOpenChange={setSpaceRestartOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>空间路径已更新</AlertDialogTitle>
            <AlertDialogDescription>当前空间数据已移动到新路径，建议立刻重启应用以确保所有页面和插件都指向新目录。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>稍后重启</AlertDialogCancel>
            <AlertDialogAction onClick={() => void restartApp()}>立即重启</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SpaceDialog
        open={spaceDialogOpen}
        mode={spaceDialogMode}
        title={spaceDialogMode === "migrate" ? "更改当前空间路径" : "创建空间"}
        description={
          spaceDialogMode === "migrate"
            ? "选择新的空间目录后，会自动迁移当前空间的全部数据，并更新数据库路径。"
            : "选择空间目录并填写空间名称，创建后会把数据、数据库和插件都放到这个空间下。"
        }
        submitLabel={spaceDialogMode === "migrate" ? "迁移空间" : "创建并进入"}
        defaultName={spaceDialogMode === "migrate" ? currentSpaceName : ""}
        defaultPath={spaceDialogMode === "migrate" ? (currentSpacePath === "尚未创建空间" ? "" : currentSpacePath) : ""}
        lockName={spaceDialogMode === "migrate"}
        onOpenChange={setSpaceDialogOpen}
        onSubmit={handleSpaceSubmit}
      />
      </div>
    </TooltipProvider>
  )
}
