"use client"

// 全局 Tasks 页面：跨项目展示同一张 tasks 表中的执行项。

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Check, CheckCircle2, ChevronDown, Circle, Filter, Pencil, RotateCcw, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { DatePickerField } from "@/components/date-picker-field"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { saveProjectsDetailHref } from "@/lib/projects-navigation-state"
import {
  getPriorityToneClassName,
  getStatusToneClassName,
  PRIORITY_LABEL,
  TASK_STATUS_LABEL,
  compareByStatusThenPriority,
} from "@/lib/project-style"
import {
  listAllTasks,
  listProjects,
  listRequirementsByProject,
  updateTask,
  updateTaskStatus,
  type Priority,
  type ProjectRecord,
  type RequirementRecord,
  type TaskFilters,
  type TaskRecord,
  type TaskStatus,
} from "@/lib/hora-db"

const TASK_STATUS_TEXT = TASK_STATUS_LABEL
const PRIORITY_TEXT = PRIORITY_LABEL

const TASK_FILTER_STORAGE_KEY = "hora_tasks_filters"
const EMPTY_FILTERS: TaskFilters = {}
const ALL_FILTER_VALUE = "__all__"

export default function TasksPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [requirements, setRequirements] = useState<RequirementRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null)
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    status: "todo" as TaskStatus,
    priority: "normal" as Priority,
    startedAt: "",
    dueAt: "",
    completedAt: "",
  })
  const [error, setError] = useState<string | null>(null)

  const refreshTasks = async (nextFilters = filters) => {
    const rows = await listAllTasks(nextFilters)
    setTasks(sortTasksForDisplay(rows))
  }

  useEffect(() => {
    const run = async () => {
      try {
        setError(null)
        const savedFilters = loadSavedTaskFilters()
        setFilters(savedFilters)
        const projectRows = await listProjects()
        setProjects(projectRows)
        const requirementRows = (await Promise.all(projectRows.map((project) => listRequirementsByProject(project.id)))).flat()
        setRequirements(requirementRows)
        await refreshTasks(savedFilters)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载任务失败")
      }
    }

    void run()
  }, [])

  useEffect(() => {
    // 监听其它页面写入数据后的广播，保证 project / tasks 两边看到同一份最新状态。
    const refreshFromBroadcast = () => {
      void refreshTasks()
    }

    window.addEventListener("hora:db-updated", refreshFromBroadcast)

    return () => {
      window.removeEventListener("hora:db-updated", refreshFromBroadcast)
    }
  }, [refreshTasks])

  const visibleRequirements = useMemo(() => {
    if (!filters.projectId) return requirements
    return requirements.filter((requirement) => requirement.projectId === filters.projectId)
  }, [filters.projectId, requirements])

  const updateFilters = async (nextFilters: TaskFilters) => {
    const normalizedFilters = normalizeTaskFilters(nextFilters)
    setFilters(normalizedFilters)
    window.localStorage.setItem(TASK_FILTER_STORAGE_KEY, JSON.stringify(normalizedFilters))
    await refreshTasks(normalizedFilters)
  }

  const clearFilters = async () => {
    window.localStorage.removeItem(TASK_FILTER_STORAGE_KEY)
    await updateFilters(EMPTY_FILTERS)
  }

  const handleToggleDone = async (task: TaskRecord, done: boolean) => {
    try {
      setError(null)
      await updateTaskStatus({ id: task.id, done })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新任务失败")
    }
  }

  const handleChangeStatus = async (task: TaskRecord, status: TaskStatus) => {
    try {
      setError(null)
      await updateTask({ id: task.id, status, isCompleted: status === "done" })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "更新任务状态失败")
    }
  }

  const toggleStatusFilter = async (status: TaskStatus) => {
    const currentStatuses = filters.statuses || []
    const nextStatuses = currentStatuses.includes(status)
      ? currentStatuses.filter((item) => item !== status)
      : [...currentStatuses, status]
    await updateFilters({ ...filters, status: "", statuses: nextStatuses })
  }

  const openEditTask = (task: TaskRecord) => {
    setEditingTask(task)
    setTaskForm({
      title: task.title,
      description: task.description || "",
      status: task.status,
      priority: task.priority,
      startedAt: task.startedAt || "",
      dueAt: task.dueAt || "",
      completedAt: task.completedAt || "",
    })
  }

  const handleSaveTask = async () => {
    if (!editingTask) return
    const title = taskForm.title.trim()
    if (!title) return

    try {
      setError(null)
      await updateTask({
        id: editingTask.id,
        title,
        description: taskForm.description.trim() || null,
        status: taskForm.status,
        priority: taskForm.priority,
        startedAt: taskForm.startedAt || null,
        dueAt: taskForm.dueAt || null,
        completedAt: taskForm.completedAt || null,
        isCompleted: taskForm.status === "done",
      })
      await refreshTasks()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败")
    }
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden pt-1">
      <header className="shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
        <p className="mt-1 text-xs text-muted-foreground">跨项目执行视图，数据来自同一张 tasks 表。</p>
      </header>

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <section className="mt-3 shrink-0 rounded-xl border bg-card p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Filter className="size-3.5" />
            筛选
          </div>
          <Button type="button" size="xs" variant="outline" onClick={() => void clearFilters()}>
            <RotateCcw className="size-3.5" />
            清除选项
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <Select
            value={filters.projectId || ALL_FILTER_VALUE}
            onValueChange={(value) =>
              void updateFilters({
                ...filters,
                projectId: value === ALL_FILTER_VALUE ? undefined : value,
                requirementId: undefined,
              })
            }
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder="全部项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部项目</SelectItem>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={filters.requirementId || ALL_FILTER_VALUE}
            onValueChange={(value) =>
              void updateFilters({
                ...filters,
                requirementId: value === ALL_FILTER_VALUE ? undefined : value,
              })
            }
          >
            <SelectTrigger size="sm" className="w-full text-xs">
              <SelectValue placeholder="全部需求" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部需求</SelectItem>
              {visibleRequirements.map((requirement) => (
                <SelectItem key={requirement.id} value={requirement.id}>
                  {requirement.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-8 justify-between px-2 text-xs">
                {formatStatusFilter(filters.statuses)}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 text-xs">
              {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={(filters.statuses || []).includes(value as TaskStatus)}
                  onCheckedChange={() => void toggleStatusFilter(value as TaskStatus)}
                >
                  {label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Select
            value={filters.priority || ALL_FILTER_VALUE}
            onValueChange={(value) =>
              void updateFilters({
                ...filters,
                priority: value === ALL_FILTER_VALUE ? undefined : (value as Priority),
              })
            }
          >
              <SelectTrigger size="sm" className="w-full text-xs">
                <SelectValue placeholder="全部优先级" />
              </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_FILTER_VALUE}>全部优先级</SelectItem>
              {Object.entries(PRIORITY_TEXT).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <section className="mt-3 min-h-0 flex-1 overflow-y-auto rounded-xl border bg-card shadow-sm">
        <div className="sticky top-0 z-10 grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_1fr_0.8fr_1fr_0.5fr] border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
          <span>任务</span>
          <span>状态</span>
          <span>优先级</span>
          <span>项目</span>
          <span>需求</span>
          <span>截止</span>
          <span>更新时间</span>
          <span className="text-right">编辑</span>
        </div>

        {tasks.map((task) => {
          const done = task.isCompleted === 1 || task.status === "done"
          return (
            <article key={task.id} className="grid grid-cols-[1.5fr_0.8fr_0.8fr_1fr_1fr_0.8fr_1fr_0.5fr] items-center border-b px-4 py-3 text-sm last:border-b-0">
              <div className="flex min-w-0 items-center gap-3">
                <TaskStateToggle task={task} onToggle={handleToggleDone} onStatusChange={handleChangeStatus} />
                <span className="size-3 rounded-full border border-border" style={{ backgroundColor: task.color || "#8AA8E8" }} />
                <span className={done ? "truncate font-medium text-muted-foreground line-through" : "truncate font-medium"}>{task.title}</span>
              </div>
              <Select
                value={task.status}
                onValueChange={(value) => void handleChangeStatus(task, value as TaskStatus)}
              >
                <SelectTrigger size="sm" className={cn("w-28 text-xs", getStatusToneClassName(task.status))}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Badge variant="outline" className={getPriorityToneClassName(task.priority)}>
                {PRIORITY_TEXT[task.priority]}
              </Badge>
              <Link
                href={`/projects/${task.projectId}`}
                className="truncate hover:underline"
                onClick={() => saveProjectsDetailHref(`/projects/${task.projectId}`)}
              >
                {task.projectTitle}
              </Link>
              <span className="truncate text-muted-foreground">{task.requirementTitle || "无需求"}</span>
              {/* 三行日期把任务周期压缩成一个更容易扫视的摘要。 */}
              <span className="text-xs text-muted-foreground">
                <span className="block">{task.startedAt || "未开始"}</span>
                <span className="block">{task.dueAt || "未计划"}</span>
                <span className="block">{task.completedAt || "未完成"}</span>
              </span>
              <span className="text-xs text-muted-foreground">{task.updatedAt?.slice(0, 10)}</span>
              <div className="flex justify-end">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" size="icon-sm" variant="outline" onClick={() => openEditTask(task)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </DialogTrigger>
                  <TaskEditDialog
                    form={taskForm}
                    onFormChange={setTaskForm}
                    onSave={handleSaveTask}
                  />
                </Dialog>
              </div>
            </article>
          )
        })}
      </section>

      {tasks.length === 0 ? (
        <Empty className="mt-4 rounded-xl border border-dashed bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {(filters.statuses || []).includes("done") ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />}
            </EmptyMedia>
            <EmptyTitle>暂无任务</EmptyTitle>
            <EmptyDescription>可以先创建任务，或者切换筛选条件看看其他状态。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button type="button" variant="outline" onClick={() => void clearFilters()}>
              清除筛选
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}
    </main>
  )
}

function TaskEditDialog(props: {
  form: {
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    startedAt: string
    dueAt: string
    completedAt: string
  }
  onFormChange: (form: {
    title: string
    description: string
    status: TaskStatus
    priority: Priority
    startedAt: string
    dueAt: string
    completedAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>编辑任务</DialogTitle>
        <DialogDescription>修改任务标题、描述、状态和优先级。</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="task-title">标题</Label>
          <Input
            id="task-title"
            value={props.form.title}
            onChange={(event) => props.onFormChange({ ...props.form, title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="task-description">描述</Label>
          <Textarea
            id="task-description"
            value={props.form.description}
            onChange={(event) => props.onFormChange({ ...props.form, description: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>状态</Label>
            <Select
              value={props.form.status}
              onValueChange={(value) => props.onFormChange({ ...props.form, status: value as TaskStatus })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
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
        <div className="grid gap-3 md:grid-cols-3">
          <DatePickerField
            id="task-started-at"
            label="开始日期"
            value={props.form.startedAt}
            onChange={(value) => props.onFormChange({ ...props.form, startedAt: value })}
          />
          <DatePickerField
            id="task-due-at"
            label="计划结束"
            value={props.form.dueAt}
            onChange={(value) => props.onFormChange({ ...props.form, dueAt: value })}
          />
          <DatePickerField
            id="task-completed-at"
            label="最终结束"
            value={props.form.completedAt}
            onChange={(value) => props.onFormChange({ ...props.form, completedAt: value })}
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">取消</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button type="button" onClick={() => void props.onSave()}>保存</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function TaskStateToggle(props: {
  task: TaskRecord
  onToggle: (task: TaskRecord, done: boolean) => Promise<void>
  onStatusChange: (task: TaskRecord, status: TaskStatus) => Promise<void>
}) {
  const done = props.task.isCompleted === 1 || props.task.status === "done"
  const cancelled = props.task.status === "cancelled"

  if (cancelled) {
    return (
      <button
        type="button"
        aria-label="恢复任务"
        onClick={() => void props.onStatusChange(props.task, "todo")}
        className="flex size-4 items-center justify-center rounded-[4px] border border-border bg-muted text-muted-foreground"
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

function loadSavedTaskFilters(): TaskFilters {
  if (typeof window === "undefined") return EMPTY_FILTERS
  const raw = window.localStorage.getItem(TASK_FILTER_STORAGE_KEY)
  if (!raw) return EMPTY_FILTERS

  try {
    return normalizeTaskFilters({ ...EMPTY_FILTERS, ...JSON.parse(raw) })
  } catch {
    return EMPTY_FILTERS
  }
}

function normalizeTaskFilters(filters: TaskFilters): TaskFilters {
  return {
    projectId: filters.projectId,
    requirementId: filters.requirementId,
    statuses: filters.statuses?.filter(Boolean),
    priority: filters.priority,
  }
}

function formatStatusFilter(statuses: TaskStatus[] | undefined) {
  if (!statuses || statuses.length === 0) return "全部状态"
  return statuses.map((status) => TASK_STATUS_TEXT[status]).join("、")
}

function sortTasksForDisplay(rows: TaskRecord[]) {
  return [...rows].sort((a, b) => {
    return compareByStatusThenPriority(a, b)
  })
}
