"use client"

// Dashboard 页：以项目、需求、任务和笔记的整体统计为核心，提供一页式总览。

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { ShimmerBlock, ShimmerDemo } from "@/components/ui/shimmer"
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart"
import { cn } from "@/lib/utils"
import {
  getPriorityToneClassName,
  getStatusToneClassName,
  PRIORITY_LABEL,
  REQUIREMENT_STATUS_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/project-style"
import {
  getNote,
  listNoteNodes,
  listNotesByProject,
  listProjects,
  listRequirementsByProject,
  listTasksByProject,
  type LinkedNoteRecord,
  type NoteNodeRow,
  type Priority,
  type ProjectRecord,
  type RequirementRecord,
  type RequirementStatus,
  type TaskRecord,
  type TaskStatus,
  type TaskFilters,
} from "@/lib/hora-db"
import { PROJECTS_LIST_HREF, saveProjectsListSnapshot } from "@/lib/projects-navigation-state"
import {
  eachDayOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfDay,
  startOfWeek,
  subDays,
  subWeeks,
} from "date-fns"
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Folder,
  LineChart as LineChartIcon,
  NotebookPen,
  PieChart as PieChartIcon,
  Radar as RadarIcon,
  Target,
  TriangleAlert,
} from "lucide-react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  XAxis,
  YAxis,
} from "recharts"

type TimeRange = "7d" | "30d" | "90d"
type Scope = "all" | string

type NoteFileStat = {
  id: string
  title: string
  updatedAt: string
}

type ChartBucket = {
  key: string
  label: string
  start: Date
  end: Date
}

type DashboardData = {
  projects: ProjectRecord[]
  requirements: RequirementRecord[]
  tasks: TaskRecord[]
  noteFiles: NoteFileStat[]
  linkedNotesByProject: Record<string, LinkedNoteRecord[]>
}

const DEFAULT_RANGE: TimeRange = "30d"

// 图表颜色统一沿用用户定义的状态色和项目色，保证整页语义一致。
const STATUS_COLORS = {
  active: "#165DFF",
  paused: "#F7BA1E",
  todo: "#F59200",
  done: "#00B42A",
  cancelled: "#86909C",
  archived: "#86909C",
  urgent: "#F53F3F",
  high: "#F59200",
  normal: "#00B42A",
  low: "#165DFF",
} as const

type DrilldownKind = "priority" | "status"
type DrilldownRing = "requirements" | "tasks"

type DrilldownItem = {
  type: "project" | "requirement" | "task"
  id: string
  title: string
  description?: string | null
  projectId: string
  projectTitle: string
  requirementId?: string | null
  requirementTitle?: string | null
  status: string
  priority: Priority
  startedAt?: string | null
  dueAt?: string | null
  completedAt?: string | null
  color?: string | null
}

type DrilldownSelection = {
  kind: DrilldownKind
  ring?: DrilldownRing
  key: string
  label: string
  description: string
}

const TASK_FILTER_STORAGE_KEY = "hora_tasks_filters"

// shadcn charts 配置：每个系列都明确标注颜色和标签，tooltip 会自动复用。
const activityChartConfig = {
  tasks: { label: "任务完成", color: "var(--chart-1)" },
  notes: { label: "笔记更新", color: "var(--chart-2)" },
} satisfies ChartConfig

const cycleChartConfig = {
  requirements: { label: "需求完成", color: "var(--chart-3)" },
  projects: { label: "项目完成", color: "var(--chart-4)" },
} satisfies ChartConfig

const priorityChartConfig = {
  urgent: { label: "紧急", color: STATUS_COLORS.urgent },
  high: { label: "高", color: STATUS_COLORS.high },
  normal: { label: "普通", color: STATUS_COLORS.normal },
  low: { label: "低", color: STATUS_COLORS.low },
} satisfies ChartConfig

const statusPieChartConfig = {
  todo: { label: "待处理", color: STATUS_COLORS.todo },
  doing: { label: "进行中", color: STATUS_COLORS.active },
  done: { label: "已完成", color: STATUS_COLORS.done },
  cancelled: { label: "取消", color: STATUS_COLORS.cancelled },
  paused: { label: "暂停", color: STATUS_COLORS.paused },
  archived: { label: "归档", color: STATUS_COLORS.archived },
} satisfies ChartConfig

// 状态分布需要更明确的视觉反馈，直接映射到用户指定的主色。
function getStatusDistributionClassName(status: string) {
  switch (status) {
    case "doing":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300"
    case "todo":
      return "border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300"
    case "done":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/35 dark:text-emerald-300"
    case "cancelled":
    case "archived":
      return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900/50 dark:text-slate-400"
    case "paused":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300"
    default:
      return "border-border bg-muted text-muted-foreground dark:bg-muted/70"
  }
}

const radarChartConfig = {
  health: { label: "健康度", color: "var(--chart-1)" },
} satisfies ChartConfig

const radialChartConfig = {
  completion: { label: "总体完成率", color: "var(--chart-2)" },
} satisfies ChartConfig

// 统一把时间字符串安全地转成 Date，避免空值和非法值把图表打断。
function toDate(value: string | null | undefined) {
  if (!value) return null
  const parsed = parseISO(value)
  return isValid(parsed) ? parsed : null
}

