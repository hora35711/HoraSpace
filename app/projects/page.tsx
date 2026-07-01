"use client"

// Projects 列表页：管理项目容器，并展示状态、优先级、颜色和排序。

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react"

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
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  createProject,
  deleteProject,
  listProjects,
  reorderProjects,
  updateProject,
  type Priority,
  type ProjectRecord,
  type ProjectStatus,
} from "@/lib/hora-db"
import {
  saveProjectsDetailSnapshot,
  saveProjectsListSnapshot,
} from "@/lib/projects-navigation-state"
import { ShimmerBlock } from "@/components/ui/shimmer"
import {
  getPriorityToneClassName,
  getStatusToneClassName,
  PRIORITY_LABEL,
  PROJECT_STATUS_LABEL,
} from "@/lib/project-style"

const STATUS_TEXT = PROJECT_STATUS_LABEL
const PRIORITY_TEXT = PRIORITY_LABEL

// 项目色板偏低饱和，避免列表页和详情页的视觉对比过强。
const COLOR_OPTIONS = ["#8AA8E8", "#8CC9A1", "#E2B36B", "#E8C57A", "#E28A8A", "#A8B3C7"]
const PROJECTS_VIEW_STORAGE_KEY = "hora_projects_view_mode"
const PROJECTS_LIST_HREF = "/projects?list=1"

