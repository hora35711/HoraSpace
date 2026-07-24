"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Archive, CheckCheck, ChevronRight, Clock, FolderPlus, Inbox, Mail, OctagonAlert, PenLine, Pencil, Send, Trash2 } from "lucide-react"

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import {
  createMailFolder,
  deleteMailFolder,
  listMailReminderMessages,
  listMailTree,
  markMailFolderRead,
  renameMailFolder,
  type MailFolderRecord,
  type MailTreeAccount,
} from "@/lib/hora-db"
import { useT } from "@/lib/app-language"

type NavMailProps = {
  items?: { title: string }[]
}

// 邮件导航：账号在上、文件夹在下，和 Apple Mail 的信息架构保持一致。
export function NavMail(_props: NavMailProps) {
  const t = useT()
  const pathname = usePathname()
  const [accounts, setAccounts] = React.useState<MailTreeAccount[]>([])
  const [reminderCount, setReminderCount] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [folderDialog, setFolderDialog] = React.useState<{ mode: "create" | "rename"; accountId: string; folder?: MailFolderRecord } | null>(null)
  const [deleteCandidate, setDeleteCandidate] = React.useState<MailFolderRecord | null>(null)
  const [folderName, setFolderName] = React.useState("")

  const loadTree = React.useCallback(async () => {
    setLoading(true)
    try {
      setAccounts(await listMailTree())
      setReminderCount((await listMailReminderMessages()).length)
    } finally {
      setLoading(false)
    }
  }, [])

  const handleMarkFolderRead = React.useCallback(async (folderId: string) => {
    // 文件夹全部已读会先更新本地计数，再由主进程尝试同步远端。
    await markMailFolderRead(folderId)
    await loadTree()
  }, [loadTree])

  const openCreateFolder = React.useCallback((accountId: string) => {
    setFolderName("")
    setFolderDialog({ mode: "create", accountId })
  }, [])

  const openRenameFolder = React.useCallback((accountId: string, folder: MailFolderRecord) => {
    setFolderName(folder.name)
    setFolderDialog({ mode: "rename", accountId, folder })
  }, [])

  const handleSubmitFolder = React.useCallback(async () => {
    if (!folderDialog || !folderName.trim()) return
    if (folderDialog.mode === "create") {
      await createMailFolder({ accountId: folderDialog.accountId, name: folderName.trim() })
    } else if (folderDialog.folder) {
      await renameMailFolder({ folderId: folderDialog.folder.id, name: folderName.trim() })
    }
    setFolderDialog(null)
    setFolderName("")
    await loadTree()
  }, [folderDialog, folderName, loadTree])

  const handleDeleteFolder = React.useCallback(async () => {
    if (!deleteCandidate) return
    // 删除自定义文件夹前先把远端和本地邮件回收到收件箱，避免邮件丢失。
    await deleteMailFolder({ folderId: deleteCandidate.id })
    setDeleteCandidate(null)
    await loadTree()
  }, [deleteCandidate, loadTree])

  React.useEffect(() => {
    void loadTree()

    // 邮件数据变化时刷新账号树，保持未读数和文件夹列表同步。
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail
      if (detail?.scope === "mail") void loadTree()
    }
    window.addEventListener("hora:db-updated", handleUpdated)
    return () => window.removeEventListener("hora:db-updated", handleUpdated)
  }, [loadTree])

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-muted-foreground">{t("mail")}</SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {accounts.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild className="h-8 gap-2 px-2">
                <Link href="/mail">
                  <Mail className="size-4" />
                  {loading ? t("loading") : t("addMailAccount")}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : null}

          {accounts.length > 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={pathname === "/mail/reminders"} className="h-8 gap-2 px-2">
                <Link href="/mail/reminders">
                  <Clock className="size-4" />
                  <span className="truncate">提醒</span>
                </Link>
              </SidebarMenuButton>
              {reminderCount > 0 ? <SidebarMenuBadge>{reminderCount}</SidebarMenuBadge> : null}
            </SidebarMenuItem>
          ) : null}

          {accounts.map((account) => (
            <SidebarMenuItem key={account.id}>
              <Collapsible defaultOpen className="group/mail-account">
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1">
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className="h-8 min-w-0 flex-1 gap-2 px-2">
                          <ChevronRight className="size-4 shrink-0 transition-transform group-data-[state=open]/mail-account:rotate-90" />
                          <Mail className="size-4 shrink-0" />
                          <span className="truncate">{account.displayName || account.emailAddress}</span>
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onSelect={() => openCreateFolder(account.id)}>
                      <FolderPlus className="size-4" />
                      新建文件夹
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>

                <CollapsibleContent>
                  <SidebarMenuSub>
                    {account.folders.map((folder) => {
                      const href = `/mail/${account.id}/${folder.id}`
                      return (
                        <SidebarMenuItem key={folder.id}>
                          <ContextMenu>
                            <ContextMenuTrigger asChild>
                              <SidebarMenuButton asChild isActive={pathname === href} className="h-8 gap-2 px-2">
                                <Link href={href}>
                                  <FolderIcon folder={folder} />
                                  <span className="truncate">{translateFolderName(folder, t)}</span>
                                </Link>
                              </SidebarMenuButton>
                            </ContextMenuTrigger>
                            <ContextMenuContent>
                              <ContextMenuItem disabled={folder.unreadCount === 0} onSelect={() => void handleMarkFolderRead(folder.id)}>
                                <CheckCheck className="size-4" />
                                全部标为已读
                              </ContextMenuItem>
                              {folder.role === "custom" ? (
                                <>
                                  <ContextMenuItem onSelect={() => openRenameFolder(account.id, folder)}>
                                    <Pencil className="size-4" />
                                    重命名文件夹
                                  </ContextMenuItem>
                                  <ContextMenuItem variant="destructive" onSelect={() => setDeleteCandidate(folder)}>
                                    <Trash2 className="size-4" />
                                    删除文件夹
                                  </ContextMenuItem>
                                </>
                              ) : null}
                            </ContextMenuContent>
                          </ContextMenu>
                          {folder.unreadCount > 0 ? <SidebarMenuBadge>{folder.unreadCount}</SidebarMenuBadge> : null}
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>

      <Dialog open={Boolean(folderDialog)} onOpenChange={(open) => !open && setFolderDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{folderDialog?.mode === "rename" ? "重命名文件夹" : "新建文件夹"}</DialogTitle>
            <DialogDescription>自定义文件夹会同步创建到当前邮箱的 IMAP 服务器。</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="例如：报销专用"
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleSubmitFolder()
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setFolderDialog(null)}>
              取消
            </Button>
            <Button onClick={() => void handleSubmitFolder()} disabled={!folderName.trim()}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除文件夹？</AlertDialogTitle>
            <AlertDialogDescription>
              文件夹「{deleteCandidate?.name}」会从邮箱服务器和本地目录中删除，里面的邮件会先自动移动回收件箱。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteFolder()}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarGroup>
  )
}

// 文件夹图标：标准目录用熟悉符号，自定义目录保留通用邮箱图标。
function FolderIcon({ folder }: { folder: MailFolderRecord }) {
  switch (folder.role) {
    case "inbox":
      return <Inbox className="size-4 shrink-0" />
    case "sent":
      return <Send className="size-4 shrink-0" />
    case "drafts":
      return <PenLine className="size-4 shrink-0" />
    case "trash":
      return <Trash2 className="size-4 shrink-0" />
    case "archive":
      return <Archive className="size-4 shrink-0" />
    case "junk":
      return <OctagonAlert className="size-4 shrink-0" />
    default:
      return <Mail className="size-4 shrink-0" />
  }
}

// 邮件菜单只翻译公共文件夹名称，不影响服务端原始自定义目录。
function translateFolderName(folder: MailFolderRecord, t: ReturnType<typeof useT>) {
  switch (folder.role) {
    case "inbox":
      return t("inbox")
    case "sent":
      return t("sent")
    case "drafts":
      return t("drafts")
    case "trash":
      return t("trash")
    case "archive":
      return t("archive")
    case "junk":
      return t("junk")
    default:
      return folder.name
  }
}