// 根据时间范围生成桶：短区间按天，中长区间按周，方便在一张图里看趋势。
function buildBuckets(range: TimeRange) {
  const now = endOfDay(new Date())

  if (range === "7d" || range === "30d") {
    const days = range === "7d" ? 7 : 30
    const start = startOfDay(subDays(now, days - 1))
    return eachDayOfInterval({ start, end: now }).map((day) => ({
      key: day.toISOString(),
      label: format(day, "M/d"),
      start: startOfDay(day),
      end: endOfDay(day),
    })) as ChartBucket[]
  }

  const start = startOfWeek(subWeeks(now, 11), { weekStartsOn: 1 })
  return eachWeekOfInterval({ start, end: now }, { weekStartsOn: 1 }).map((weekStart) => ({
    key: weekStart.toISOString(),
    label: `${format(weekStart, "M/d")}`,
    start: startOfDay(weekStart),
    end: endOfWeek(weekStart, { weekStartsOn: 1 }),
  })) as ChartBucket[]
}

// 按桶统计多个系列，方便 area / line 共用。
function buildSeriesData(
  buckets: ChartBucket[],
  series: Record<string, Array<string | null | undefined>>,
) {
  return buckets.map((bucket) => {
    const row: Record<string, string | number> = { bucket: bucket.label }

    for (const [key, values] of Object.entries(series)) {
      row[key] = values.reduce((total, raw) => {
        const date = toDate(raw)
        if (!date) return total
        return date >= bucket.start && date <= bucket.end ? total + 1 : total
      }, 0)
    }

    return row
  })
}

// 简单去重，保证关联笔记不会因为多项目引用重复计数。
function uniqueNotes(notes: LinkedNoteRecord[]) {
  const map = new Map<string, LinkedNoteRecord>()
  for (const note of notes) {
    map.set(note.id, note)
  }
  return [...map.values()]
}

// 计算完成率，避免 0 除和空数据导致 UI 报错。
function completionRate(done: number, total: number) {
  if (!total) return 0
  return Math.round((done / total) * 100)
}

// 把状态归一成一个简单的聚合值，便于雷达和环形图一起复用。
function getOverallScore(scores: number[]) {
  if (!scores.length) return 0
  return Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
}

// 筛选某个 scope 下的项目。
function filterProjectsByScope(projects: ProjectRecord[], scope: Scope) {
  if (scope === "all") return projects
  return projects.filter((project) => project.id === scope)
}

// 把 requirements 绑定回项目范围。
function filterRequirementsByScope(requirements: RequirementRecord[], scope: Scope) {
  if (scope === "all") return requirements
  return requirements.filter((item) => item.projectId === scope)
}

// 把任务绑定回项目范围。
function filterTasksByScope(tasks: TaskRecord[], scope: Scope) {
  if (scope === "all") return tasks
  return tasks.filter((item) => item.projectId === scope)
}

function DashboardMetricCard(props: {
  title: string
  value: string
  description: string
  icon: React.ReactNode
  toneClassName?: string
  progress?: number
  footer?: React.ReactNode
}) {
  // 统一 KPI 卡片结构，保证看板上层信息稳定且不花哨。
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardDescription>{props.title}</CardDescription>
            <CardTitle className="text-3xl tracking-tight">{props.value}</CardTitle>
          </div>
          <div className={cn("rounded-lg border p-2", props.toneClassName || "bg-muted dark:bg-muted/70")}>{props.icon}</div>
        </div>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </CardHeader>
      <CardContent className="space-y-3">
        {typeof props.progress === "number" ? <Progress value={props.progress} className="h-2" /> : null}
        {props.footer ? <div className="text-xs text-muted-foreground">{props.footer}</div> : null}
      </CardContent>
    </Card>
  )
}

