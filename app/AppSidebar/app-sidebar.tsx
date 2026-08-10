"use client"

import { useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"

import { sidebarData, loadNotesTree, type NoteTreeNode } from "@/components/sidebar-data"
import { NavMain } from "@/components/nav-main"
import { NavNotes } from "@/components/nav-notes"
import { NavMail } from "@/components/nav-mail"
import { UserMenu } from "@/components/user-menu"
import { SpaceDialog } from "@/components/space-dialog"

import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

import { ChevronDown, FolderPlus } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { createSpace, getSpaceBootstrapState, listMailTree, listSpaces, switchSpace, type SpaceRecord } from "@/lib/hora-db"
import { useT } from "@/lib/app-language"
import {
  clearNoteEditorTabsState,
  NOTE_EDITOR_ACTIVE_TAB_STORAGE_KEY,
  NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY,
  NOTE_EDITOR_TABS_STORAGE_KEY,
} from "@/lib/notes-editor-state"

// 主 Sidebar：导航读取静态配置，Notes 通过 DB + IPC 实时同步。
export function AppSidebar() {
  const t = useT()
  const pathname = usePathname()
  const router = useRouter()
  // NotesTree 数据源：挂载后从 SQLite 加载并响应文件系统变化。
  const [notesTree, setNotesTree] = useState<NoteTreeNode[]>(sidebarData.workspace.notesTree)
  const [spaces, setSpaces] = useState<SpaceRecord[]>([])
  const [currentSpace, setCurrentSpace] = useState<SpaceRecord | null>(null)
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [bootstrapRequired, setBootstrapRequired] = useState(false)
  const [switchingSpaceId, setSwitchingSpaceId] = useState<string | null>(null)
  const [mailUnreadCount, setMailUnreadCount] = useState(0)

  useEffect(() => {
    // 统一刷新方法：启动加载与后续事件都复用。
    const refreshNotes = async () => {
      const tree = await loadNotesTree()
      setNotesTree(tree)
    }

    // 同时刷新空间列表：顶部工作区入口依赖账号级空间注册表。
    const refreshSpaces = async () => {
      const [spaceState, spaceRows] = await Promise.all([getSpaceBootstrapState(), listSpaces()])
      setCurrentSpace(spaceState.currentSpace)
      setSpaces(spaceRows)
      setBootstrapRequired(spaceState.bootstrapRequired || !spaceState.currentSpace)
      setSpaceDialogOpen(spaceState.bootstrapRequired || !spaceState.currentSpace)
    }

    // 汇总邮件未读数：顶部邮件 Tab 用一个总数角标提示。
    const refreshMailUnreadCount = async () => {
      const tree = await listMailTree()
      const unreadCount = tree.reduce(
        (accountTotal, account) => accountTotal + account.folders.reduce((folderTotal, folder) => folderTotal + folder.unreadCount, 0),
        0,
      )
      setMailUnreadCount(unreadCount)
    }

    void refreshNotes()
    void refreshSpaces()
    void refreshMailUnreadCount()

    // 订阅主进程推送：notes 文件变化后自动刷新树。
    const unsubscribe = window.horaDB?.onNotesChanged?.(() => {
      void refreshNotes()
    })

    // 空间变化后直接整页刷新，确保当前空间的项目、任务和插件都切到新根目录。
    const unsubscribeSpaces = window.horaDB?.onSpacesChanged?.(() => {
      window.location.reload()
    })

    // 邮件同步或已读状态变化后刷新顶部未读角标。
    const handleDbUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail
      if (detail?.scope === "mail") void refreshMailUnreadCount()
    }
    window.addEventListener("hora:db-updated", handleDbUpdated)

    return () => {
      unsubscribe?.()
      unsubscribeSpaces?.()
      window.removeEventListener("hora:db-updated", handleDbUpdated)
    }
  }, [])

  const currentSpaceLabel = useMemo(() => currentSpace?.name || t("createSpace"), [currentSpace, t])

  async function handleSwitchSpace(spaceId: string) {
    // 点击当前空间不触发重载，也不会误清理正在使用的笔记标签。
    if (switchingSpaceId === spaceId || currentSpace?.id === spaceId) return
    setSwitchingSpaceId(spaceId)
    // 切换前保存当前笔记，随后清掉标签缓存，避免新空间恢复旧空间的文件。
    const noteBridge = window as Window & {
      horaNotesBeforeNavigate?: () => Promise<void>
    }
    const previousEditorState = {
      tabs: window.localStorage.getItem(NOTE_EDITOR_TABS_STORAGE_KEY),
      activeTab: window.localStorage.getItem(NOTE_EDITOR_ACTIVE_TAB_STORAGE_KEY),
      closedRoute: window.localStorage.getItem(NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY),
    }
    const previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`

    try {
      await noteBridge.horaNotesBeforeNavigate?.()
      clearNoteEditorTabsState()
      // 空间切换会立即触发整页刷新，先同步改写笔记路由，避免新空间读取旧 noteId。
      if (pathname.startsWith("/notes/")) {
        window.history.replaceState(null, "", "/dashboard")
      }
      await switchSpace(spaceId)
    } catch (error) {
      // 切换失败时恢复原标签和路由，不能因为失败操作关闭用户正在编辑的文件。
      const restoreStorageValue = (key: string, value: string | null) => {
        if (value === null) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, value)
      }
      restoreStorageValue(NOTE_EDITOR_TABS_STORAGE_KEY, previousEditorState.tabs)
      restoreStorageValue(NOTE_EDITOR_ACTIVE_TAB_STORAGE_KEY, previousEditorState.activeTab)
      restoreStorageValue(NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY, previousEditorState.closedRoute)
      if (pathname.startsWith("/notes/")) {
        window.history.replaceState(null, "", previousUrl)
      }
      console.error("切换空间失败", error)
    } finally {
      setSwitchingSpaceId(null)
    }
  }

  async function handleCreateSpace(input: { name: string; rootPath: string }) {
    await createSpace(input)
  }

  function handleModuleChange(value: string) {
    // 邮件是独立页面：切换到邮件 Tab 时同步打开右侧邮件工作台。
    if (value === "mail") {
      router.push("/mail")
      return
    }

    // 从邮件页切回工作区时给用户一个明确落点，避免右侧仍停留在邮件页面。
    if (pathname.startsWith("/mail")) {
      router.push("/dashboard")
    }
  }

  function handleSpaceDialogChange(nextOpen: boolean) {
    // 首次启动没有任何空间时不允许直接关闭，避免用户停留在空壳状态。
    if (!nextOpen && bootstrapRequired) return
    setSpaceDialogOpen(nextOpen)
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="h-11 justify-between gap-2 px-3">
                  {/* 顶部空间切换：名称和路径摘要放在同一层，避免再单独占一行。 */}
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
                      {currentSpaceLabel.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <span className="block truncate font-medium">{currentSpaceLabel}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {currentSpace?.rootPath || t("chooseSpaceToStart")}
                      </span>
                    </div>
                  </div>

                  <ChevronDown className="size-4 shrink-0 opacity-50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-[--radix-popper-anchor-width] min-w-56 p-1.5">
                <DropdownMenuLabel className="px-2.5 py-1.5 text-xs text-muted-foreground">{t("spaceList")}</DropdownMenuLabel>
                {spaces.map((space) => (
                  <DropdownMenuItem
                    key={space.id}
                    className="gap-2 rounded-md px-2.5 py-2"
                    onClick={() => void handleSwitchSpace(space.id)}
                    disabled={switchingSpaceId === space.id}
                  >
                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-medium">
                      {space.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="block truncate">{space.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{space.rootPath}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />

                <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2 text-muted-foreground" onClick={() => setSpaceDialogOpen(true)}>
                  <FolderPlus className="size-4" />
                  {t("createSpace")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <div className="px-2 py-2">
          <Tabs value={pathname.startsWith("/mail") ? "mail" : "workspace"} onValueChange={handleModuleChange} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="workspace" className="flex-1">
                {t("workspace")}
              </TabsTrigger>
              <TabsTrigger value="mail" className="relative flex-1">
                {t("mail")}
                {mailUnreadCount > 0 ? (
                  <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium leading-none text-primary-foreground">
                    {mailUnreadCount > 99 ? "99+" : mailUnreadCount}
                  </span>
                ) : null}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="workspace" className="mt-2">
              <NavMain items={sidebarData.workspace.navMain} />
              <NavNotes tree={notesTree} />
            </TabsContent>

            <TabsContent value="mail" className="mt-2">
              <NavMail items={sidebarData.mail.nav} />
            </TabsContent>
          </Tabs>
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SpaceDialog
        open={spaceDialogOpen}
        mode="create"
        title={t("createSpaceTitle")}
        description={t("createSpaceDescription")}
        submitLabel={t("createAndEnter")}
        defaultName=""
        defaultPath=""
        onOpenChange={handleSpaceDialogChange}
        onSubmit={handleCreateSpace}
      />
    </Sidebar>
  )
}
