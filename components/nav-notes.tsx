"use client"

import * as React from "react"
import { Plus } from "lucide-react"
import { NotesTree } from "@/components/notes-tree"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
} from "@/components/ui/sidebar"

import { type NoteTreeNode } from "@/components/sidebar-data"

type NavNotesProps = {
  tree: NoteTreeNode[]
}

// 拉平目录节点：给移动弹窗提供目标目录列表。
function collectFolderTargets(nodes: NoteTreeNode[]): NoteTreeNode[] {
  return nodes.flatMap((node) => {
    const children = collectFolderTargets(node.children)
    return node.nodeType === "folder" ? [node, ...children] : children
  })
}

// Notes 分组：渲染带 id 的目录树。
export function NavNotes({ tree }: NavNotesProps) {
  // 根目录新建文件夹弹层状态。
  const [open, setOpen] = React.useState(false)
  // 根目录文件夹名称输入。
  const [folderName, setFolderName] = React.useState("新建文件夹")
  // 提交中状态，避免重复点击。
  const [submitting, setSubmitting] = React.useState(false)
  // 所有可作为移动目标的文件夹。
  const folderTargets = React.useMemo(() => collectFolderTargets(tree), [tree])

  // 打开弹层时重置默认名称。
  const handleOpenCreateRootFolder = () => {
    setFolderName("新建文件夹")
    setOpen(true)
  }

  // 创建根目录文件夹：parentId 传 null，且 nodeType 固定 folder。
  const handleCreateRootFolder = async () => {
    if (submitting) return
    const nextName = folderName.trim()
    if (!nextName) return
    setSubmitting(true)
    try {
      await window.horaDB?.createNoteNode({
        parentId: null,
        nodeType: "folder",
        title: nextName,
      })
      setOpen(false)
      setFolderName("新建文件夹")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SidebarGroup>
      {/* Notes 标题行右侧加号：仅用于根目录新建文件夹。 */}
      <SidebarGroupLabel className="flex items-center justify-between">
        <span>Notes</span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="h-6 w-6"
          onClick={handleOpenCreateRootFolder}
          aria-label="在根目录新建文件夹"
        >
          <Plus className="size-3.5" />
        </Button>
      </SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {tree.map((item) => (
            <NotesTree key={item.id} item={item} folderTargets={folderTargets} />
          ))}
        </SidebarMenu>
      </SidebarGroupContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建文件夹</DialogTitle>
            <DialogDescription>将在 Notes 根目录创建文件夹。</DialogDescription>
          </DialogHeader>

          <Input
            autoFocus
            value={folderName}
            onChange={(event) => setFolderName(event.target.value)}
            placeholder="请输入文件夹名称"
            // 回车直接确认创建，减少额外点击。
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                void handleCreateRootFolder()
              }
            }}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="button" onClick={() => void handleCreateRootFolder()} disabled={submitting}>
              确认
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarGroup>
  )
}
