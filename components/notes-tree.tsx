"use client"

import * as React from "react"
import { ChevronRight } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { type NoteTreeNode } from "@/components/sidebar-data"

// 节点动作类型：统一驱动“新建/重命名/移动/删除”弹层。
type NoteActionState =
  | { kind: "create-file"; parentId: string }
  | { kind: "create-drawing"; parentId: string }
  | { kind: "create-folder"; parentId: string }
  | { kind: "rename"; id: string; oldTitle: string }
  | { kind: "move"; id: string; title: string }
  | { kind: "delete"; id: string; title: string }

// 单个 Notes 树节点：文件可点击打开，目录可折叠展开并支持右键菜单。
export function NotesTree({
  item,
  folderTargets,
}: {
  item: NoteTreeNode
  folderTargets: NoteTreeNode[]
}) {
  const router = useRouter()
  // 统一弹层状态：避免使用 prompt/confirm（部分桌面容器不支持）。
  const [action, setAction] = React.useState<NoteActionState | null>(null)
  // 文本输入值：用于新建与重命名。
  const [titleInput, setTitleInput] = React.useState("")
  // 移动目标目录，空字符串代表 Notes 根目录。
  const [moveTargetId, setMoveTargetId] = React.useState("")
  // 执行态：防止重复提交。
  const [submitting, setSubmitting] = React.useState(false)

  // 打开“新建文件”弹层。
  const openCreateFile = (parentId: string) => {
    setTitleInput("新建文件")
    setAction({ kind: "create-file", parentId })
  }

  // 打开“新建绘图”弹层。
  const openCreateDrawing = (parentId: string) => {
    setTitleInput("新建绘图")
    setAction({ kind: "create-drawing", parentId })
  }

  // 打开“新建文件夹”弹层。
  const openCreateFolder = (parentId: string) => {
    setTitleInput("新建文件夹")
    setAction({ kind: "create-folder", parentId })
  }

  // 打开“重命名”弹层。
  const openRename = (id: string, oldTitle: string) => {
    setTitleInput(oldTitle)
    setAction({ kind: "rename", id, oldTitle })
  }

  // 打开“删除确认”弹层。
  const openDelete = (id: string, title: string) => {
    setAction({ kind: "delete", id, title })
  }

  // 打开“移动”弹层。
  const openMove = (id: string, title: string) => {
    setMoveTargetId(item.parentId || "")
    setAction({ kind: "move", id, title })
  }

  // 关闭弹层并清理输入。
  const closeDialog = () => {
    setAction(null)
    setTitleInput("")
    setMoveTargetId("")
  }

  // 判断候选目录是否是当前节点自身或子目录。
  const isInvalidMoveTarget = (folder: NoteTreeNode) => {
    if (folder.id === item.id) return true
    if (!item.filePath || !folder.filePath) return false
    return folder.filePath.startsWith(`${item.filePath}/`)
  }

  // 在 Finder 中定位当前节点：只调用系统能力，不改变左侧选中、展开或路由。
  const handleShowInFinder = async (id: string) => {
    try {
      await window.horaDB?.showNoteInFinder(id)
    } catch (error) {
      console.error("在 Finder 中显示失败", error)
    }
  }

  // 提交当前动作：根据 action.kind 分发到对应 IPC。
  const handleSubmitAction = async () => {
    if (!action || submitting) return
    setSubmitting(true)
    try {
      if (action.kind === "create-file") {
        const nextTitle = titleInput.trim()
        if (!nextTitle) return
        await window.horaDB?.createNoteNode({
          parentId: action.parentId,
          nodeType: "file",
          fileKind: "markdown",
          title: nextTitle,
        })
      } else if (action.kind === "create-drawing") {
        const nextTitle = titleInput.trim()
        if (!nextTitle) return
        await window.horaDB?.createNoteNode({
          parentId: action.parentId,
          nodeType: "file",
          fileKind: "drawing",
          title: nextTitle,
        })
      } else if (action.kind === "create-folder") {
        const nextTitle = titleInput.trim()
        if (!nextTitle) return
        await window.horaDB?.createNoteNode({
          parentId: action.parentId,
          nodeType: "folder",
          title: nextTitle,
        })
      } else if (action.kind === "rename") {
        const nextTitle = titleInput.trim()
        if (!nextTitle || nextTitle === action.oldTitle) return
        await window.horaDB?.renameNoteNode({ id: action.id, title: nextTitle })
      } else if (action.kind === "move") {
        await window.horaDB?.moveNoteNode({
          id: action.id,
          parentId: moveTargetId || null,
        })
      } else if (action.kind === "delete") {
        await window.horaDB?.deleteNoteNode({ id: action.id })
      }
      closeDialog()
    } finally {
      setSubmitting(false)
    }
  }

  // 文件节点：左键打开文件，右键菜单支持重命名/移动/删除。
  if (item.nodeType === "file") {
    return (
      <>
        <SidebarMenuItem>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div>
                <SidebarMenuButton
                  className="h-8 gap-2 px-2 text-[12px]"
                  onClick={async () => {
                    // 先等编辑页把当前文件自动保存完，再切到新文件。
                    const bridge = window as Window & {
                      horaNotesBeforeNavigate?: () => Promise<void>
                    }
                    await bridge.horaNotesBeforeNavigate?.()
                    // 追加 open 参数，保证同一文件重复点击也会触发打开动作。
                    router.push(`/notes/${item.id}?open=${Date.now()}`)
                  }}
                >
                  {/* 超长标题单行省略。 */}
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </SidebarMenuButton>
              </div>
            </ContextMenuTrigger>

            <ContextMenuContent>
              <ContextMenuItem onClick={() => openRename(item.id, item.title)}>
                重命名
              </ContextMenuItem>
              <ContextMenuItem onClick={() => openMove(item.id, item.title)}>
                移动
              </ContextMenuItem>
              <ContextMenuItem onClick={() => void handleShowInFinder(item.id)}>
                在 Finder 中显示
              </ContextMenuItem>
              <ContextMenuItem onClick={() => openDelete(item.id, item.title)}>
                删除
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        </SidebarMenuItem>

        <NoteActionDialog
          action={action}
          titleInput={titleInput}
          submitting={submitting}
          onTitleInputChange={setTitleInput}
          moveTargetId={moveTargetId}
          folderTargets={folderTargets}
          isInvalidMoveTarget={isInvalidMoveTarget}
          onMoveTargetChange={setMoveTargetId}
          onClose={closeDialog}
          onConfirm={handleSubmitAction}
        />
      </>
    )
  }

  // 目录节点：每个节点维护自己的展开状态，保证箭头方向与当前层级同步。
  const [open, setOpen] = React.useState(false)

  return (
    <SidebarMenuItem>
      <Collapsible className="group/collapsible" open={open} onOpenChange={setOpen}>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div>
              <CollapsibleTrigger asChild>
                <SidebarMenuButton className="h-8 gap-2 px-2 text-[12px]">
                  <ChevronRight
                    className={open ? "shrink-0 rotate-90 transition-transform" : "shrink-0 transition-transform"}
                  />
                  {/* 超长标题单行省略。 */}
                  <span className="min-w-0 flex-1 truncate">{item.title}</span>
                </SidebarMenuButton>
              </CollapsibleTrigger>
            </div>
          </ContextMenuTrigger>

          <ContextMenuContent>
            <ContextMenuItem onClick={() => openCreateFile(item.id)}>新建文件</ContextMenuItem>
            <ContextMenuItem onClick={() => openCreateDrawing(item.id)}>新建绘图</ContextMenuItem>
            <ContextMenuItem onClick={() => openCreateFolder(item.id)}>新建文件夹</ContextMenuItem>
            <ContextMenuItem onClick={() => openRename(item.id, item.title)}>重命名</ContextMenuItem>
            <ContextMenuItem onClick={() => openMove(item.id, item.title)}>移动</ContextMenuItem>
            <ContextMenuItem onClick={() => void handleShowInFinder(item.id)}>在 Finder 中显示</ContextMenuItem>
            <ContextMenuItem onClick={() => openDelete(item.id, item.title)}>删除</ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>

        <CollapsibleContent>
          <SidebarMenuSub>
            {item.children.map((subItem) => (
              <NotesTree key={subItem.id} item={subItem} folderTargets={folderTargets} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </Collapsible>

      <NoteActionDialog
        action={action}
        titleInput={titleInput}
        submitting={submitting}
        onTitleInputChange={setTitleInput}
        moveTargetId={moveTargetId}
        folderTargets={folderTargets}
        isInvalidMoveTarget={isInvalidMoveTarget}
        onMoveTargetChange={setMoveTargetId}
        onClose={closeDialog}
        onConfirm={handleSubmitAction}
      />
    </SidebarMenuItem>
  )
}

// Notes 树动作弹层：替代 prompt/confirm，确保桌面容器可用。
function NoteActionDialog(props: {
  action: NoteActionState | null
  titleInput: string
  submitting: boolean
  onTitleInputChange: (value: string) => void
  moveTargetId: string
  folderTargets: NoteTreeNode[]
  isInvalidMoveTarget: (folder: NoteTreeNode) => boolean
  onMoveTargetChange: (value: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  const {
    action,
    titleInput,
    submitting,
    onTitleInputChange,
    moveTargetId,
    folderTargets,
    isInvalidMoveTarget,
    onMoveTargetChange,
    onClose,
    onConfirm,
  } = props
  // 仅在动作存在时显示弹层。
  const open = Boolean(action)
  // 删除动作不需要输入框。
  const isDelete = action?.kind === "delete"
  const isMove = action?.kind === "move"

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "create-file" && "新建文件"}
            {action?.kind === "create-drawing" && "新建绘图"}
            {action?.kind === "create-folder" && "新建文件夹"}
            {action?.kind === "rename" && "重命名"}
            {action?.kind === "move" && "移动"}
            {action?.kind === "delete" && "删除"}
          </DialogTitle>
          <DialogDescription>
            {action?.kind === "delete"
              ? `确认删除“${action.title}”吗？`
              : action?.kind === "move"
                ? `选择“${action.title}”要移动到的目录。`
                : "请输入名称后确认。"}
          </DialogDescription>
        </DialogHeader>

        {isMove ? (
          <Select
            value={moveTargetId || "__root__"}
            onValueChange={(value) => onMoveTargetChange(value === "__root__" ? "" : value)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="选择移动目标" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__root__">Notes 根目录</SelectItem>
              {folderTargets.map((folder) => (
                <SelectItem key={folder.id} value={folder.id} disabled={isInvalidMoveTarget(folder)}>
                  {folder.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : !isDelete ? (
          <Input
            autoFocus
            value={titleInput}
            onChange={(event) => onTitleInputChange(event.target.value)}
            placeholder="请输入名称"
            // 回车直接提交，提升创建与重命名效率。
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void onConfirm()
              }
            }}
          />
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            取消
          </Button>
          <Button type="button" onClick={() => void onConfirm()} disabled={submitting}>
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
