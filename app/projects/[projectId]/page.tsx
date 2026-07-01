"use client"

// Project 详情页：项目容器下分开展示需求层与真正的执行任务层。

import { useEffect, useMemo, useRef, useState } from "react"
import type { MutableRefObject, ReactNode } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Check, FileDown, GripVertical, Info, Link as LinkIcon, Pencil, Plus, Trash2, Wand2, X } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePickerField } from "@/components/date-picker-field"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  compareByStatusThenPriority,
  getPriorityToneClassName,
  getStatusToneClassName,
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/project-style"
import {
  createNoteNode,
  createRequirement,
  createTask,
  deleteRequirement,
  deleteTask,
  getProject,
  linkNoteToProject,
  listProjects,
  listNoteNodes,
  listNotesByProject,
  listRequirementsByProject,
  listTasksByProject,
  reorderRequirements,
  reorderTasks,
  saveNoteContent,
  updateProject,
  updateRequirement,
  updateTask,
  updateTaskStatus,
  type LinkedNoteRecord,
  type NoteNodeRow,
  type Priority,
  type ProjectRecord,
  type RequirementRecord,
  type RequirementStatus,
  type TaskRecord,
  type TaskStatus,
  unlinkNoteFromProject,
} from "@/lib/hora-db"
import {
  saveProjectsDetailSnapshot,
  saveProjectsListSnapshot,
} from "@/lib/projects-navigation-state"

// 项目详情的颜色选项也走低饱和方案，尽量和列表页保持一致。
const COLOR_OPTIONS = ["#8AA8E8", "#8CC9A1", "#E2B36B", "#E8C57A", "#E28A8A", "#A8B3C7"]
// 页面内沿用旧变量名，方便只替换数据来源，不大改模板结构。
const PRIORITY_TEXT = PRIORITY_LABEL
const REQUIREMENT_STATUS_TEXT = REQUIREMENT_STATUS_LABEL
const TASK_STATUS_TEXT = TASK_STATUS_LABEL
const PROJECT_UI_STORAGE_PREFIX = "hora_project_ui_state"
const ALL_FILTER_VALUE = "__all__"

type ProjectViewMode = "list" | "board" | "gantt"

type ProjectFocusTarget = {
  kind: "requirement" | "task"
  id: string
}

function normalizeProjectView(value: string | null) {
  if (value === "list" || value === "board" || value === "gantt") return value
  if (value === "cards") return "board"
  return null
}

// dashboard 或任务页跳进来时，会带一个 focus 参数，把目标行锁定到当前页面。
function parseProjectFocus(value: string | null): ProjectFocusTarget | null {
  if (!value) return null
  const [kind, id] = value.split(":")
  if ((kind === "requirement" || kind === "task") && id) {
    return { kind, id }
  }
  return null
}

// 每个项目单独保存自己的视图状态，避免切换项目后把布局和筛选一起带跑。
function getProjectUiStorageKey(projectId: string) {
  return `${PROJECT_UI_STORAGE_PREFIX}:${projectId}`
}

type StoredProjectUiState = {
  viewMode?: "task" | "requirement"
  layoutMode?: ProjectViewMode
  statusFilter?: TaskStatus | RequirementStatus | "all"
  priorityFilter?: Priority | "all"
}

// 读取项目页的本地 UI 状态，项目之间互不影响。
function loadStoredProjectUiState(projectId: string): StoredProjectUiState {
  if (typeof window === "undefined") return {}
  const raw = window.localStorage.getItem(getProjectUiStorageKey(projectId))
  if (!raw) return {}
  try {
    return JSON.parse(raw) as StoredProjectUiState
  } catch {
    return {}
  }
}

// 写回项目页 UI 状态，保证切换后返回还能保持原样。
function saveStoredProjectUiState(projectId: string, state: StoredProjectUiState) {
  window.localStorage.setItem(getProjectUiStorageKey(projectId), JSON.stringify(state))
}

type ConnectionLine = {
  id: string
  x1: number
  y1: number
  x2: number
  y2: number
  color: string
}