type ProjectsViewMode = "list" | "cards" | "gantt"

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<ProjectRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingProject, setEditingProject] = useState<ProjectRecord | null>(null)
  const [viewMode, setViewMode] = useState<ProjectsViewMode>("list")
  const [form, setForm] = useState({
    title: "",
    description: "",
    status: "active" as ProjectStatus,
    priority: "normal" as Priority,
    color: COLOR_OPTIONS[0],
    startedAt: "",
    dueAt: "",
    completedAt: "",
  })

  // 统一刷新项目列表，保证排序和更新时间来自数据库。
  const refreshProjects = async () => {
    const rows = await listProjects()
    setProjects(rows)
  }

  useEffect(() => {
    const currentSearchParams = new URLSearchParams(window.location.search)
    if (currentSearchParams.get("list") !== "1") {
      // 项目一级统一使用带 list=1 的规范地址，避免 /projects 和 /projects?list=1 状态分裂。
      router.replace(PROJECTS_LIST_HREF)
      return
    }

    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        const savedViewMode = window.localStorage.getItem(PROJECTS_VIEW_STORAGE_KEY)
        if (savedViewMode === "list" || savedViewMode === "cards" || savedViewMode === "gantt") {
          setViewMode(savedViewMode)
        }
        saveProjectsListSnapshot()
        await refreshProjects()
      } catch (err) {
        setError(err instanceof Error ? err.message : "加载项目失败")
      } finally {
        setLoading(false)
      }
    }

    void run()
  }, [router])

  useEffect(() => {
    window.localStorage.setItem(PROJECTS_VIEW_STORAGE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    // 监听项目/任务侧的写入广播，首页列表也跟着刷新，不会停留在旧数据上。
    const refreshFromBroadcast = () => {
      void refreshProjects()
    }

    window.addEventListener("hora:db-updated", refreshFromBroadcast)
    return () => {
      window.removeEventListener("hora:db-updated", refreshFromBroadcast)
    }
  }, [])

  // 排序后的列表：DB 已排序，这里保留 memo 方便后续扩展筛选。
  const sortedProjects = useMemo(() => projects, [projects])

  const openCreateDialog = () => {
    setEditingProject(null)
    setForm({
      title: "",
      description: "",
      status: "active",
      priority: "normal",
      color: COLOR_OPTIONS[0],
      startedAt: "",
      dueAt: "",
      completedAt: "",
    })
  }

  const openEditDialog = (project: ProjectRecord) => {
    setEditingProject(project)
    setForm({
      title: project.title,
      description: project.description || "",
      status: project.status,
      priority: project.priority,
      color: project.color || COLOR_OPTIONS[0],
      startedAt: project.startedAt || "",
      dueAt: project.dueAt || "",
      completedAt: project.completedAt || "",
    })
  }

  const handleSaveProject = async () => {
    const title = form.title.trim()
    if (!title) return

    try {
      setError(null)
      if (editingProject) {
        await updateProject({
          id: editingProject.id,
          title,
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          color: form.color,
          startedAt: form.startedAt || null,
          dueAt: form.dueAt || null,
          completedAt: form.completedAt || null,
        })
      } else {
        await createProject({
          title,
          description: form.description.trim() || undefined,
          status: form.status,
          priority: form.priority,
          color: form.color,
          startedAt: form.startedAt || undefined,
          dueAt: form.dueAt || undefined,
          completedAt: form.completedAt || undefined,
        })
      }
      await refreshProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存项目失败")
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    try {
      setError(null)
      await deleteProject(projectId)
      await refreshProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除项目失败")
    }
  }

  const handleMoveProject = async (projectId: string, direction: -1 | 1) => {
    const index = sortedProjects.findIndex((project) => project.id === projectId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= sortedProjects.length) return

    const nextProjects = [...sortedProjects]
    const [project] = nextProjects.splice(index, 1)
    nextProjects.splice(nextIndex, 0, project)

    try {
      setProjects(nextProjects.map((item, sortOrder) => ({ ...item, sortOrder })))
      await reorderProjects({ items: nextProjects.map((item, sortOrder) => ({ id: item.id, sortOrder })) })
      await refreshProjects()
    } catch (err) {
      setError(err instanceof Error ? err.message : "调整排序失败")
    }
  }

  return (
    <main className="w-full p-6 md:p-8">
      <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">我的项目</h1>
            {/* 视图切换只改变展示方式，不影响项目数据本身。 */}
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground" htmlFor="projects-view-mode">
                视图
              </Label>
              <Select value={viewMode} onValueChange={(value) => setViewMode(value as ProjectsViewMode)}>
                <SelectTrigger id="projects-view-mode" className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="list">列表</SelectItem>
                  <SelectItem value="cards">卡片</SelectItem>
                  <SelectItem value="gantt">甘特</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Project 是需求和任务的项目容器。</p>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button type="button" onClick={openCreateDialog}>
              <Plus className="size-4" />
              新建项目
            </Button>
          </DialogTrigger>
          <ProjectDialog
            form={form}
            editing={Boolean(editingProject)}
            onFormChange={setForm}
            onSave={handleSaveProject}
          />
        </Dialog>
      </header>

      {error ? <p className="mb-4 text-sm text-rose-600">{error}</p> : null}

      {loading ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="p-4">
                <div className="space-y-3">
                  <ShimmerBlock className="h-4 w-2/3" />
                  <ShimmerBlock className="h-4 w-1/2" />
                  <ShimmerBlock className="h-24 w-full" />
                </div>
              </Card>
            ))}
          </div>
        </section>
      ) : viewMode === "list" ? (
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr_0.5fr_1fr_0.9fr] border-b bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>项目名称</span>
            <span>状态</span>
            <span>优先级</span>
            <span>颜色</span>
            <span>排序</span>
            <span>更新时间</span>
            <span className="text-right">操作</span>
          </div>

          {sortedProjects.map((project, index) => (
            <article
              key={project.id}
              className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.6fr_0.5fr_1fr_0.9fr] items-center border-b px-4 py-3 text-sm last:border-b-0"
            >
              <Link
                href={getProjectHref(project.id, viewMode)}
                className="min-w-0 font-medium text-foreground hover:underline"
                onClick={() => saveProjectsDetailSnapshot(project.id, "list")}
              >
                <span className="block truncate">{project.title}</span>
                {project.description ? (
                  <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{project.description}</span>
                ) : null}
              </Link>
              <Badge variant="outline" className={getStatusToneClassName(project.status)}>
                {STATUS_TEXT[project.status]}
              </Badge>
              <Badge variant="outline" className={getPriorityToneClassName(project.priority)}>
                {PRIORITY_TEXT[project.priority]}
              </Badge>
              <span>
                <span className="inline-flex size-4 rounded-full border border-border" style={{ backgroundColor: project.color || "#8AA8E8" }} />
              </span>
              <span>{project.sortOrder}</span>
              <span className="text-xs text-muted-foreground">{project.updatedAt?.slice(0, 10)}</span>
              <div className="flex justify-end gap-1">
                <Button type="button" size="icon-sm" variant="outline" disabled={index === 0} onClick={() => void handleMoveProject(project.id, -1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" size="icon-sm" variant="outline" disabled={index === sortedProjects.length - 1} onClick={() => void handleMoveProject(project.id, 1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button type="button" size="icon-sm" variant="outline" onClick={() => openEditDialog(project)}>
                      <Pencil className="size-3.5" />
                    </Button>
                  </DialogTrigger>
                  <ProjectDialog
                    form={form}
                    editing
                    onFormChange={setForm}
                    onSave={handleSaveProject}
                  />
                </Dialog>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" size="icon-sm" variant="outline">
                      <Trash2 className="size-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
                      <AlertDialogDescription>
                        删除项目会同时删除它下面的需求和任务。该操作会软删除数据，不会影响 Notes 文件。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>取消</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void handleDeleteProject(project.id)}>确认删除</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </article>
          ))}
        </section>
      ) : viewMode === "cards" ? (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">卡片视图</h2>
              <p className="text-xs text-muted-foreground">每个项目一张卡，适合快速查看周期和状态。</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {sortedProjects.map((project) => (
              <Link
                key={project.id}
                href={getProjectHref(project.id, viewMode)}
                className="group block"
                onClick={() => saveProjectsDetailSnapshot(project.id, "board")}
              >
                <Card className="h-full p-4 transition group-hover:-translate-y-0.5 group-hover:shadow-md">
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold group-hover:underline">{project.title}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.description || "暂无描述"}</p>
                    </div>
                    <span className="inline-flex size-4 rounded-full border border-border" style={{ backgroundColor: project.color || "#8AA8E8" }} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div className="rounded-xl border bg-background px-3 py-2">
                      <span className="block text-[11px]">状态</span>
                      <Badge variant="outline" className={getStatusToneClassName(project.status)}>
                        {STATUS_TEXT[project.status]}
                      </Badge>
                    </div>
                    <div className="rounded-xl border bg-background px-3 py-2">
                      <span className="block text-[11px]">优先级</span>
                      <Badge variant="outline" className={getPriorityToneClassName(project.priority)}>
                        {PRIORITY_TEXT[project.priority]}
                      </Badge>
                    </div>
                    <div className="rounded-xl border bg-background px-3 py-2">
                      <span className="block text-[11px]">开始</span>
                      <span className="block font-medium text-foreground">{project.startedAt || "未设置"}</span>
                    </div>
                    <div className="rounded-xl border bg-background px-3 py-2">
                      <span className="block text-[11px]">计划结束</span>
                      <span className="block font-medium text-foreground">{project.dueAt || "未设置"}</span>
                    </div>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-[linear-gradient(90deg,#8AA8E8_0%,#8CC9A1_100%)]" style={{ width: project.startedAt && project.dueAt ? "100%" : "45%" }} />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">甘特视图</h2>
              <p className="text-xs text-muted-foreground">按项目开始和计划结束时间，快速扫一眼整个周期。</p>
            </div>
          </div>
          <ProjectGantt projects={sortedProjects} />
        </section>
      )}

      {!loading && sortedProjects.length === 0 ? (
        <Empty className="mt-6 rounded-xl border border-dashed bg-card py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Plus className="size-4" />
            </EmptyMedia>
            <EmptyTitle>暂无项目</EmptyTitle>
            <EmptyDescription>先创建一个项目，再进入对应的需求和任务。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="text-muted-foreground">
            你可以点击右上角“新建项目”开始。
          </EmptyContent>
        </Empty>
      ) : null}
    </main>
  )
}

function ProjectDialog(props: {
  form: {
    title: string
    description: string
    status: ProjectStatus
    priority: Priority
    color: string
    startedAt: string
    dueAt: string
    completedAt: string
  }
  editing: boolean
  onFormChange: (form: {
    title: string
    description: string
    status: ProjectStatus
    priority: Priority
    color: string
    startedAt: string
    dueAt: string
    completedAt: string
  }) => void
  onSave: () => Promise<void>
}) {
  const { form, editing, onFormChange, onSave } = props

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{editing ? "编辑项目" : "新建项目"}</DialogTitle>
        <DialogDescription>维护项目的基础信息和列表展示字段。</DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="space-y-2">
          <Label htmlFor="project-title">项目名称</Label>
          <Input
            id="project-title"
            value={form.title}
            onChange={(event) => onFormChange({ ...form, title: event.target.value })}
            placeholder="请输入项目名称"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project-description">描述</Label>
          <Input
            id="project-description"
            value={form.description}
            onChange={(event) => onFormChange({ ...form, description: event.target.value })}
            placeholder="可选"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>状态</Label>
            <Select value={form.status} onValueChange={(value) => onFormChange({ ...form, status: value as ProjectStatus })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_TEXT).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>优先级</Label>
            <Select value={form.priority} onValueChange={(value) => onFormChange({ ...form, priority: value as Priority })}>
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
            id="project-started-at"
            label="开始日期"
            value={form.startedAt}
            onChange={(value) => onFormChange({ ...form, startedAt: value })}
          />
          <DatePickerField
            id="project-due-at"
            label="计划结束"
            value={form.dueAt}
            onChange={(value) => onFormChange({ ...form, dueAt: value })}
          />
          <DatePickerField
            id="project-completed-at"
            label="最终结束"
            value={form.completedAt}
            onChange={(value) => onFormChange({ ...form, completedAt: value })}
          />
        </div>
        <div className="space-y-2">
          <Label>颜色</Label>
          <div className="flex gap-2">
            {COLOR_OPTIONS.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`选择颜色 ${color}`}
                onClick={() => onFormChange({ ...form, color })}
                className={form.color === color ? "size-7 rounded-full border-2 border-slate-400" : "size-7 rounded-full border border-border"}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>

      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">取消</Button>
        </DialogClose>
        <DialogClose asChild>
          <Button type="button" onClick={() => void onSave()}>保存</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}

function ProjectGantt(props: {
  projects: ProjectRecord[]
}) {
  // 轻量项目甘特图：按项目自身日期区间生成条形时间轴，缺省时用更新时间做占位。
  const dates = props.projects.flatMap((project) => [project.startedAt, project.dueAt, project.completedAt]).filter(Boolean) as string[]
  const startDate = parseDate(dates[0] || todayISO())
  const endDate = parseDate(dates.at(-1) || todayISO())
  const safeEndDate = endDate < startDate ? startDate : endDate
  const totalDays = Math.max(1, Math.ceil((safeEndDate.getTime() - startDate.getTime()) / DAY_MS) + 1)
  const dayColumns = Array.from({ length: Math.min(totalDays, 28) }, (_, index) => addDays(startDate, index))

  return (
    <div className="space-y-3 overflow-x-auto">
      <div className="min-w-[820px]">
        <div className="grid" style={{ gridTemplateColumns: `240px repeat(${dayColumns.length}, minmax(22px, 1fr))` }}>
          <div className="px-2 py-2 text-xs font-medium text-muted-foreground">项目</div>
          {dayColumns.map((day) => (
            <div key={day.toISOString()} className="px-1 py-2 text-center text-[11px] text-muted-foreground">
              {formatTimelineDay(day)}
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {props.projects.map((project) => {
            const start = parseDate(project.startedAt || startDate.toISOString())
            const end = parseDate(project.dueAt || project.completedAt || project.startedAt || endDate.toISOString())
            const safeStart = start < startDate ? startDate : start
            const safeEnd = end < safeStart ? safeStart : end
            const startIndex = Math.max(0, Math.floor((safeStart.getTime() - startDate.getTime()) / DAY_MS))
            const span = Math.max(1, Math.floor((safeEnd.getTime() - safeStart.getTime()) / DAY_MS) + 1)
            return (
              <Link
                key={project.id}
                href={`/projects/${project.id}?view=gantt`}
                className="grid items-center gap-2 rounded-xl border bg-card px-3 py-3 shadow-sm transition hover:bg-accent/30"
                onClick={() => saveProjectsDetailSnapshot(project.id, "gantt")}
                style={{ gridTemplateColumns: `240px repeat(${dayColumns.length}, minmax(22px, 1fr))` }}
              >
                <div className="min-w-0 px-2">
                  <p className="truncate text-sm font-semibold">{project.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <Badge variant="outline" className={getStatusToneClassName(project.status)}>
                      {STATUS_TEXT[project.status]}
                    </Badge>
                    <span className="mx-1">·</span>
                    {project.startedAt || "未开始"} → {project.dueAt || project.completedAt || "未结束"}
                  </p>
                </div>
                <div className="relative col-span-full grid" style={{ gridTemplateColumns: `240px repeat(${dayColumns.length}, minmax(22px, 1fr))` }}>
                  <div
                    className="col-start-2 row-start-1 my-1.5 h-7 rounded-lg px-2 py-1 text-xs text-white/90 shadow-sm"
                    style={{
                      gridColumn: `${startIndex + 2} / span ${Math.min(span, dayColumns.length - startIndex)}`,
                      backgroundColor: project.color || "#8AA8E8",
                    }}
                  >
                    <span className="block truncate">{PRIORITY_TEXT[project.priority]}</span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function getProjectHref(projectId: string, viewMode: ProjectsViewMode) {
  // 一级页面的视图决定二级页默认打开的布局。
  const detailView = viewMode === "cards" ? "board" : viewMode
  return `/projects/${projectId}?view=${detailView}`
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