function ChartFrame(props: {
  title: string
  description: string
  icon: React.ReactNode
  children: React.ReactNode
  className?: string
  footer?: React.ReactNode
}) {
  // 图表卡片统一边距和标题区，避免每个面板长得不一样。
  return (
    <Card className={cn("overflow-hidden", props.className)}>
      <CardHeader className="space-y-1.5 pb-3">
        <div className="flex items-center gap-2">
          <span className="rounded-md border bg-muted p-1.5 text-muted-foreground dark:bg-muted/70">{props.icon}</span>
          <CardTitle className="text-base">{props.title}</CardTitle>
        </div>
        <CardDescription>{props.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {props.children}
        {props.footer ? <div className="pt-1">{props.footer}</div> : null}
      </CardContent>
    </Card>
  )
}

function ChartEmptyState(props: { title: string; description: string; icon: React.ReactNode }) {
  // 图表空态：保留卡片高度，但不让零数据图表硬撑版面。
  return (
    <div className="flex min-h-[260px] items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-8 dark:bg-muted/10">
      <Empty className="border-0 p-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">{props.icon}</EmptyMedia>
          <EmptyTitle>{props.title}</EmptyTitle>
          <EmptyDescription>{props.description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [range, setRange] = React.useState<TimeRange>(DEFAULT_RANGE)
  const [scope, setScope] = React.useState<Scope>("all")
  const [drilldown, setDrilldown] = React.useState<DrilldownSelection | null>(null)
  const [data, setData] = React.useState<DashboardData>({
    projects: [],
    requirements: [],
    tasks: [],
    noteFiles: [],
    linkedNotesByProject: {},
  })

  const loadDashboard = React.useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const [projects, noteNodes] = await Promise.all([listProjects(), listNoteNodes()])

      const taskRows = await Promise.all(projects.map((project) => listTasksByProject(project.id)))
      const requirementRows = await Promise.all(projects.map((project) => listRequirementsByProject(project.id)))
      const linkedRows = await Promise.all(
        projects.map(async (project) => [project.id, await listNotesByProject(project.id)] as const),
      )

      const noteFiles = noteNodes.filter((node: NoteNodeRow) => node.nodeType === "file")
      const noteDetails = await Promise.all(
        noteFiles.map(async (note: NoteNodeRow) => {
          const detail = await getNote(note.id)
          return detail ? { id: detail.id, title: detail.title, updatedAt: detail.updatedAt } : null
        }),
      )

      setData({
        projects,
        requirements: requirementRows.flat(),
        tasks: taskRows.flat(),
        noteFiles: noteDetails.filter(Boolean) as NoteFileStat[],
        linkedNotesByProject: Object.fromEntries(linkedRows),
      })
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "加载看板失败")
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  React.useEffect(() => {
    // 数据或空间切换后刷新看板，保持 dashboard 始终和其他页面同步。
    const handleDbUpdate = () => {
      void loadDashboard()
    }
    window.addEventListener("hora:db-updated", handleDbUpdate as EventListener)
    const unsubscribeSpaces = window.horaDB?.onSpacesChanged?.(() => {
      void loadDashboard()
    })

    return () => {
      window.removeEventListener("hora:db-updated", handleDbUpdate as EventListener)
      unsubscribeSpaces?.()
    }
  }, [loadDashboard])

  const projects = React.useMemo(() => filterProjectsByScope(data.projects, scope), [data.projects, scope])
  const requirements = React.useMemo(() => filterRequirementsByScope(data.requirements, scope), [data.requirements, scope])
  const tasks = React.useMemo(() => filterTasksByScope(data.tasks, scope), [data.tasks, scope])

  const linkedNotes = React.useMemo(() => {
    if (scope === "all") {
      return uniqueNotes(Object.values(data.linkedNotesByProject).flat())
    }

    return uniqueNotes(data.linkedNotesByProject[scope] || [])
  }, [data.linkedNotesByProject, scope])

  const noteScopeFiles = React.useMemo(() => {
    if (scope === "all") return data.noteFiles
    return data.linkedNotesByProject[scope] || []
  }, [data.linkedNotesByProject, data.noteFiles, scope])

  const projectIndexMap = React.useMemo(() => {
    // 先把项目顺序建成索引，后面做详情列表和跳转时可以稳定复用。
    return new Map(projects.map((project, index) => [project.id, index]))
  }, [projects])

  const timeBuckets = React.useMemo(() => buildBuckets(range), [range])

  const projectDoneCount = projects.filter((project) => project.status === "done").length
  const requirementDoneCount = requirements.filter((item) => item.status === "done").length
  const taskDoneCount = tasks.filter((item) => item.status === "done" || item.isCompleted === 1).length
  const noteCount = data.noteFiles.length
  const linkedNoteCount = linkedNotes.length
  const overdueTaskCount = tasks.filter((task) => {
    const due = toDate(task.dueAt)
    if (!due) return false
    return due.getTime() < Date.now() && task.status !== "done" && task.isCompleted !== 1
  }).length

  const projectCompletion = completionRate(projectDoneCount, projects.length)
  const requirementCompletion = completionRate(requirementDoneCount, requirements.length)
  const taskCompletion = completionRate(taskDoneCount, tasks.length)
  const overallCompletion = getOverallScore([projectCompletion, requirementCompletion, taskCompletion])

  const activityData = React.useMemo(() => {
    return buildSeriesData(timeBuckets, {
      tasks: tasks.map((task) => task.completedAt || task.updatedAt),
      notes: noteScopeFiles.map((note) => note.updatedAt),
    })
  }, [noteScopeFiles, tasks, timeBuckets])

  const cycleData = React.useMemo(() => {
    return buildSeriesData(timeBuckets, {
      requirements: requirements.map((item) => item.completedAt || item.updatedAt),
      projects: projects.map((project) => project.completedAt || project.updatedAt),
    })
  }, [projects, requirements, timeBuckets])

  const priorityData = React.useMemo(() => {
    const counts = {
      urgent: tasks.filter((task) => task.priority === "urgent").length,
      high: tasks.filter((task) => task.priority === "high").length,
      normal: tasks.filter((task) => task.priority === "normal").length,
      low: tasks.filter((task) => task.priority === "low").length,
    }

    return Object.entries(counts).map(([priority, value]) => ({
      priority,
      value,
      fill: STATUS_COLORS[priority as Priority],
    }))
  }, [tasks])

  const requirementStatusData = React.useMemo(() => {
    const statusCounts = {
      todo: requirements.filter((item) => item.status === "todo").length,
      doing: requirements.filter((item) => item.status === "doing").length,
      done: requirements.filter((item) => item.status === "done").length,
      archived: requirements.filter((item) => item.status === "archived").length,
    }

    return Object.entries(statusCounts).map(([status, value]) => ({
      status,
      value,
      fill: STATUS_COLORS[status as keyof typeof STATUS_COLORS],
    }))
  }, [requirements])

  const taskStatusData = React.useMemo(() => {
    const statusCounts = {
      todo: tasks.filter((task) => task.status === "todo").length,
      doing: tasks.filter((task) => task.status === "doing").length,
      done: tasks.filter((task) => task.status === "done").length,
      cancelled: tasks.filter((task) => task.status === "cancelled").length,
    }

    return Object.entries(statusCounts).map(([status, value]) => ({
      status,
      value,
      fill: STATUS_COLORS[status as keyof typeof STATUS_COLORS],
    }))
  }, [tasks])

  const radarData = React.useMemo(() => {
    const doneRate = (done: number, total: number) => completionRate(done, total)
    const noteCoverage = completionRate(linkedNoteCount, Math.max(noteCount, 1))
    const overdueControl = Math.max(0, 100 - completionRate(overdueTaskCount, Math.max(tasks.length, 1)))
    const rhythm = completionRate(tasks.filter((task) => task.status === "doing").length, Math.max(tasks.length, 1))

    return [
      {
        axis: "进度",
        value: doneRate(taskDoneCount, tasks.length),
      },
      {
        axis: "需求",
        value: doneRate(requirementDoneCount, requirements.length),
      },
      {
        axis: "项目",
        value: doneRate(projectDoneCount, projects.length),
      },
      {
        axis: "笔记",
        value: noteCoverage,
      },
      {
        axis: "节奏",
        value: rhythm,
      },
      {
        axis: "控制",
        value: overdueControl,
      },
    ]
  }, [
    linkedNoteCount,
    noteCount,
    overdueTaskCount,
    projectDoneCount,
    projects.length,
    requirementDoneCount,
    requirements.length,
    taskDoneCount,
    tasks.length,
  ])

  const radialData = React.useMemo(() => {
    return [
      {
        name: "completion",
        value: overallCompletion,
        fill: "var(--color-completion)",
      },
    ]
  }, [overallCompletion])

  // 只要系列里完全没有值，就显示空态，避免全零图表看起来像渲染失败。
  const hasActivitySeries = activityData.some((row) => Number(row.tasks) > 0 || Number(row.notes) > 0)
  const hasCycleSeries = cycleData.some((row) => Number(row.requirements) > 0 || Number(row.projects) > 0)
  const hasPrioritySeries = priorityData.some((item) => item.value > 0)
  const hasRequirementStatusSeries = requirementStatusData.some((item) => item.value > 0)
  const hasTaskStatusSeries = taskStatusData.some((item) => item.value > 0)
  const hasStatusSeries = hasRequirementStatusSeries || hasTaskStatusSeries
  const hasRadarSeries = radarData.some((item) => item.value > 0)
  const hasProgressSeries = projects.length > 0 || requirements.length > 0 || tasks.length > 0

  const hasContent = projects.length > 0 || requirements.length > 0 || tasks.length > 0 || noteCount > 0

  const drilldownItems = React.useMemo(() => {
    if (!drilldown) return { requirements: [] as DrilldownItem[], tasks: [] as DrilldownItem[] }

    const sortByProject = (left: DrilldownItem, right: DrilldownItem) => {
      const leftIndex = projectIndexMap.get(left.projectId) ?? Number.MAX_SAFE_INTEGER
      const rightIndex = projectIndexMap.get(right.projectId) ?? Number.MAX_SAFE_INTEGER
      return leftIndex - rightIndex
    }

    // 点击图表后，把命中的需求和任务按同一筛选条件组装出来，弹窗里直接能继续跳转。
    if (drilldown.kind === "priority") {
      const requirementRows = requirements
        .filter((item) => item.priority === drilldown.key)
        .map((item) => ({
          type: "requirement" as const,
          id: item.id,
          title: item.title,
          description: item.description,
          projectId: item.projectId,
          projectTitle: projects.find((project) => project.id === item.projectId)?.title || "未命名项目",
          requirementId: item.id,
          requirementTitle: item.title,
          status: item.status,
          priority: item.priority,
          dueAt: item.dueAt,
          completedAt: item.completedAt,
          color: item.color,
        }))

      const taskRows = tasks
        .filter((item) => item.priority === drilldown.key)
        .map((item) => ({
          type: "task" as const,
          id: item.id,
          title: item.title,
          description: item.description,
          projectId: item.projectId,
          projectTitle: projects.find((project) => project.id === item.projectId)?.title || "未命名项目",
          requirementId: item.requirementId,
          requirementTitle: item.requirementTitle,
          status: item.status,
          priority: item.priority,
          startedAt: item.startedAt,
          dueAt: item.dueAt,
          completedAt: item.completedAt,
          color: item.color,
        }))

      return {
        requirements: [...requirementRows].sort(sortByProject),
        tasks: [...taskRows].sort(sortByProject),
      }
    }

    const statusKey = drilldown.key as RequirementStatus | TaskStatus
    const requirementRows = requirements
      .filter((item) => item.status === statusKey)
      .map((item) => ({
        type: "requirement" as const,
        id: item.id,
        title: item.title,
        description: item.description,
        projectId: item.projectId,
        projectTitle: projects.find((project) => project.id === item.projectId)?.title || "未命名项目",
        requirementId: item.id,
        requirementTitle: item.title,
        status: item.status,
        priority: item.priority,
        dueAt: item.dueAt,
        completedAt: item.completedAt,
        color: item.color,
      }))

    const taskRows = tasks
      .filter((item) => item.status === statusKey)
      .map((item) => ({
        type: "task" as const,
        id: item.id,
        title: item.title,
        description: item.description,
        projectId: item.projectId,
        projectTitle: projects.find((project) => project.id === item.projectId)?.title || "未命名项目",
        requirementId: item.requirementId,
        requirementTitle: item.requirementTitle,
        status: item.status,
        priority: item.priority,
        startedAt: item.startedAt,
        dueAt: item.dueAt,
        completedAt: item.completedAt,
        color: item.color,
      }))

    if (drilldown.ring === "requirements") {
      return {
        requirements: [...requirementRows].sort(sortByProject),
        tasks: [...taskRows].sort(sortByProject),
      }
    }

    return {
      requirements: [...requirementRows].sort(sortByProject),
      tasks: [...taskRows].sort(sortByProject),
    }
  }, [drilldown, projectIndexMap, projects, requirements, tasks])

  const openPriorityDrilldown = (priority: Priority) => {
    setDrilldown({
      kind: "priority",
      key: priority,
      label: PRIORITY_LABEL[priority],
      description: `查看紧急程度为「${PRIORITY_LABEL[priority]}」的需求和任务。`,
    })
  }

  const openStatusDrilldown = (status: string, ring: DrilldownRing) => {
    const label = statusPieChartConfig[status as keyof typeof statusPieChartConfig]?.label
    setDrilldown({
      kind: "status",
      ring,
      key: status,
      label: typeof label === "string" ? label : String(label || status),
      description:
        ring === "requirements"
          ? `外环是需求状态「${typeof label === "string" ? label : String(label || status)}」，点击后可继续去项目定位。`
          : `内环是任务状态「${typeof label === "string" ? label : String(label || status)}」，点击后可继续去任务页筛选。`,
    })
  }

  const saveTaskFilters = (filters: TaskFilters) => {
    window.localStorage.setItem(TASK_FILTER_STORAGE_KEY, JSON.stringify(filters))
  }

  const openTasksWithFilters = (filters: TaskFilters) => {
    // 任务页会读取本地筛选状态，这样就能用同一套页面直接跳到对应任务。
    saveTaskFilters(filters)
    router.push("/tasks")
  }

  const openProjectFocus = (projectId: string, focus: `requirement:${string}` | `task:${string}`) => {
    // 项目详情页支持 focus 参数，打开时会直接滚动到目标行。
    router.push(`/projects/${projectId}?view=list&focus=${encodeURIComponent(focus)}`)
  }

  const buildTasksPageFilters = (item: DrilldownItem): TaskFilters => {
    // 任务页仍然走自己的过滤状态，这里只负责把筛选条件写进去再跳转。
    const filters: TaskFilters = {
      projectId: item.projectId,
    }

    if (item.type === "task" && item.requirementId) {
      filters.requirementId = item.requirementId
    }

    if (drilldown?.kind === "priority") {
      filters.priority = drilldown.key as Priority
    }

    if (drilldown?.kind === "status" && item.type === "task") {
      filters.statuses = [drilldown.key as TaskStatus]
    }

    return filters
  }

  if (loading) {
    // 加载态只展示 shimmer，避免 dashboard 初次进入时出现跳动的旧数据。
    return (
      <main className="flex min-h-screen w-full flex-col gap-4 p-4 md:p-6">
        <div className="flex flex-col gap-3">
          <ShimmerBlock className="h-7 w-40" />
          <ShimmerDemo className="w-96 max-w-full" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="space-y-3 pb-3">
                <ShimmerBlock className="h-4 w-24" />
                <ShimmerBlock className="h-8 w-28" />
                <ShimmerBlock className="h-4 w-3/5" />
              </CardHeader>
              <CardContent className="space-y-3">
                <ShimmerBlock className="h-2 w-full" />
                <ShimmerBlock className="h-4 w-40" />
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-8">
            <CardHeader>
              <ShimmerBlock className="h-5 w-40" />
              <ShimmerBlock className="h-4 w-72" />
            </CardHeader>
            <CardContent className="h-[320px]">
              <ShimmerBlock className="h-full w-full rounded-xl" />
            </CardContent>
          </Card>
          <Card className="xl:col-span-4">
            <CardHeader>
              <ShimmerBlock className="h-5 w-32" />
              <ShimmerBlock className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <ShimmerBlock className="h-[280px] w-full rounded-xl" />
              <ShimmerBlock className="h-20 w-full rounded-xl" />
            </CardContent>
          </Card>
        </div>
      </main>
    )
  }

  if (!hasContent) {
    // 空状态保持干净，不硬塞图表，让用户先去创建项目和任务。
    return (
      <main className="flex min-h-screen w-full items-center justify-center p-4 md:p-6">
        <Empty className="max-w-xl rounded-2xl border border-dashed bg-card py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Folder className="size-4" />
            </EmptyMedia>
            <EmptyTitle>还没有可展示的数据</EmptyTitle>
            <EmptyDescription>先创建项目、需求、任务或笔记，Dashboard 会自动变成完整看板。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center gap-2">
            <Button asChild>
              <Link
                href={PROJECTS_LIST_HREF}
                onClick={() => {
                  // 空状态里也直接回到项目一级列表，避免把用户丢到空白项目详情页。
                  saveProjectsListSnapshot()
                }}
              >
                查看项目
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/tasks">查看任务</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen w-full flex-col gap-4 p-4 md:p-6">
      <section className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full px-3 py-1 text-xs">
              整体看板
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Select value={scope} onValueChange={(value) => setScope(value)}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="全部项目" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部项目</SelectItem>
              {data.projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(value) => setRange(value as TimeRange)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="近 30 天" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">近 7 天</SelectItem>
              <SelectItem value="30d">近 30 天</SelectItem>
              <SelectItem value="90d">近 90 天</SelectItem>
            </SelectContent>
          </Select>

          <Button asChild variant="outline">
            <Link
              href={PROJECTS_LIST_HREF}
              onClick={() => {
                // 跳到项目一级列表时，顺手把一级导航快照写回去，避免再落到空白详情页。
                saveProjectsListSnapshot()
              }}
            >
              <ArrowUpRight className="mr-2 size-4" />
              去项目
            </Link>
          </Button>
        </div>
      </section>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <DashboardMetricCard
          title="项目"
          value={String(projects.length)}
          description="当前作用域内的项目总数"
          icon={<Folder className="size-4" />}
          toneClassName="bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60"
          progress={projectCompletion}
          footer={
            <span className="flex items-center justify-between">
              <span>{projectDoneCount} 个已完成</span>
              <span className="text-xs text-muted-foreground">{projectCompletion}%</span>
            </span>
          }
        />
        <DashboardMetricCard
          title="需求"
          value={String(requirements.length)}
          description="需求条目和完成率"
          icon={<Target className="size-4" />}
          toneClassName="bg-orange-50 text-orange-600 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-900/60"
          progress={requirementCompletion}
          footer={
            <span className="flex items-center justify-between">
              <span>{requirementDoneCount} 个已完成</span>
              <span className="text-xs text-muted-foreground">{requirementCompletion}%</span>
            </span>
          }
        />
        <DashboardMetricCard
          title="任务"
          value={String(tasks.length)}
          description="执行项、完成数和逾期数"
          icon={<CheckCircle2 className="size-4" />}
          toneClassName="bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/35 dark:text-emerald-300 dark:border-emerald-900/60"
          progress={taskCompletion}
          footer={
            <span className="flex items-center justify-between">
              <span>{overdueTaskCount} 个逾期</span>
              <span className="text-xs text-muted-foreground">{taskCompletion}%</span>
            </span>
          }
        />
        <DashboardMetricCard
          title="笔记"
          value={String(noteCount)}
          description="空间里的笔记文件数量"
          icon={<NotebookPen className="size-4" />}
          toneClassName="bg-sky-50 text-sky-600 border-sky-200 dark:bg-sky-950/35 dark:text-sky-300 dark:border-sky-900/60"
          footer={
            <span className="flex items-center justify-between">
              <span>关联 {linkedNoteCount} 条</span>
              <span className="text-xs text-muted-foreground">按所选范围统计</span>
            </span>
          }
        />
        <DashboardMetricCard
          title="总体完成率"
          value={`${overallCompletion}%`}
          description="项目、需求和任务的综合完成感"
          icon={<Activity className="size-4" />}
          toneClassName="bg-violet-50 text-violet-600 border-violet-200 dark:bg-violet-950/35 dark:text-violet-300 dark:border-violet-900/60"
          progress={overallCompletion}
          footer={
            <span className="flex items-center justify-between">
              <span>当前作用域总览</span>
              <span className="text-xs text-muted-foreground">{scope === "all" ? "全部项目" : "单项目"}</span>
            </span>
          }
        />
        <DashboardMetricCard
          title="健康提醒"
          value={String(overdueTaskCount)}
          description="需要马上处理的逾期任务"
          icon={<TriangleAlert className="size-4" />}
          toneClassName="bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-950/35 dark:text-rose-300 dark:border-rose-900/60"
          footer={
            <span className="flex items-center justify-between">
              <span>高优先级请先处理</span>
              <span className="text-xs text-muted-foreground">越少越好</span>
            </span>
          }
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <ChartFrame
          title="趋势总览"
          description="使用 area 叠加任务完成和笔记更新，快速看最近的活跃度变化。"
          icon={<LineChartIcon className="size-4" />}
          className="xl:col-span-7"
          footer={
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className={cn("border", getPriorityToneClassName("urgent"))}>
                {PRIORITY_LABEL.urgent}
              </Badge>
              <Badge variant="outline" className={cn("border", getStatusToneClassName("doing"))}>
                {TASK_STATUS_LABEL.doing}
              </Badge>
              <span>时间范围：近 {range === "7d" ? "7" : range === "30d" ? "30" : "90"} 天</span>
            </div>
          }
        >
          {hasActivitySeries ? (
            <ChartContainer config={activityChartConfig} className="h-[320px] w-full !aspect-auto">
              <AreaChart data={activityData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Area
                  type="monotone"
                  dataKey="tasks"
                  stroke="var(--color-tasks)"
                  fill="var(--color-tasks)"
                  fillOpacity={0.18}
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="notes"
                  stroke="var(--color-notes)"
                  fill="var(--color-notes)"
                  fillOpacity={0.14}
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ChartContainer>
          ) : (
            <ChartEmptyState
              title="暂无趋势数据"
              description="当前范围里没有可对比的任务或笔记变化。"
              icon={<LineChartIcon className="size-4" />}
            />
          )}
        </ChartFrame>

        <div className="xl:col-span-5 grid gap-4">
          <ChartFrame
            title="总体完成"
            description="radial 风格的完成环，适合一眼看进度。"
            icon={<CalendarRange className="size-4" />}
          >
            {hasProgressSeries ? (
              <>
                <ChartContainer config={radialChartConfig} className="h-[280px] w-full !aspect-auto">
                  <RadialBarChart
                    data={radialData}
                    innerRadius="72%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    barSize={18}
                  >
                    <ChartTooltip content={<ChartTooltipContent hideLabel indicator="line" />} />
                    <RadialBar dataKey="value" cornerRadius={999} background />
                  </RadialBarChart>
                </ChartContainer>
                <div className="flex flex-col items-center gap-1 text-center">
                  <div className="text-3xl font-semibold tracking-tight">{overallCompletion}%</div>
                  <p className="text-xs text-muted-foreground">项目 / 需求 / 任务的综合完成率</p>
                </div>
                <Separator />
                <div className="grid gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center justify-between">
                    <span>项目</span>
                    <span>{projectCompletion}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>需求</span>
                    <span>{requirementCompletion}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>任务</span>
                    <span>{taskCompletion}%</span>
                  </div>
                </div>
              </>
            ) : (
              <ChartEmptyState
                title="暂无进度数据"
                description="先创建项目、需求或任务，再来看总体完成率。"
                icon={<CalendarRange className="size-4" />}
              />
            )}
          </ChartFrame>


        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <ChartFrame
          title="优先级分布"
          description="bar 图展示紧急 / 高 / 普通 / 低的占比，方便先处理最要紧的内容。"
          icon={<BarChart3 className="size-4" />}
          className="xl:col-span-6"
        >
          {hasPrioritySeries ? (
            <>
              <ChartContainer config={priorityChartConfig} className="h-[260px] w-full !aspect-auto">
                <BarChart data={priorityData} layout="vertical" margin={{ left: 8, right: 8 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} />
                  <YAxis
                    type="category"
                    dataKey="priority"
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    tickFormatter={(value) => PRIORITY_LABEL[value as Priority]}
                  />
                  <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                  <Bar dataKey="value" radius={[0, 10, 10, 0]}>
                    {priorityData.map((entry) => (
                      <Cell
                        key={entry.priority}
                        fill={entry.fill as string}
                        className="cursor-pointer"
                        onClick={() => openPriorityDrilldown(entry.priority as Priority)}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {priorityData.map((item) => (
                  <button
                    key={item.priority}
                    type="button"
                    onClick={() => openPriorityDrilldown(item.priority as Priority)}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-1 transition hover:bg-muted"
                  >
                    <span className="size-2 rounded-full" style={{ backgroundColor: item.fill as string }} />
                    {PRIORITY_LABEL[item.priority as Priority]}
                    <span className="tabular-nums text-foreground">{item.value}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <ChartEmptyState
              title="暂无优先级数据"
              description="需要先有任务，优先级分布才会出现。"
              icon={<BarChart3 className="size-4" />}
            />
          )}
        </ChartFrame>

        <ChartFrame
          title="状态分布"
          description="双层饼图，外环看需求状态，内环看任务状态，便于一眼发现待处理压力。"
          icon={<PieChartIcon className="size-4" />}
          className="xl:col-span-6"
        >
          {hasStatusSeries ? (
            <>
              <ChartContainer config={statusPieChartConfig} className="h-[260px] w-full !aspect-auto">
                <PieChart>
                  <ChartTooltip content={<ChartTooltipContent hideLabel indicator="dot" />} />
                  <Pie
                    data={requirementStatusData}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={84}
                    outerRadius={108}
                    paddingAngle={3}
                    cornerRadius={8}
                  >
                    {requirementStatusData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={entry.fill as string}
                        className="cursor-pointer"
                        onClick={() => openStatusDrilldown(entry.status, "requirements")}
                      />
                    ))}
                  </Pie>
                  <Pie
                    data={taskStatusData}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={54}
                    outerRadius={80}
                    paddingAngle={3}
                    cornerRadius={8}
                  >
                    {taskStatusData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={entry.fill as string}
                        className="cursor-pointer"
                        onClick={() => openStatusDrilldown(entry.status, "tasks")}
                      />
                    ))}
                  </Pie>
                </PieChart>
              </ChartContainer>
              <div className="grid gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-muted-foreground">外环：需求</span>
                  {requirementStatusData.map((item) => (
                    <button
                      key={`requirement-${item.status}`}
                      type="button"
                      onClick={() => openStatusDrilldown(item.status, "requirements")}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition hover:bg-muted",
                        getStatusDistributionClassName(item.status),
                      )}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: item.fill as string }} />
                      <span>{statusPieChartConfig[item.status as keyof typeof statusPieChartConfig]?.label || item.status}</span>
                      <span className="tabular-nums text-foreground">{item.value}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border px-2 py-1 text-muted-foreground">内环：任务</span>
                  {taskStatusData.map((item) => (
                    <button
                      key={`task-${item.status}`}
                      type="button"
                      onClick={() => openStatusDrilldown(item.status, "tasks")}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 transition hover:bg-muted",
                        getStatusDistributionClassName(item.status),
                      )}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: item.fill as string }} />
                      <span>{statusPieChartConfig[item.status as keyof typeof statusPieChartConfig]?.label || item.status}</span>
                      <span className="tabular-nums text-foreground">{item.value}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <ChartEmptyState
              title="暂无状态分布"
              description="任务还没有形成足够的数据分布。"
              icon={<PieChartIcon className="size-4" />}
            />
          )}
        </ChartFrame>
      </section>

      <section className="grid gap-4 xl:grid-cols-12">
        <ChartFrame
          title="项目与需求完成"
          description="line 图对照项目和需求在时间窗口内的完成事件，便于看节奏。"
          icon={<LineChartIcon className="size-4" />}
          className="xl:col-span-6"
        >
          {hasCycleSeries ? (
            <ChartContainer config={cycleChartConfig} className="h-[280px] w-full !aspect-auto">
              <LineChart data={cycleData} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={28} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="monotone"
                  dataKey="requirements"
                  stroke="var(--color-requirements)"
                  strokeWidth={2}
                  dot={false}
                />
                <Line type="monotone" dataKey="projects" stroke="var(--color-projects)" strokeWidth={2} dot={false} />
              </LineChart>
            </ChartContainer>
          ) : (
            <ChartEmptyState
              title="暂无完成趋势"
              description="项目和需求需要一些完成记录，才能看到这条趋势线。"
              icon={<LineChartIcon className="size-4" />}
            />
          )}
        </ChartFrame>

        <ChartFrame
          title="项目健康雷达"
          description="radar 图把进度、需求、项目、笔记、节奏和控制几个维度放在一起。"
          icon={<RadarIcon className="size-4" />}
          className="xl:col-span-6"
        >
          {hasRadarSeries ? (
            <ChartContainer config={radarChartConfig} className="h-[280px] w-full !aspect-auto">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="axis" />
                <PolarRadiusAxis angle={90} domain={[0, 100]} tick={false} tickCount={5} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <Radar dataKey="value" stroke="var(--color-health)" fill="var(--color-health)" fillOpacity={0.22} />
              </RadarChart>
            </ChartContainer>
          ) : (
            <ChartEmptyState
              title="暂无健康雷达"
              description="目前还没有足够的项目、需求或任务数据。"
              icon={<RadarIcon className="size-4" />}
            />
          )}
        </ChartFrame>
      </section>

      <Dialog open={Boolean(drilldown)} onOpenChange={(open) => !open && setDrilldown(null)}>
        <DialogContent className="max-h-[82vh] max-w-5xl overflow-hidden">
          <DialogHeader>
            <DialogTitle>{drilldown?.label || "明细"}</DialogTitle>
            <DialogDescription>{drilldown?.description || "查看图表下钻后的需求和任务详情。"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 overflow-y-auto pr-1 md:grid-cols-2">
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">需求</h3>
                <Badge variant="secondary">{drilldownItems.requirements.length}</Badge>
              </div>
              <div className="space-y-2">
                {drilldownItems.requirements.length > 0 ? (
                  drilldownItems.requirements.map((item) => (
                    <article key={item.id} className="rounded-xl border border-border/70 bg-background p-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-1 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color || STATUS_COLORS.active }}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="space-y-1">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">
                              {item.description || "暂无描述"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">{item.projectTitle}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={cn("border", getStatusDistributionClassName(item.status))}>
                              {REQUIREMENT_STATUS_LABEL[item.status as keyof typeof REQUIREMENT_STATUS_LABEL] || item.status}
                            </Badge>
                            <Badge variant="outline" className={cn("border", getPriorityToneClassName(item.priority))}>
                              {PRIORITY_LABEL[item.priority]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openProjectFocus(item.projectId, `requirement:${item.id}`)}
                        >
                          去项目定位
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openTasksWithFilters(buildTasksPageFilters(item))}
                        >
                          去任务查看
                        </Button>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty className="rounded-xl border border-dashed bg-muted/20 py-8 dark:bg-muted/10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PieChartIcon className="size-4" />
                      </EmptyMedia>
                      <EmptyTitle>没有匹配的需求</EmptyTitle>
                      <EmptyDescription>当前图表条件下没有可展示的需求。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </section>
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-medium">任务</h3>
                <Badge variant="secondary">{drilldownItems.tasks.length}</Badge>
              </div>
              <div className="space-y-2">
                {drilldownItems.tasks.length > 0 ? (
                  drilldownItems.tasks.map((item) => (
                    <article key={item.id} className="rounded-xl border border-border/70 bg-background p-3">
                      <div className="flex items-start gap-3">
                        <div
                          className="mt-1 size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color || STATUS_COLORS.active }}
                        />
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="space-y-1">
                            <p className="truncate font-medium">{item.title}</p>
                            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground/80">
                              {item.description || "暂无描述"}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {item.projectTitle}
                              {item.requirementTitle ? ` · ${item.requirementTitle}` : ""}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={cn("border", getStatusDistributionClassName(item.status))}>
                              {TASK_STATUS_LABEL[item.status as keyof typeof TASK_STATUS_LABEL] || item.status}
                            </Badge>
                            <Badge variant="outline" className={cn("border", getPriorityToneClassName(item.priority))}>
                              {PRIORITY_LABEL[item.priority]}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => openProjectFocus(item.projectId, `task:${item.id}`)}
                        >
                          去项目定位
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => openTasksWithFilters(buildTasksPageFilters(item))}
                        >
                          去任务查看
                        </Button>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty className="rounded-xl border border-dashed bg-muted/20 py-8 dark:bg-muted/10">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <PieChartIcon className="size-4" />
                      </EmptyMedia>
                      <EmptyTitle>没有匹配的任务</EmptyTitle>
                      <EmptyDescription>当前图表条件下没有可展示的任务。</EmptyDescription>
                    </EmptyHeader>
                  </Empty>
                )}
              </div>
            </section>
          </div>
        </DialogContent>
      </Dialog>

    </main>
  )
}