// 目录树节点只用于关联笔记弹窗，不影响 note_nodes 表结构和扫描逻辑。
type NoteTreeNode = NoteNodeRow & {
  children: NoteTreeNode[]
}

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const projectId = params.projectId

  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [project, setProject] = useState<ProjectRecord | null>(null)
  const [requirements, setRequirements] = useState<RequirementRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [linkedNotes, setLinkedNotes] = useState<LinkedNoteRecord[]>([])
  const [noteNodes, setNoteNodes] = useState<NoteNodeRow[]>([])
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([])
  const [batchText, setBatchText] = useState("")
  const [viewMode, setViewMode] = useState<"task" | "requirement">("task")
  const [layoutMode, setLayoutMode] = useState<ProjectViewMode>("list")
  const [statusFilter, setStatusFilter] = useState<TaskStatus | RequirementStatus | "all">("all")
  const [priorityFilter, setPriorityFilter] = useState<Priority | "all">("all")
  const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([])
  const [highlightedLineIds, setHighlightedLineIds] = useState<string[]>([])
  const [focusTarget, setFocusTarget] = useState<ProjectFocusTarget | null>(null)
  const [draggedRequirementId, setDraggedRequirementId] = useState<string | null>(null)
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [exportNoticeState, setExportNoticeState] = useState<"hidden" | "visible" | "hiding">("hidden")
  const requirementPanelRef = useRef<HTMLDivElement | null>(null)
  const taskPanelRef = useRef<HTMLDivElement | null>(null)
  const lineHostRef = useRef<HTMLDivElement | null>(null)
  const requirementNodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const taskNodeRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const syncingScrollRef = useRef(false)
  const [requirementForm, setRequirementForm] = useState({
    id: "",
    title: "",
    description: "",
    status: "todo" as RequirementStatus,
    priority: "normal" as Priority,
    color: COLOR_OPTIONS[0],
  })
  const [taskForm, setTaskForm] = useState({
    id: "",
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "normal" as Priority,
    color: COLOR_OPTIONS[0],
    requirementId: "",
    startedAt: "",
    dueAt: "",
    completedAt: "",
  })

  const refreshAll = async () => {
    if (!projectId) return
    const [projectListRows, projectRow, requirementRows, taskRows, noteRows, noteNodeRows] = await Promise.all([
      listProjects(),
      getProject(projectId),
      listRequirementsByProject(projectId),
      listTasksByProject(projectId),
      listNotesByProject(projectId),
      listNoteNodes(),
    ])
    setProjects(projectListRows)
    setProject(projectRow)
    setRequirements(requirementRows)
    setTasks(taskRows)
    setLinkedNotes(noteRows)
    // 保留 folder + file，关联弹窗才能展示目录结构；真正写关联时仍只勾选文件。
    setNoteNodes(noteNodeRows)
  }

  useEffect(() => {
    const requestedView = normalizeProjectView(searchParams.get("view"))
    const requestedFocus = parseProjectFocus(searchParams.get("focus"))
    const savedState = loadStoredProjectUiState(projectId)
    const nextViewMode = savedState.viewMode === "task" || savedState.viewMode === "requirement" ? savedState.viewMode : "task"
    const nextStatusFilter = savedState.statusFilter || "all"
    const nextPriorityFilter = savedState.priorityFilter || "all"
    const nextLayoutMode = requestedFocus ? "list" : requestedView || savedState.layoutMode || "list"

    setViewMode(nextViewMode)
    setStatusFilter(nextStatusFilter)
    setPriorityFilter(nextPriorityFilter)
    setLayoutMode(nextLayoutMode)
    setFocusTarget(requestedFocus)

    const run = async () => {
      try {
        setError(null)
        await refreshAll()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目详情失败")
      }
    }

    void run()
  }, [projectId, searchParams])

  useEffect(() => {
    if (!projectId) return
    saveStoredProjectUiState(projectId, { viewMode, layoutMode, statusFilter, priorityFilter })
    saveProjectsDetailSnapshot(projectId, layoutMode)
  }, [layoutMode, priorityFilter, projectId, statusFilter, viewMode])

  const progress = useMemo(() => {
    const total = tasks.length
    const completed = tasks.filter((task) => task.isCompleted === 1 || task.status === "done").length
    return { total, completed, value: total === 0 ? 0 : Math.round((completed / total) * 100) }
  }, [tasks])

  useEffect(() => {
    if (!project) return

    // 任务全部完成后同步项目状态；如果完成后又新增/取消任务，则从 done 回到 active。
    const nextStatus = progress.total > 0 && progress.value === 100
      ? "done"
      : project.status === "done" ? "active" : project.status
    if (nextStatus === project.status) return

    const run = async () => {
      try {
        setError(null)
        setProject((current) => current ? { ...current, status: nextStatus } : current)
        await updateProject({ id: project.id, status: nextStatus })
      } catch (err) {
        setError(err instanceof Error ? err.message : "同步项目状态失败")
      }
    }

    void run()
  }, [progress.total, progress.value, project])

  useEffect(() => {
    // 监听外部更新广播，保证项目详情和全局 Tasks 页之间的数据是同一份。
    const refreshFromBroadcast = () => {
      void refreshAll()
    }

    window.addEventListener("hora:db-updated", refreshFromBroadcast)
    return () => {
      window.removeEventListener("hora:db-updated", refreshFromBroadcast)
    }
  }, [projectId])

  const requirementDoneMap = useMemo(() => {
    const nextMap = new Map<string, boolean>()
    for (const requirement of requirements) {
      const requirementTasks = tasks.filter((task) => task.requirementId === requirement.id)
      nextMap.set(
        requirement.id,
        requirementTasks.length > 0 && requirementTasks.every((task) => task.isCompleted === 1 || task.status === "done"),
      )
    }
    return nextMap
  }, [requirements, tasks])

  const availableNoteTree = useMemo(() => {
    // 弹窗里需要目录层级，但关联只允许勾选 file 节点。
    const linkedIds = new Set(linkedNotes.map((note) => note.id))
    return buildNoteTree(noteNodes.filter((note) => note.nodeType === "folder" || !linkedIds.has(note.id)))
  }, [linkedNotes, noteNodes])

  const sortedRequirements = useMemo(() => {
    return sortRequirementsForDisplay(requirements, requirementDoneMap, tasks)
  }, [requirementDoneMap, requirements, tasks])

  const requirementOrderMap = useMemo(() => {
    return new Map(sortedRequirements.map((row, index) => [row.id, index]))
  }, [sortedRequirements])

  const sortedTasks = useMemo(() => {
    return sortTasksForDisplay(tasks, requirementOrderMap)
  }, [requirementOrderMap, tasks])

  const filteredTasks = useMemo(() => {
    // 任务模式按任务字段过滤；需求模式则由命中的需求反查任务，保持两侧联动。
    if (viewMode === "task") {
      return sortedTasks.filter((task) => {
        const statusMatched = statusFilter === "all" || task.status === statusFilter
        const priorityMatched = priorityFilter === "all" || task.priority === priorityFilter
        return statusMatched && priorityMatched
      })
    }

    const visibleRequirementIds = new Set(
      sortedRequirements
        .filter((requirement) => {
          const statusMatched = statusFilter === "all" || requirement.status === statusFilter
          const priorityMatched = priorityFilter === "all" || requirement.priority === priorityFilter
          return statusMatched && priorityMatched
        })
        .map((requirement) => requirement.id),
    )
    if (statusFilter === "all" && priorityFilter === "all") return sortedTasks
    return sortedTasks.filter((task) => task.requirementId && visibleRequirementIds.has(task.requirementId))
  }, [priorityFilter, sortedRequirements, sortedTasks, statusFilter, viewMode])

  const filteredRequirements = useMemo(() => {
    // 需求模式按需求字段过滤；任务模式则展示命中任务关联到的需求。
    if (viewMode === "requirement") {
      return sortedRequirements.filter((requirement) => {
        const statusMatched = statusFilter === "all" || requirement.status === statusFilter
        const priorityMatched = priorityFilter === "all" || requirement.priority === priorityFilter
        return statusMatched && priorityMatched
      })
    }

    if (statusFilter !== "all" || priorityFilter !== "all") {
      const visibleRequirementIds = new Set(filteredTasks.map((task) => task.requirementId).filter(Boolean))
      return sortedRequirements.filter((requirement) => visibleRequirementIds.has(requirement.id))
    }

    return sortedRequirements
  }, [filteredTasks, priorityFilter, sortedRequirements, statusFilter, viewMode])

  const activeStatusText = viewMode === "task" ? TASK_STATUS_TEXT : REQUIREMENT_STATUS_TEXT

  const boardHeight = useMemo(() => {
    // 需求列决定画布高度，任务更多时右侧列表在同一高度内滚动。
    const rowHeight = 64
    const titleHeight = 92
    return Math.min(Math.max(filteredRequirements.length * rowHeight + titleHeight, 360), 760)
  }, [filteredRequirements.length])

  useEffect(() => {
    if (exportNoticeState !== "visible") return

    // 导出成功提醒先停留，再淡出，完整生命周期约 2 秒。
    const fadeTimer = window.setTimeout(() => setExportNoticeState("hiding"), 1500)
    const removeTimer = window.setTimeout(() => setExportNoticeState("hidden"), 2000)
    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(removeTimer)
    }
  }, [exportNoticeState])

  const updateConnectionLines = () => {
    const hostRect = lineHostRef.current?.getBoundingClientRect()
    if (!hostRect) return

    const nextLines: ConnectionLine[] = []
    const visibleRequirementIds = new Set(filteredRequirements.map((row) => row.id))
    for (const task of filteredTasks) {
      if (!task.requirementId) continue
      if (!visibleRequirementIds.has(task.requirementId)) continue
      const requirementEl = requirementNodeRefs.current[task.requirementId]
      const taskEl = taskNodeRefs.current[task.id]
      const requirement = filteredRequirements.find((row) => row.id === task.requirementId)
      if (!requirementEl || !taskEl || !requirement) continue

      const requirementRect = requirementEl.getBoundingClientRect()
      const taskRect = taskEl.getBoundingClientRect()
      nextLines.push({
        id: `${task.requirementId}:${task.id}`,
        x1: requirementRect.right - hostRect.left,
        y1: requirementRect.top - hostRect.top + requirementRect.height / 2,
        x2: taskRect.left - hostRect.left,
        y2: taskRect.top - hostRect.top + taskRect.height / 2,
        color: requirement.color || "#8AA8E8",
      })
    }
    setConnectionLines(nextLines)
  }

  useEffect(() => {
    updateConnectionLines()
    window.addEventListener("resize", updateConnectionLines)
    return () => window.removeEventListener("resize", updateConnectionLines)
  }, [filteredRequirements, filteredTasks])

  const openCreateRequirement = () => {
    setRequirementForm({ id: "", title: "", description: "", status: "todo", priority: "normal", color: COLOR_OPTIONS[0] })
  }

  const openEditRequirement = (requirement: RequirementRecord) => {
    setRequirementForm({
      id: requirement.id,
      title: requirement.title,
      description: requirement.description || "",
      status: requirement.status,
      priority: requirement.priority,
      color: requirement.color || COLOR_OPTIONS[0],
    })
  }

  const openCreateTask = () => {
    setTaskForm({
      id: "",
      title: "",
      description: "",
      status: "todo",
      priority: "normal",
      color: COLOR_OPTIONS[0],
      requirementId: "",
      startedAt: "",
      dueAt: "",
      completedAt: "",
    })
  }

  const openEditTask = (task: TaskRecord) => {
    setTaskForm({
      id: task.id,
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      color: task.color || COLOR_OPTIONS[0],
      requirementId: task.requirementId || "",
      startedAt: task.startedAt || "",
      dueAt: task.dueAt || "",
      completedAt: task.completedAt || "",
    })
  }

  const handleUpdateProjectField = async (field: "description" | "status" | "priority" | "startedAt" | "dueAt" | "completedAt", value: string) => {
    if (!project) return
    try {
      setError(null)
      await updateProject({ id: project.id, [field]: value })
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新项目失败")
    }
  }

  const handleSaveRequirement = async () => {
    const title = requirementForm.title.trim()
    if (!title || !projectId) return
    try {
      setError(null)
      if (requirementForm.id) {
        await updateRequirement({ ...requirementForm, id: requirementForm.id, description: requirementForm.description || null })
      } else {
        await createRequirement({ projectId, ...requirementForm, description: requirementForm.description || undefined })
      }
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存需求失败")
    }
  }

  const handleSaveTask = async () => {
    const title = taskForm.title.trim()
    if (!title || !projectId) return
    try {
      setError(null)
      const payload = {
        title,
        description: taskForm.description || undefined,
        status: taskForm.status,
        priority: taskForm.priority,
        color: taskForm.color,
        requirementId: taskForm.requirementId || null,
        startedAt: taskForm.startedAt || null,
        dueAt: taskForm.dueAt || null,
        completedAt: taskForm.completedAt || null,
      }
      if (taskForm.id) {
        await updateTask({ id: taskForm.id, ...payload })
      } else {
        await createTask({ projectId, ...payload })
      }
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败")
    }
  }

  const handleSaveBatch = async () => {
    if (!projectId) return
    const rows = parseBatchText(batchText)
    if (rows.length === 0) return

    try {
      setError(null)
      for (const [index, row] of rows.entries()) {
        const requirement = await createRequirement({
          projectId,
          title: row.title,
          description: row.description,
          status: "todo",
          priority: "normal",
          color: COLOR_OPTIONS[index % COLOR_OPTIONS.length],
        })
        if (!requirement?.id) continue
        for (const taskTitle of row.tasks) {
          await createTask({
            projectId,
            requirementId: requirement.id,
            title: taskTitle,
            priority: "normal",
            color: requirement.color || COLOR_OPTIONS[index % COLOR_OPTIONS.length],
          })
        }
      }
      setBatchText("")
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "批量创建失败")
    }
  }

  const handleLinkSelectedNotes = async () => {
    if (selectedNoteIds.length === 0 || !projectId) return
    try {
      setError(null)
      for (const noteId of selectedNoteIds) {
        await linkNoteToProject(noteId, projectId)
      }
      setSelectedNoteIds([])
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "关联笔记失败")
    }
  }

  const toggleSelectedNote = (noteId: string) => {
    // 多选状态仅在弹窗内使用，确认后才真正写入关联表。
    setSelectedNoteIds((prev) => (
      prev.includes(noteId)
        ? prev.filter((id) => id !== noteId)
        : [...prev, noteId]
    ))
  }

  const openLinkedNote = (noteId: string) => {
    // 加 open 时间戳强制 Notes 页识别为一次新的打开动作，避免复用空白状态。
    router.push(`/notes/${noteId}?open=${Date.now()}`)
  }

  const handleUnlinkNote = async (noteId: string) => {
    if (!projectId) return
    try {
      setError(null)
      await unlinkNoteFromProject(noteId, projectId)
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "取消关联失败")
    }
  }

  const flashLines = (lineIds: string[]) => {
    setHighlightedLineIds(lineIds)
    window.setTimeout(() => setHighlightedLineIds([]), 900)
  }

  const handleFlashRequirement = (requirementId: string) => {
    flashLines(connectionLines.filter((line) => line.id.startsWith(`${requirementId}:`)).map((line) => line.id))
  }

  const handleFlashTask = (task: TaskRecord) => {
    if (!task.requirementId) return
    flashLines([`${task.requirementId}:${task.id}`])
  }

  useEffect(() => {
    if (!focusTarget) return

    const targetEl =
      focusTarget.kind === "requirement"
        ? requirementNodeRefs.current[focusTarget.id]
        : taskNodeRefs.current[focusTarget.id]

    if (!targetEl) return

    const timer = window.setTimeout(() => {
      // 先滚到目标，再亮一下关联线，方便从 dashboard 一眼找到对应内容。
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" })
      if (focusTarget.kind === "requirement") {
        handleFlashRequirement(focusTarget.id)
        setFocusTarget(null)
        return
      }

      const task = tasks.find((row) => row.id === focusTarget.id)
      if (task) {
        handleFlashTask(task)
        setFocusTarget(null)
      }
    }, 80)

    return () => window.clearTimeout(timer)
  }, [focusTarget, handleFlashRequirement, handleFlashTask, tasks])

  const handleExportProjectToNote = async () => {
    if (!project) return

    const markdown = buildProjectMarkdown(project, requirements, tasks)
    try {
      setError(null)
      const note = await createNoteNode({
        parentId: null,
        nodeType: "file",
        fileKind: "markdown",
        title: project.title,
      })
      if (!note?.id) throw new Error("导出文件创建失败")

      await saveNoteContent({ noteId: note.id, content: markdown })
      await linkNoteToProject(note.id, project.id)
      setExportNoticeState("visible")
      await refreshAll()
    } catch (err) {
      setError(err instanceof Error ? err.message : "导出文件失败")
    }
  }

  const handleRequirementDrop = async (targetId: string) => {
    if (!draggedRequirementId || draggedRequirementId === targetId || !projectId) return
    const nextRows = moveRowToTarget(sortedRequirements, draggedRequirementId, targetId)
    setDraggedRequirementId(null)
    if (!nextRows) return
    setRequirements(nextRows.map((row, sortOrder) => ({ ...row, sortOrder })))
    await reorderRequirements({ projectId, items: nextRows.map((row, sortOrder) => ({ id: row.id, sortOrder })) })
    await refreshAll()
  }

  const handleTaskDrop = async (targetId: string) => {
    if (!draggedTaskId || draggedTaskId === targetId || !projectId) return
    const nextRows = moveRowToTarget(sortedTasks, draggedTaskId, targetId)
    setDraggedTaskId(null)
    if (!nextRows) return
    setTasks(nextRows.map((row, sortOrder) => ({ ...row, sortOrder })))
    await reorderTasks({ projectId, items: nextRows.map((row, sortOrder) => ({ id: row.id, sortOrder })) })
    await refreshAll()
  }

  const syncPanelScroll = (source: "requirements" | "tasks") => {
    const sourceEl = source === "requirements" ? requirementPanelRef.current : taskPanelRef.current
    const targetEl = source === "requirements" ? taskPanelRef.current : requirementPanelRef.current
    if (!sourceEl || !targetEl || syncingScrollRef.current) return

    const sourceMax = sourceEl.scrollHeight - sourceEl.clientHeight
    const targetMax = targetEl.scrollHeight - targetEl.clientHeight
    const ratio = sourceMax <= 0 ? 0 : sourceEl.scrollTop / sourceMax
    syncingScrollRef.current = true
    targetEl.scrollTop = targetMax * ratio
    requestAnimationFrame(() => {
      syncingScrollRef.current = false
      updateConnectionLines()
    })
  }

  if (!project) {
    return <main className="w-full p-6 text-sm text-muted-foreground md:p-8">正在加载项目...</main>
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] w-full flex-col gap-3 overflow-hidden pt-1">
      <header className="flex shrink-0 flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <Link
            href="/projects?list=1"
            className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            onClick={() => {
              // 返回一级时明确写入“下次进入项目模块先看列表”的意图。
              saveProjectsListSnapshot()
            }}
          >
            <ArrowLeft className="size-4" />
            返回上一级
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
          <div className="mt-3 flex max-w-full flex-wrap items-center gap-2 md:gap-3">
            <Input
              className="min-w-[220px] flex-1"
              value={project.description || ""}
              onChange={(event) => setProject({ ...project, description: event.target.value })}
              onBlur={(event) => void handleUpdateProjectField("description", event.target.value)}
              placeholder="项目描述"
            />
            <div className="flex items-center gap-2">
              <Label className="shrink-0 text-xs text-muted-foreground" htmlFor="project-switcher">
                项目切换
              </Label>
              <Select
                value={project.id}
                onValueChange={(value) => {
                  if (value && value !== project.id) {
                    // 切换项目后仍然保持在详情入口语义，方便从模块外再次回来时继续看项目详情。
                    saveProjectsDetailSnapshot(value, layoutMode)
                    router.push(`/projects/${value}?view=${layoutMode}`)
                  }
                }}
              >
                <SelectTrigger id="project-switcher" className="h-9 w-48">
                  <SelectValue placeholder="切换项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 md:justify-end">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline">
                <Wand2 className="size-4" />
                快速编辑
              </Button>
            </DialogTrigger>
            <BatchDialog
              value={batchText}
              onValueChange={setBatchText}
              onSave={handleSaveBatch}
            />
          </Dialog>
          <Button type="button" variant="outline" onClick={() => void handleExportProjectToNote()}>
            <FileDown className="size-4" />
            导出文件
          </Button>
          <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as "task" | "requirement")} className="w-auto">
            <TabsList className="grid h-9 w-40 grid-cols-2">
              <TabsTrigger value="requirement">需求</TabsTrigger>
              <TabsTrigger value="task">任务</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            value={statusFilter === "all" ? ALL_FILTER_VALUE : statusFilter}
            onValueChange={(value) =>
              setStatusFilter(value === ALL_FILTER_VALUE ? "all" : (value as TaskStatus | RequirementStatus))
            }
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder={`全部${viewMode === "task" ? "任务" : "需求"}状态`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部{viewMode === "task" ? "任务" : "需求"}状态</SelectItem>
              {Object.entries(activeStatusText).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter === "all" ? ALL_FILTER_VALUE : priorityFilter}
            onValueChange={(value) => setPriorityFilter(value === ALL_FILTER_VALUE ? "all" : (value as Priority))}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="全部紧急程度" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部紧急程度</SelectItem>
              {Object.entries(PRIORITY_TEXT).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {exportNoticeState !== "hidden" ? (
        <Alert className={exportNoticeState === "hiding"
          ? "fixed right-6 top-20 z-50 w-[320px] opacity-0 shadow-lg transition-opacity duration-500"
          : "fixed right-6 top-20 z-50 w-[320px] opacity-100 shadow-lg transition-opacity duration-500"
        }>
          <Info className="size-4" />
          <AlertTitle>导出成功</AlertTitle>
          <AlertDescription>项目内容已导出到 Notes，并自动关联到当前项目。</AlertDescription>
        </Alert>
      ) : null}

      <Card className="shrink-0">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 px-4 py-3">
          <div className="space-y-1">
            <CardTitle className="text-sm">整体进度</CardTitle>
            <p className="text-xs text-muted-foreground">当前项目完成情况和任务覆盖率。</p>
          </div>
          <Badge variant="secondary" className="shrink-0">
            {progress.completed}/{progress.total} · {progress.value}%
          </Badge>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <Progress
            value={progress.value}
            className="[&_[data-slot=progress-indicator]]:bg-[linear-gradient(90deg,#8AA8E8_0%,#E2B36B_30%,#E8C57A_60%,#8CC9A1_100%)]"
          />
        </CardContent>
      </Card>

      {layoutMode === "board" ? (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 px-4 pb-0 pt-4">
            <div>
              <CardTitle className="text-base">卡片视图</CardTitle>
              <p className="text-xs text-muted-foreground">按需求分列展示任务卡片，适合看每个列里的待办。</p>
            </div>
            <Button type="button" variant="outline" onClick={() => void handleSaveBatch()}>
              快速编辑
            </Button>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4">
            {/* 卡片视图把需求展开成列，外层滚动，列内再滚动任务，避免把整页撑长。 */}
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid min-w-max gap-4 pb-1 [grid-auto-flow:column] [grid-auto-columns:minmax(320px,320px)]">
                {filteredRequirements.map((requirement) => {
                  const requirementTasks = sortTasksForDisplay(
                    filteredTasks.filter((task) => task.requirementId === requirement.id),
                    requirementOrderMap,
                  )
                  return (
                    <Card key={requirement.id} className="flex h-full min-h-[420px] flex-col overflow-hidden border-border/70 bg-muted/30 p-3 shadow-sm">
                      <div className="mb-3 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{requirement.title}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge variant="outline" className={cn("border", getStatusToneClassName(requirement.status))}>
                              {REQUIREMENT_STATUS_TEXT[requirement.status]}
                            </Badge>
                            <Badge variant="outline" className={cn("border", getPriorityToneClassName(requirement.priority))}>
                              {PRIORITY_TEXT[requirement.priority]}
                            </Badge>
                            <Badge variant="muted">{requirementTasks.length} 个任务</Badge>
                          </div>
                        </div>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button type="button" size="icon-sm" variant="outline" onClick={() => openEditRequirement(requirement)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          </DialogTrigger>
                          <RequirementDialog form={requirementForm} onFormChange={setRequirementForm} onSave={handleSaveRequirement} />
                        </Dialog>
                      </div>
                      <div className="mb-3 rounded-xl border border-dashed border-border bg-background p-2 text-xs text-muted-foreground">
                        <div className="flex items-center justify-between">
                          <span>开始 {project.startedAt || "未设置"}</span>
                          <span>结束 {project.dueAt || "未设置"}</span>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                        {requirementTasks.length === 0 ? (
                          <div className="rounded-xl border border-dashed border-border bg-background px-3 py-6 text-center text-sm text-muted-foreground">
                            还没有任务，先补一个吧。
                          </div>
                        ) : requirementTasks.map((task) => {
                          const done = task.isCompleted === 1 || task.status === "done"
                          return (
                            <Card key={task.id} className={done ? "border-emerald-200 bg-emerald-50/70 p-3 shadow-none" : "border-border/70 bg-background/80 p-3 shadow-none"}>
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className={done ? "truncate text-sm font-medium text-muted-foreground line-through" : "truncate text-sm font-medium"}>
                                    {task.title}
                                  </p>
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    <Badge variant="outline" className={cn("border", getStatusToneClassName(task.status))}>
                                      {TASK_STATUS_TEXT[task.status]}
                                    </Badge>
                                    <Badge variant="outline" className={cn("border", getPriorityToneClassName(task.priority))}>
                                      {PRIORITY_TEXT[task.priority]}
                                    </Badge>
                                  </div>
                                </div>
                                <TaskStateToggle task={task} onToggle={async (_task, nextDone) => {
                                  await updateTaskStatus({ id: task.id, done: nextDone })
                                  await refreshAll()
                                }} onStatusChange={async (_task, status) => {
                                  await updateTaskStatus({ id: task.id, status })
                                  await refreshAll()
                                }} />
                              </div>
                              <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                <span>开始 {task.startedAt || "-"}</span>
                                <span>计划 {task.dueAt || "-"}</span>
                              </div>
                            </Card>
                          )
                        })}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {layoutMode === "gantt" ? (
        <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <CardHeader className="px-4 pb-0 pt-4">
          {/* 甘特视图强调时间线，方便快速看每个需求/任务的周期。 */}
            <CardTitle className="text-base">甘特视图</CardTitle>
            <p className="text-xs text-muted-foreground">根据任务开始和计划结束日期生成时间条，适合看项目周期。</p>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-4 pt-4">
            {/* 甘特视图也放进固定滚动区，避免长列表把整页撑开。 */}
            <div className="min-h-0 flex-1 overflow-auto">
              <SimpleGantt project={project} requirements={filteredRequirements} tasks={filteredTasks} />
            </div>
          </CardContent>
        </Card>
      ) : null}
      <div className={layoutMode === "list" ? "min-h-0 flex-1 overflow-y-auto pr-1" : "hidden"}>
        <section
          ref={lineHostRef}
          className="relative grid gap-4 overflow-hidden xl:grid-cols-[minmax(260px,0.9fr)_minmax(60px,80px)_minmax(360px,1.4fr)]"
          style={{ height: `${boardHeight}px` }}
        >
          <svg className="pointer-events-none absolute inset-0 z-0 hidden h-full w-full xl:block">
            {connectionLines.map((line) => (
              <path
                key={line.id}
                d={`M ${line.x1} ${line.y1} C ${(line.x1 + line.x2) / 2} ${line.y1}, ${(line.x1 + line.x2) / 2} ${line.y2}, ${line.x2} ${line.y2}`}
                fill="none"
                stroke={line.color}
                strokeOpacity={highlightedLineIds.includes(line.id) ? "0.95" : "0.45"}
                strokeWidth={highlightedLineIds.includes(line.id) ? "4" : "2"}
                className={highlightedLineIds.includes(line.id) ? "drop-shadow-[0_0_6px_rgba(59,130,246,0.35)]" : ""}
              />
            ))}
          </svg>
          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
            <PanelTitle title="需求" buttonText="新建需求" onCreate={openCreateRequirement}>
              <RequirementDialog form={requirementForm} onFormChange={setRequirementForm} onSave={handleSaveRequirement} />
            </PanelTitle>
            <div
              ref={requirementPanelRef}
              onScroll={() => syncPanelScroll("requirements")}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto pr-1"
            >
              <RequirementList
                rows={filteredRequirements}
                doneMap={requirementDoneMap}
                nodeRefs={requirementNodeRefs}
                draggedId={draggedRequirementId}
                onDragStart={setDraggedRequirementId}
                onDrop={handleRequirementDrop}
                onFlash={handleFlashRequirement}
                onEdit={openEditRequirement}
                onDelete={async (id) => {
                  await deleteRequirement(id)
                  await refreshAll()
                }}
                dialogForm={requirementForm}
                onFormChange={setRequirementForm}
                onSave={handleSaveRequirement}
              />
            </div>
            </CardContent>
          </Card>

          <div className="hidden xl:block" />

          <Card className="flex min-h-0 flex-col overflow-hidden">
            <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-4">
            <PanelTitle title="任务" buttonText="新建任务" onCreate={openCreateTask}>
              <TaskDialog
                form={taskForm}
                requirements={requirements}
                onFormChange={setTaskForm}
                onSave={handleSaveTask}
              />
            </PanelTitle>
            <div
              ref={taskPanelRef}
              onScroll={() => syncPanelScroll("tasks")}
              className="relative z-10 min-h-0 flex-1 overflow-y-auto pr-1"
            >
              <TaskList
                rows={filteredTasks}
                requirements={requirements}
                nodeRefs={taskNodeRefs}
                draggedId={draggedTaskId}
                onDragStart={setDraggedTaskId}
                onDrop={handleTaskDrop}
                onFlash={handleFlashTask}
                onEdit={openEditTask}
                onToggle={async (task, done) => {
                  await updateTaskStatus({ id: task.id, done })
                  await refreshAll()
                }}
                onDelete={async (id) => {
                  await deleteTask(id)
                  await refreshAll()
                }}
                dialogForm={taskForm}
                onFormChange={setTaskForm}
                onSave={handleSaveTask}
              />
            </div>
            </CardContent>
          </Card>
        </section>

        <Card className="mt-3">
          <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 px-4 pt-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <LinkIcon className="size-4" />
              关联笔记
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <Button type="button" variant="outline">
                  选择笔记
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>选择关联笔记</DialogTitle>
                  <DialogDescription>按目录结构勾选一个或多个文件，确认后再写入项目关联。</DialogDescription>
                </DialogHeader>
                <div className="max-h-[360px] overflow-y-auto rounded-md border border-border p-2">
                  <NotePickerTree
                    rows={availableNoteTree}
                    selectedIds={selectedNoteIds}
                    onToggle={toggleSelectedNote}
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" onClick={() => setSelectedNoteIds([])}>
                      取消
                    </Button>
                  </DialogClose>
                  <DialogClose asChild>
                    <Button type="button" onClick={() => void handleLinkSelectedNotes()} disabled={selectedNoteIds.length === 0}>
                      确认关联 {selectedNoteIds.length > 0 ? `(${selectedNoteIds.length})` : ""}
                    </Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
          {linkedNotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无关联笔记。</p>
          ) : (
            <div className="space-y-2">
              {linkedNotes.map((note) => (
                <div key={note.id} className="flex items-center justify-between rounded-lg border bg-background px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openLinkedNote(note.id)}
                      className="block max-w-full truncate text-left font-medium hover:underline"
                    >
                      {note.title}
                    </button>
                    <span className="block truncate text-xs text-muted-foreground">{note.filePath}</span>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => void handleUnlinkNote(note.id)}>
                    取消关联
                  </Button>
                </div>
              ))}
            </div>
          )}
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function moveRowToTarget<T extends { id: string }>(rows: T[], sourceId: string, targetId: string) {
  const sourceIndex = rows.findIndex((row) => row.id === sourceId)
  const targetIndex = rows.findIndex((row) => row.id === targetId)
  if (sourceIndex < 0 || targetIndex < 0) return null
  const nextRows = [...rows]
  const [row] = nextRows.splice(sourceIndex, 1)
  nextRows.splice(targetIndex, 0, row)
  return nextRows
}

function sortTasksForDisplay(rows: TaskRecord[], requirementOrderMap: Map<string, number> = new Map()) {
  // 任务先按需求位置，再按进行中和紧急程度排序，最后沿用原始顺序兜底。
  return [...rows].sort((a, b) => {
    const aRequirementOrder = a.requirementId ? requirementOrderMap.get(a.requirementId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    const bRequirementOrder = b.requirementId ? requirementOrderMap.get(b.requirementId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
    if (aRequirementOrder !== bRequirementOrder) return aRequirementOrder - bRequirementOrder

    return compareByStatusThenPriority(a, b)
  })
}

function sortRequirementsForDisplay(
  rows: RequirementRecord[],
  doneMap: Map<string, boolean>,
  tasks: TaskRecord[],
) {
  // 需求优先按进行中和紧急程度排序，再把已完成的需求放后面。
  return [...rows].sort((a, b) => {
    const aDone = doneMap.get(a.id) === true
    const bDone = doneMap.get(b.id) === true
    if (aDone !== bDone) return aDone ? 1 : -1
    return compareByStatusThenPriority(a, b)
  })
}

function getTaskRowClassName(task: TaskRecord) {
  if (task.status === "cancelled") return "bg-muted/60"
  if (task.status === "doing") return "bg-slate-50/80"
  if (task.status === "done" || task.isCompleted === 1) return "bg-emerald-50/70"
  return ""
}

function TaskStateToggle(props: {
  task: TaskRecord
  onToggle: (row: TaskRecord, done: boolean) => Promise<void>
  onStatusChange?: (row: TaskRecord, status: TaskStatus) => Promise<void>
}) {
  const done = props.task.isCompleted === 1 || props.task.status === "done"
  const cancelled = props.task.status === "cancelled"

  if (cancelled) {
    return (
      <button
        type="button"
        aria-label="取消状态"
        className="flex size-4 items-center justify-center rounded-[4px] border border-border bg-muted text-muted-foreground"
        onClick={() => void (props.onStatusChange ? props.onStatusChange(props.task, "todo") : props.onToggle(props.task, false))}
      >
        <X className="size-3" />
      </button>
    )
  }

  return (
    <button
      type="button"
      aria-label={done ? "取消完成" : "完成任务"}
      onClick={() => void props.onToggle(props.task, !done)}
      className={done
        ? "flex size-4 items-center justify-center rounded-[4px] border border-sky-300 bg-sky-100 text-sky-700"
        : "size-4 rounded-[4px] border border-input bg-background"
      }
    >
      {done ? <Check className="size-3" /> : null}
    </button>
  )
}

function parseBatchText(text: string) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawTitle, ...taskParts] = line.split(/\s*[:：|]\s*/)
      const tasks = taskParts
        .join(",")
        .split(/[,，、]/)
        .map((task) => task.trim())
        .filter(Boolean)
      return { title: rawTitle.trim(), description: "", tasks }
    })
    .filter((row) => row.title)
}

function buildProjectMarkdown(project: ProjectRecord, requirements: RequirementRecord[], tasks: TaskRecord[]) {
  const lines = [`# ${project.title}`, ""]

  for (const requirement of requirements) {
    const requirementTasks = tasks.filter((task) => task.requirementId === requirement.id)
    lines.push(`## ${requirement.title}`, "")
    lines.push(requirement.description || "描述")
    lines.push("")

    for (const task of requirementTasks) {
      lines.push(task.title)
      if (task.description) {
        lines.push(task.description)
      }
      lines.push("")
    }
  }

  const directTasks = tasks.filter((task) => !task.requirementId)
  if (directTasks.length > 0) {
    lines.push("## 未归属需求", "")
    lines.push("描述")
    lines.push("")
    for (const task of directTasks) {
      lines.push(task.title)
      if (task.description) {
        lines.push(task.description)
      }
      lines.push("")
    }
  }

  return lines.join("\n").trimEnd() + "\n"
}

function buildNoteTree(rows: NoteNodeRow[]) {
  // 只在前端组装父子关系，避免对 note_nodes 做任何结构迁移。
  const nodeMap = new Map<string, NoteTreeNode>()
  for (const row of rows) {
    nodeMap.set(row.id, { ...row, children: [] })
  }

  const roots: NoteTreeNode[] = []
  for (const node of nodeMap.values()) {
    const parent = node.parentId ? nodeMap.get(node.parentId) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortTree = (nodes: NoteTreeNode[]) => {
    // 文件夹排在文件前面，并保持同层级标题稳定排序。
    nodes.sort((a, b) => {
      if (a.nodeType !== b.nodeType) return a.nodeType === "folder" ? -1 : 1
      return a.title.localeCompare(b.title)
    })
    nodes.forEach((node) => sortTree(node.children))
  }

  sortTree(roots)
  return roots
}

function NotePickerTree(props: {
  rows: NoteTreeNode[]
  selectedIds: string[]
  onToggle: (id: string) => void
  depth?: number
}) {
  const depth = props.depth ?? 0

  if (props.rows.length === 0 && depth === 0) {
    return <p className="px-2 py-3 text-sm text-muted-foreground">暂无可关联的笔记文件。</p>
  }

  return (
    <div className={depth === 0 ? "space-y-1" : "space-y-1"}>
      {props.rows.map((row) => {
        const isFile = row.nodeType === "file"
        return (
          <div key={row.id}>
            <div
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/50"
              style={{ paddingLeft: `${8 + depth * 16}px` }}
            >
              {isFile ? (
                <Checkbox
                  checked={props.selectedIds.includes(row.id)}
                  onCheckedChange={() => props.onToggle(row.id)}
                  aria-label={`选择笔记 ${row.title}`}
                />
              ) : (
                <span className="size-4 rounded border border-transparent" />
              )}
              <span title={row.title} className={isFile ? "truncate" : "truncate font-medium text-foreground/80"}>
                {isFile ? "[文件]" : "[目录]"} {row.title}
              </span>
            </div>
            {row.children.length > 0 ? (
              <NotePickerTree
                rows={row.children}
                selectedIds={props.selectedIds}
                onToggle={props.onToggle}
                depth={depth + 1}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function PanelTitle(props: { title: string; buttonText: string; onCreate: () => void; children: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-base font-semibold">{props.title}</h2>
      <Dialog>
        <DialogTrigger asChild>
          <Button type="button" size="sm" onClick={props.onCreate}>
            <Plus className="size-4" />
            {props.buttonText}
          </Button>
        </DialogTrigger>
        {props.children}
      </Dialog>
    </div>
  )
}

// 删除按钮统一走确认弹窗，避免误删项目层级数据。
function ConfirmDeleteButton(props: {
  title: string
  description: string
  onConfirm: () => Promise<void>
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" size="icon-sm" variant="outline">
          <Trash2 className="size-3.5" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={() => void props.onConfirm()}>确认删除</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RequirementList(props: {
  rows: RequirementRecord[]
  doneMap: Map<string, boolean>
  nodeRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  draggedId: string | null
  onDragStart: (id: string | null) => void
  onDrop: (id: string) => Promise<void>
  onFlash: (id: string) => void
  onEdit: (row: RequirementRecord) => void
  onDelete: (id: string) => Promise<void>
  dialogForm: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <div className="space-y-2">
      {props.rows.map((row) => {
        const done = props.doneMap.get(row.id) === true
        return (
          <Card
            key={row.id}
            ref={(node) => {
              props.nodeRefs.current[row.id] = node
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void props.onDrop(row.id)}
            className={cn(
              "p-0 transition-colors",
              done ? "border-emerald-200 bg-emerald-50/70" : "bg-background"
            )}
          >
            <div className="flex items-center gap-3 px-3 py-3 text-sm">
              <button
                type="button"
                aria-label={`高亮需求 ${row.title} 的连线`}
                onClick={() => props.onFlash(row.id)}
                className="size-3 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-ring/30"
                style={{ backgroundColor: done ? "#8CC9A1" : row.color || "#8AA8E8" }}
              />
              <div className="min-w-0 flex-1">
                <p title={row.title} className={done ? "truncate font-medium text-muted-foreground line-through" : "truncate font-medium"}>
                  {row.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className={cn("border", getStatusToneClassName(row.status))}>
                    {done ? "已完成" : REQUIREMENT_STATUS_TEXT[row.status]}
                  </Badge>
                  <Badge variant="outline" className={cn("border", getPriorityToneClassName(row.priority))}>
                    {PRIORITY_TEXT[row.priority]}
                  </Badge>
                </div>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" size="icon-sm" variant="outline" onClick={() => props.onEdit(row)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </DialogTrigger>
                <RequirementDialog form={props.dialogForm} onFormChange={props.onFormChange} onSave={props.onSave} />
              </Dialog>
              <ConfirmDeleteButton
                title="确认删除需求？"
                description="删除需求会同时删除它下面的任务。该操作会软删除数据，不会影响 Notes 文件。"
                onConfirm={() => props.onDelete(row.id)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                draggable
                aria-label={`拖动需求 ${row.title}`}
                onDragStart={() => props.onDragStart(row.id)}
                onDragEnd={() => props.onDragStart(null)}
                className={cn(
                  "shrink-0 border border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  props.draggedId === row.id && "cursor-grabbing bg-muted"
                )}
              >
                <GripVertical className="size-4" />
              </Button>
            </div>
          </Card>
        )
      })}
      {props.rows.length === 0 ? (
        <Empty className="rounded-xl border border-dashed bg-background py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plus className="size-4" />
            </EmptyMedia>
            <EmptyTitle>暂无需求</EmptyTitle>
            <EmptyDescription>先创建一个需求，再给它挂任务。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </div>
  )
}

function TaskList(props: {
  rows: TaskRecord[]
  requirements: RequirementRecord[]
  nodeRefs: MutableRefObject<Record<string, HTMLDivElement | null>>
  draggedId: string | null
  onDragStart: (id: string | null) => void
  onDrop: (id: string) => Promise<void>
  onFlash: (row: TaskRecord) => void
  onEdit: (row: TaskRecord) => void
  onToggle: (row: TaskRecord, done: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
  dialogForm: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    startedAt: string
    dueAt: string
    completedAt: string
  }
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    startedAt: string
    dueAt: string
    completedAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <div className="space-y-2">
      {props.rows.map((row) => {
        const done = row.isCompleted === 1 || row.status === "done"
        return (
          <Card
            key={row.id}
            ref={(node) => {
              props.nodeRefs.current[row.id] = node
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => void props.onDrop(row.id)}
            className={cn(
              "p-0 transition-colors",
              getTaskRowClassName(row) || "bg-background"
            )}
          >
            <div className="flex items-center gap-3 px-3 py-3 text-sm">
              <TaskStateToggle task={row} onToggle={props.onToggle} />
              <button
                type="button"
                aria-label={`高亮任务 ${row.title} 的连线`}
                onClick={() => props.onFlash(row)}
                className="size-3 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-ring/30"
                style={{ backgroundColor: row.color || "#8AA8E8" }}
              />
              <div className="min-w-0 flex-1">
                <p title={row.title} className={done ? "truncate font-medium text-muted-foreground line-through" : "truncate font-medium"}>
                  {row.title}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <Badge variant="outline" className={cn("border", getStatusToneClassName(row.status))}>
                    {TASK_STATUS_TEXT[row.status]}
                  </Badge>
                  <Badge variant="outline" className={cn("border", getPriorityToneClassName(row.priority))}>
                    {PRIORITY_TEXT[row.priority]}
                  </Badge>
                  <Badge variant="outline" className="border-border bg-background text-muted-foreground">
                    {row.requirementTitle || "无需求"}
                  </Badge>
                </div>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" size="icon-sm" variant="outline" onClick={() => props.onEdit(row)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </DialogTrigger>
                <TaskDialog form={props.dialogForm} requirements={props.requirements} onFormChange={props.onFormChange} onSave={props.onSave} />
              </Dialog>
              <ConfirmDeleteButton
                title="确认删除任务？"
                description="删除任务会将该任务从项目和全局 Tasks 视图中隐藏。该操作会软删除数据。"
                onConfirm={() => props.onDelete(row.id)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                draggable
                aria-label={`拖动任务 ${row.title}`}
                onDragStart={() => props.onDragStart(row.id)}
                onDragEnd={() => props.onDragStart(null)}
                className={cn(
                  "shrink-0 border border-border text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  props.draggedId === row.id && "cursor-grabbing bg-muted"
                )}
              >
                <GripVertical className="size-4" />
              </Button>
            </div>
          </Card>
        )
      })}
      {props.rows.length === 0 ? (
        <Empty className="rounded-xl border border-dashed bg-background py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plus className="size-4" />
            </EmptyMedia>
            <EmptyTitle>暂无任务</EmptyTitle>
            <EmptyDescription>先创建一个任务，或者调整筛选条件。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </div>
  )
}

function BatchDialog(props: {
  value: string
  onValueChange: (value: string) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>快速编辑</DialogTitle>
        <DialogDescription>每行一个需求，冒号或竖线后填写该需求下的多个任务。</DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="batch-requirements">批量内容</Label>
        <Textarea
          id="batch-requirements"
          value={props.value}
          onChange={(event) => props.onValueChange(event.target.value)}
          className="min-h-56 font-mono text-sm"
          placeholder={"登录模块: 登录表单, 忘记密码, 验证错误提示\n支付模块 | 创建订单, 支付回调, 退款入口"}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <DialogClose asChild><Button type="button" onClick={() => void props.onSave()}>批量创建</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function RequirementDialog(props: {
  form: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: RequirementStatus
    priority: Priority
    color: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.form.id ? "编辑需求" : "新建需求"}</DialogTitle>
        <DialogDescription>需求表示模块或要做什么，不是具体执行项。</DialogDescription>
      </DialogHeader>
      <EntityForm form={props.form} statusText={REQUIREMENT_STATUS_TEXT} onFormChange={props.onFormChange} />
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <DialogClose asChild><Button type="button" onClick={() => void props.onSave()}>保存</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function TaskDialog(props: {
  form: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    startedAt: string
    dueAt: string
    completedAt: string
  }
  requirements: RequirementRecord[]
  onFormChange: (form: {
    id: string
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    color: string
    requirementId: string
    startedAt: string
    dueAt: string
    completedAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.form.id ? "编辑任务" : "新建任务"}</DialogTitle>
        <DialogDescription>任务是真正的执行项，可选择归属需求。</DialogDescription>
      </DialogHeader>
      <EntityForm form={props.form} statusText={TASK_STATUS_TEXT} onFormChange={props.onFormChange} />
      <div className="space-y-2">
        <Label>所属需求</Label>
        <Select
          value={props.form.requirementId || ALL_FILTER_VALUE}
          onValueChange={(value) =>
            props.onFormChange({ ...props.form, requirementId: value === ALL_FILTER_VALUE ? "" : value })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="无需求" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FILTER_VALUE}>无需求</SelectItem>
            {props.requirements.map((requirement) => (
              <SelectItem key={requirement.id} value={requirement.id}>
                {requirement.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <DatePickerField
          id="project-task-started-at"
          label="开始日期"
          value={props.form.startedAt}
          onChange={(value) => props.onFormChange({ ...props.form, startedAt: value })}
        />
        <DatePickerField
          id="project-task-due-at"
          label="计划结束"
          value={props.form.dueAt}
          onChange={(value) => props.onFormChange({ ...props.form, dueAt: value })}
        />
        <DatePickerField
          id="project-task-completed-at"
          label="最终结束"
          value={props.form.completedAt}
          onChange={(value) => props.onFormChange({ ...props.form, completedAt: value })}
        />
      </div>
      <DialogFooter>
        <DialogClose asChild><Button type="button" variant="outline">取消</Button></DialogClose>
        <DialogClose asChild><Button type="button" onClick={() => void props.onSave()}>保存</Button></DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function SimpleGantt(props: {
  project: ProjectRecord
  requirements: RequirementRecord[]
  tasks: TaskRecord[]
}) {
  // 轻量甘特图：优先用项目和任务里的实际日期，缺失时回退到项目周期。
  const rows = props.requirements.map((requirement) => ({
    id: requirement.id,
    title: requirement.title,
    color: requirement.color || "#8AA8E8",
    items: props.tasks.filter((task) => task.requirementId === requirement.id),
  }))

  const dateValues = rows.flatMap((row) => row.items.flatMap((task) => [task.startedAt, task.dueAt, task.completedAt])).filter(Boolean) as string[]
  if (props.project.startedAt) dateValues.push(props.project.startedAt)
  if (props.project.dueAt) dateValues.push(props.project.dueAt)
  if (props.project.completedAt) dateValues.push(props.project.completedAt)

  const sortedDates = dateValues.sort()
  const startDate = parseDate(sortedDates[0] || props.project.startedAt || props.project.dueAt || todayISO())
  const endDate = parseDate(sortedDates.at(-1) || props.project.dueAt || props.project.completedAt || todayISO())
  const safeEndDate = endDate < startDate ? startDate : endDate
  const totalDays = Math.max(1, Math.ceil((safeEndDate.getTime() - startDate.getTime()) / DAY_MS) + 1)
  const dayColumns = Array.from({ length: Math.min(totalDays, 28) }, (_, index) => addDays(startDate, index))

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <div className="min-w-[760px] space-y-3">
          <div className="grid" style={{ gridTemplateColumns: `220px repeat(${dayColumns.length}, minmax(22px, 1fr))` }}>
            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">需求 / 任务</div>
            {dayColumns.map((day) => (
              <div key={day.toISOString()} className="px-1 py-2 text-center text-[11px] text-muted-foreground">
                {formatTimelineDay(day)}
              </div>
            ))}
          </div>

          {rows.map((row) => {
            const rowEntries =
              row.items.length > 0
                ? sortTasksForDisplay(row.items as TaskRecord[])
                : [{ id: `${row.id}:empty`, title: "暂无任务", startedAt: null, dueAt: null, completedAt: null, status: "todo", priority: "normal", isCompleted: 0 as 0 | 1 }]
            return (
                <div key={row.id} className="rounded-xl border border-border/70 bg-muted/20 p-2.5 shadow-sm">
                <div className="mb-2 flex items-center justify-between px-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{row.items.length} 个任务</p>
                  </div>
                  <span className="size-3 rounded-full" style={{ backgroundColor: row.color }} />
                </div>
                <div className="space-y-2">
                  {rowEntries.map((task) => {
                    const ganttTask = task as Pick<TaskRecord, "id" | "title" | "startedAt" | "dueAt" | "completedAt" | "status" | "priority" | "isCompleted">
                    const start = parseDate(ganttTask.startedAt || props.project.startedAt || startDate.toISOString())
                    const end = parseDate(ganttTask.dueAt || ganttTask.completedAt || ganttTask.startedAt || props.project.dueAt || props.project.completedAt || endDate.toISOString())
                    const safeStart = start < startDate ? startDate : start
                    const safeEnd = end < safeStart ? safeStart : end
                    const startIndex = Math.max(0, Math.floor((safeStart.getTime() - startDate.getTime()) / DAY_MS))
                    const span = Math.max(1, Math.floor((safeEnd.getTime() - safeStart.getTime()) / DAY_MS) + 1)
                    const done = ganttTask.isCompleted === 1 || ganttTask.status === "done"
                    const progressWidth = done ? 100 : Math.max(15, Math.min(100, Math.round((span / dayColumns.length) * 100)))
                    return (
                      <div key={ganttTask.id} className="rounded-lg border border-border/70 bg-background/80 p-3 shadow-none">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className={done ? "truncate text-sm font-medium text-muted-foreground line-through" : "truncate text-sm font-medium"}>{ganttTask.title}</p>
                            <div className="mt-1 flex flex-wrap gap-1 text-[11px]">
                              <Badge variant="outline" className={cn("border", getStatusToneClassName(ganttTask.status))}>
                                {done ? "已完成" : TASK_STATUS_TEXT[ganttTask.status]}
                              </Badge>
                              <Badge variant="outline" className={cn("border", getPriorityToneClassName(ganttTask.priority))}>
                                {PRIORITY_TEXT[ganttTask.priority]}
                              </Badge>
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {ganttTask.startedAt || "未开始"} → {ganttTask.dueAt || ganttTask.completedAt || "未结束"}
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border border-border/70 bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                            {done ? "已完成" : `${Math.max(1, span)} 天`}
                          </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${progressWidth}%`,
                              backgroundColor: done ? "#8CC9A1" : row.color,
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

type EntityFormState<TStatus extends string> = {
  title: string
  description: string
  status: TStatus
  priority: Priority
  color: string
}

function EntityForm<TStatus extends string, TForm extends EntityFormState<TStatus>>(props: {
  form: TForm
  statusText: Record<TStatus, string>
  onFormChange: (form: TForm) => void
}) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-2">
        <Label>标题</Label>
        <Input value={props.form.title} onChange={(event) => props.onFormChange({ ...props.form, title: event.target.value })} />
      </div>
      <div className="space-y-2">
        <Label>描述</Label>
        <Input value={props.form.description} onChange={(event) => props.onFormChange({ ...props.form, description: event.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>状态</Label>
          <Select
            value={props.form.status}
            onValueChange={(value) => props.onFormChange({ ...props.form, status: value as TStatus })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(props.statusText).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label as string}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>优先级</Label>
          <Select
            value={props.form.priority}
            onValueChange={(value) => props.onFormChange({ ...props.form, priority: value as Priority })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(PRIORITY_TEXT).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>颜色</Label>
        <div className="flex gap-2">
          {COLOR_OPTIONS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`选择颜色 ${color}`}
              onClick={() => props.onFormChange({ ...props.form, color })}
              className={props.form.color === color ? "size-7 rounded-full border-2 border-slate-400" : "size-7 rounded-full border border-border"}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`)
}

function addDays(date: Date, offset: number) {
  return new Date(date.getTime() + offset * DAY_MS)
}

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatTimelineDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}
