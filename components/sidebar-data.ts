import { Home, Folder, List } from "lucide-react"

// SQLite 返回的笔记节点结构：用于构建目录树。
export type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
  filePath: string | null
}

// 前端目录树节点：保留 id 以支持点击打开具体笔记。
export type NoteTreeNode = {
  id: string
  parentId: string | null
  title: string
  nodeType: "folder" | "file"
  filePath: string | null
  children: NoteTreeNode[]
}

// Sidebar 数据源：导航保持静态，notesTree 通过 DB 动态加载。
export const sidebarData = {
  workspace: {
    navMain: [
      {
        title: "Dashboard",
        url: "/",
        icon: Home,
      },
      {
        title: "Projects",
        url: "/projects",
        icon: Folder,
      },
      {
        title: "Tasks",
        url: "/tasks",
        icon: List,
      },
    ],
    notesTree: [] as NoteTreeNode[],
  },

  mail: {
    nav: [{ title: "Inbox" }, { title: "Sent" }, { title: "Drafts" }],
  },
}

// 将扁平节点转换为树：按 parentId 组织层级。
function buildTree(rows: NoteNodeRow[]): NoteTreeNode[] {
  const nodeMap = new Map<string, NoteTreeNode>()

  // 先创建所有节点，保证后续可以按 id 互相引用。
  for (const row of rows) {
    nodeMap.set(row.id, {
      id: row.id,
      parentId: row.parentId,
      title: row.title,
      nodeType: row.nodeType,
      filePath: row.filePath,
      children: [],
    })
  }

  const roots: NoteTreeNode[] = []

  // 再根据 parentId 建立父子关系。
  for (const row of rows) {
    const node = nodeMap.get(row.id)
    if (!node) continue

    if (!row.parentId) {
      roots.push(node)
      continue
    }

    const parent = nodeMap.get(row.parentId)
    if (!parent) {
      roots.push(node)
      continue
    }

    parent.children.push(node)
  }

  return roots
}

// 从 Electron SQLite 加载 notesTree。
export async function loadNotesTree(): Promise<NoteTreeNode[]> {
  if (typeof window === "undefined" || !window.horaDB?.listNoteNodes) {
    return sidebarData.workspace.notesTree
  }

  const rows = (await window.horaDB.listNoteNodes()) as NoteNodeRow[]
  return buildTree(rows)
}
