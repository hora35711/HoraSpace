"use client"

// 全局 Tasks 页面：跨项目展示同一张 tasks 表中的执行项。

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  Filter,
  Pencil,
  Plus,
  RotateCcw,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
import { TaskDetailDialog } from "@/components/task-detail-dialog"
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
  createTask,
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

const TASK_TABLE_GRID =
  "grid-cols-[minmax(0,2fr)_4.75rem_4.75rem_minmax(0,1fr)_minmax(0,1fr)_6.5rem_5.5rem_3rem]"

// 新建任务默认给一个今天到五天后的周期，减少用户每次手填日期的成本。
function createDefaultTaskForm(projectId = "", requirementId = "") {
  const startedAt = formatLocalDate(new Date())
  const dueAt = formatLocalDate(addDaysLocal(new Date(), 5))
  return {
    title: "",
    description: "",
    projectId,
    requirementId,
    status: "todo" as TaskStatus,
    priority: "normal" as Priority,
    startedAt,
    dueAt,
    completedAt: "",
  }
}

export default function TasksPage() {
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [requirements, setRequirements] = useState<RequirementRecord[]>([])
  const [tasks, setTasks] = useState<TaskRecord[]>([])
  const [filters, setFilters] = useState<TaskFilters>(EMPTY_FILTERS)
  const [taskDialogMode, setTaskDialogMode] = useState<"create" | "edit" | null>(null)
  const [editingTask, setEditingTask] = useState<TaskRecord | null>(null)
  const [selectedTask, setSelectedTask] = useState<TaskRecord | null>(null)
  const [taskForm, setTaskForm] = useState(() => createDefaultTaskForm())
  const [error, setError] = useState<string | null>(null)

  const refreshTasks = useCallback(
    async (nextFilters = filters) => {
      const rows = await listAllTasks(nextFilters)
      setTasks(sortTasksForDisplay(rows))
    },
    [filters]
  )

  useEffect(() => {
    const run = async () => {
      try {
        setError(null)
        const savedFilters = loadSavedTaskFilters()
        setFilters(savedFilters)

        const projectRows = await listProjects()
        setProjects(projectRows)

        const requirementRows = (
          await Promise.all(
            projectRows.map((project) => listRequirementsByProject(project.id))
          )
        ).flat()
        setRequirements(requirementRows)

        await refreshTasks(savedFilters)
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载任务失败")
      }
    }

    void run()
  }, [refreshTasks])

  useEffect(() => {
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
    return requirements.filter(
      (requirement) => requirement.projectId === filters.projectId
    )
  }, [filters.projectId, requirements])

  const taskFormRequirements = useMemo(() => {
    if (!taskForm.projectId) return requirements
    return requirements.filter((requirement) => requirement.projectId === taskForm.projectId)
  }, [requirements, taskForm.projectId])

  const updateFilters = async (nextFilters: TaskFilters) => {
    const normalizedFilters = normalizeTaskFilters(nextFilters)
    setFilters(normalizedFilters)
    window.localStorage.setItem(
      TASK_FILTER_STORAGE_KEY,
      JSON.stringify(normalizedFilters)
    )
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

  const openCreateTask = () => {
    setError(null)
    const defaultProjectId = filters.projectId || projects[0]?.id || ""
    const defaultRequirementId =
      requirements.find((requirement) => requirement.projectId === defaultProjectId)?.id || ""
    setEditingTask(null)
    setTaskDialogMode("create")
    setTaskForm(createDefaultTaskForm(defaultProjectId, defaultRequirementId))
  }

  const openEditTask = (task: TaskRecord) => {
    setError(null)
    setEditingTask(task)
    setTaskDialogMode("edit")
    setTaskForm({
      title: task.title,
      description: task.description || "",
      projectId: task.projectId,
      requirementId: task.requirementId || "",
      status: task.status,
      priority: task.priority,
      startedAt: task.startedAt || formatLocalDate(new Date()),
      dueAt: task.dueAt || formatLocalDate(addDaysLocal(new Date(), 5)),
      completedAt: task.completedAt || "",
    })
  }

  const openTaskDetail = (task: TaskRecord) => {
    setSelectedTask(task)
  }

  const handleSaveTask = async () => {
    const title = taskForm.title.trim()
    const projectId = taskForm.projectId.trim()
    if (!title || !projectId) return

    try {
      setError(null)
      if (taskDialogMode === "create") {
        // 新建任务时顺手带上项目和需求，减少用户补填次数。
        await createTask({
          projectId,
          requirementId: taskForm.requirementId || null,
          title,
          description: taskForm.description.trim() || undefined,
          status: taskForm.status,
          priority: taskForm.priority,
          startedAt: taskForm.startedAt || null,
          dueAt: taskForm.dueAt || null,
          isCompleted: taskForm.status === "done",
        })
      } else if (editingTask) {
        await updateTask({
          id: editingTask.id,
          projectId,
          requirementId: taskForm.requirementId || null,
          title,
          description: taskForm.description.trim() || null,
          status: taskForm.status,
          priority: taskForm.priority,
          startedAt: taskForm.startedAt || null,
          dueAt: taskForm.dueAt || null,
          completedAt: taskForm.completedAt || null,
          isCompleted: taskForm.status === "done",
        })
      }
      await refreshTasks()
      setTaskDialogMode(null)
      setEditingTask(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存任务失败")
    }
  }

  return (
    <main className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden pt-1">
      <header className="flex shrink-0 items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            跨项目执行视图，数据来自同一张 tasks 表。
          </p>
        </div>
        <Button type="button" onClick={openCreateTask}>
          <Plus className="size-4" />
          新建任务
        </Button>
      </header>

      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

      <section className="mt-3 shrink-0 rounded-xl border bg-card p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs font-medium">
          <div className="flex items-center gap-2">
            <Filter className="size-3.5" />
            筛选
          </div>
          <Button
            type="button"
            size="xs"
            variant="outline"
            onClick={() => void clearFilters()}
          >
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
              <Button
                type="button"
                variant="outline"
                className="h-8 justify-between px-2 text-xs"
              >
                {formatStatusFilter(filters.statuses)}
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56 text-xs">
              {Object.entries(TASK_STATUS_TEXT).map(([value, label]) => (
                <DropdownMenuCheckboxItem
                  key={value}
                  checked={(filters.statuses || []).includes(
                    value as TaskStatus
                  )}
                  onCheckedChange={() =>
                    void toggleStatusFilter(value as TaskStatus)
                  }
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
                priority:
                  value === ALL_FILTER_VALUE ? undefined : (value as Priority),
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
        <div
          className={cn(
            "sticky top-0 z-10 grid items-center gap-2 border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground dark:bg-muted/20",

            TASK_TABLE_GRID
          )}
        >
          <span className="text-left">任务</span>

          <span className="text-center">状态</span>

          <span className="text-center">优先级</span>

          <span className="text-center">项目</span>

          <span className="text-center">需求</span>

          <span className="text-center">周期</span>

          <span className="text-center">更新</span>

          <span className="text-right">编辑</span>
        </div>

        {tasks.map((task) => {
          const done = task.isCompleted === 1 || task.status === "done"

          // @ts-ignore
          // @ts-ignore
          // @ts-ignore
          return (
            <article
              key={task.id}
              className={cn(
                "grid items-center gap-2 border-b px-4 py-3 text-sm transition-colors last:border-b-0 hover:bg-muted/30",

                TASK_TABLE_GRID
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <TaskStateToggle
                  task={task}
                  onToggle={handleToggleDone}
                  onStatusChange={handleChangeStatus}
                />
                <span
                  className="size-3 shrink-0 rounded-full border border-border dark:border-border/70"
                  style={{ backgroundColor: task.color || "#8AA8E8" }}
                />
                <div className="min-w-0 flex-1 space-y-1 text-left">
                  <button
                    type="button"
                    onClick={() => openTaskDetail(task)}
                    className={cn(
                      "line-clamp-2 w-full text-left leading-5 font-medium hover:text-foreground",
                      done && "text-muted-foreground line-through"
                    )}
                  >
                    {task.title}
                  </button>
                  <p
                    title={task.description || "暂无描述"}
                    className="truncate text-xs leading-relaxed text-muted-foreground/80"
                  >
                    {task.description || "暂无描述"}
                  </p>
                </div>
              </div>

              <Select
                value={task.status}
                onValueChange={(value) =>
                  void handleChangeStatus(task, value as TaskStatus)
                }
              >
                <SelectTrigger
                  size="sm"
                  className={cn(
                    "h-6 w-full justify-center rounded-full px-2 text-xs",

                    getStatusToneClassName(task.status)
                  )}
                >
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

              <Badge
                variant="outline"
                className={cn(
                  "h-6 justify-center rounded-full px-2 text-xs",
                  getPriorityToneClassName(task.priority)
                )}
              >
                {PRIORITY_TEXT[task.priority]}
              </Badge>

              <Link
                href={`/projects/${task.projectId}`}
                title={task.projectTitle || ''}
                className="truncate text-center leading-5 hover:underline"
                onClick={() =>
                  saveProjectsDetailHref(`/projects/${task.projectId}`)
                }
              >
                {task.projectTitle}
              </Link>

              <span
                title={task.requirementTitle || "无需求"}
                className="truncate text-center leading-5 text-muted-foreground"
              >
                {task.requirementTitle || "无需求"}
              </span>

              <span className="text-center text-[11px] leading-4 text-muted-foreground">
                <span className="block">起 {task.startedAt || "未定"}</span>
                <span className="block">止 {task.dueAt || "未定"}</span>
                <span className="block">完 {task.completedAt || "未完"}</span>
              </span>

              <span className="text-center text-xs text-muted-foreground">
                {task.updatedAt?.slice(0, 10)}
              </span>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="outline"
                  onClick={() => openEditTask(task)}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </div>
            </article>
          )
        })}
      </section>

      {tasks.length === 0 ? (
        <Empty className="mt-4 rounded-xl border border-dashed bg-card py-10 dark:bg-muted/10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {(filters.statuses || []).includes("done") ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <Circle className="size-4" />
              )}
            </EmptyMedia>
            <EmptyTitle>暂无任务</EmptyTitle>
            <EmptyDescription>
              可以先创建任务，或者切换筛选条件看看其他状态。
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            <Button
              type="button"
              variant="outline"
              onClick={() => void clearFilters()}
            >
              清除筛选
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {/* 新建和编辑共用同一套表单，避免两套逻辑分叉。 */}
      <Dialog
        open={taskDialogMode !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTaskDialogMode(null)
            setEditingTask(null)
          }
        }}
      >
        <TaskEditDialog
          mode={taskDialogMode || "create"}
          form={taskForm}
          projects={projects}
          requirements={taskFormRequirements}
          onFormChange={setTaskForm}
          onSave={handleSaveTask}
        />
      </Dialog>

      <TaskDetailDialog
        task={selectedTask}
        open={Boolean(selectedTask)}
        onOpenChange={(open) => !open && setSelectedTask(null)}
        onEdit={(task) => {
          setSelectedTask(null)
          openEditTask(task)
        }}
      />
    </main>
  )
}

function TaskEditDialog(props: {
  mode: "create" | "edit"
  form: {
    title: string
    description: string
    projectId: string
    requirementId: string
    status: TaskStatus
    priority: Priority
    startedAt: string
    dueAt: string
    completedAt: string
  }
  projects: ProjectRecord[]
  requirements: RequirementRecord[]
  onFormChange: (form: {
    title: string
    description: string
    projectId: string
    requirementId: string
    status: TaskStatus
    priority: Priority
    startedAt: string
    dueAt: string
    completedAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  const selectedRequirements = props.form.projectId
    ? props.requirements.filter(
        (requirement) => requirement.projectId === props.form.projectId
      )
    : props.requirements

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{props.mode === "create" ? "新建任务" : "编辑任务"}</DialogTitle>
        <DialogDescription>
          {props.mode === "create"
            ? "填写任务标题、项目、需求和日期后即可创建。"
            : "修改任务标题、描述、状态、优先级和归属信息。"}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="task-title">标题</Label>
          <Input
            id="task-title"
            value={props.form.title}
            onChange={(event) =>
              props.onFormChange({ ...props.form, title: event.target.value })
            }
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <Label>项目</Label>
            <Select
              value={props.form.projectId}
              onValueChange={(value) =>
                props.onFormChange({
                  ...props.form,
                  projectId: value,
                  requirementId:
                    props.requirements.some(
                      (requirement) =>
                        requirement.id === props.form.requirementId &&
                        requirement.projectId === value
                    )
                      ? props.form.requirementId
                      : "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="选择项目" />
              </SelectTrigger>
              <SelectContent>
                {props.projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>需求</Label>
            <Select
              value={props.form.requirementId || ALL_FILTER_VALUE}
              onValueChange={(value) =>
                props.onFormChange({
                  ...props.form,
                  requirementId: value === ALL_FILTER_VALUE ? "" : value,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="无需求" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_FILTER_VALUE}>无需求</SelectItem>
                {selectedRequirements.map((requirement) => (
                  <SelectItem key={requirement.id} value={requirement.id}>
                    {requirement.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="task-description">描述</Label>
          <Textarea
            id="task-description"
            value={props.form.description}
            onChange={(event) =>
              props.onFormChange({
                ...props.form,
                description: event.target.value,
              })
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>状态</Label>
            <Select
              value={props.form.status}
              onValueChange={(value) =>
                props.onFormChange({
                  ...props.form,
                  status: value as TaskStatus,
                })
              }
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
              onValueChange={(value) =>
                props.onFormChange({
                  ...props.form,
                  priority: value as Priority,
                })
              }
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
            onChange={(value) =>
              props.onFormChange({ ...props.form, startedAt: value })
            }
          />
          <DatePickerField
            id="task-due-at"
            label="计划结束"
            value={props.form.dueAt}
            onChange={(value) =>
              props.onFormChange({ ...props.form, dueAt: value })
            }
          />
          <DatePickerField
            id="task-completed-at"
            label="最终结束"
            value={props.form.completedAt}
            onChange={(value) =>
              props.onFormChange({ ...props.form, completedAt: value })
            }
          />
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            取消
          </Button>
        </DialogClose>
        <DialogClose asChild>
          <Button type="button" onClick={() => void props.onSave()}>
            {props.mode === "create" ? "创建" : "保存"}
          </Button>
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
        className="flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-border bg-muted text-muted-foreground dark:bg-muted/70"
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
      className={
        done
          ? "flex size-4 shrink-0 items-center justify-center rounded-[4px] border border-sky-300 bg-sky-100 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300"
          : "size-4 shrink-0 rounded-[4px] border border-input bg-background dark:bg-background/60"
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

// 日期只展示本地日历日，避免 UTC 转换把选中的“今天”挪成前一天。
function formatLocalDate(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, "0")
  const day = `${date.getDate()}`.padStart(2, "0")
  return `${year}-${month}-${day}`
}

// 默认周期往后顺延几天，保持新建任务一打开就有可用时间范围。
function addDaysLocal(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}
