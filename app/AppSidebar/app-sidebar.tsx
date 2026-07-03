"use client"

import { useEffect, useMemo, useState } from "react"

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
import { createSpace, getSpaceBootstrapState, listSpaces, switchSpace, type SpaceRecord } from "@/lib/hora-db"
import { useT } from "@/lib/app-language"

// 主 Sidebar：导航读取静态配置，Notes 通过 DB + IPC 实时同步。
export function AppSidebar() {
  const t = useT()
  // NotesTree 数据源：挂载后从 SQLite 加载并响应文件系统变化。
  const [notesTree, setNotesTree] = useState<NoteTreeNode[]>(sidebarData.workspace.notesTree)
  const [spaces, setSpaces] = useState<SpaceRecord[]>([])
  const [currentSpace, setCurrentSpace] = useState<SpaceRecord | null>(null)
  const [spaceDialogOpen, setSpaceDialogOpen] = useState(false)
  const [bootstrapRequired, setBootstrapRequired] = useState(false)
  const [switchingSpaceId, setSwitchingSpaceId] = useState<string | null>(null)

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

    void refreshNotes()
    void refreshSpaces()

    // 订阅主进程推送：notes 文件变化后自动刷新树。
    const unsubscribe = window.horaDB?.onNotesChanged?.(() => {
      void refreshNotes()
    })

    // 空间变化后直接整页刷新，确保当前空间的项目、任务和插件都切到新根目录。
    const unsubscribeSpaces = window.horaDB?.onSpacesChanged?.(() => {
      window.location.reload()
    })

    return () => {
      unsubscribe?.()
      unsubscribeSpaces?.()
    }
  }, [])

  const currentSpaceLabel = useMemo(() => currentSpace?.name || t("createSpace"), [currentSpace, t])

  async function handleSwitchSpace(spaceId: string) {
    if (switchingSpaceId === spaceId) return
    setSwitchingSpaceId(spaceId)
    try {
      await switchSpace(spaceId)
    } finally {
      setSwitchingSpaceId(null)
    }
  }

  async function handleCreateSpace(input: { name: string; rootPath: string }) {
    await createSpace(input)
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
          <Tabs defaultValue="workspace" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="workspace" className="flex-1">
                {t("workspace")}
              </TabsTrigger>
              <TabsTrigger value="mail" className="flex-1">
                {t("mail")}
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
