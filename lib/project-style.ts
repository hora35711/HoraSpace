import type { Priority, ProjectStatus, RequirementStatus, TaskStatus } from "@/lib/hora-db"

// 统一项目域的颜色与排序规则，避免各页面各写一套导致视觉和行为不一致。
export const STATUS_TONE = {
  active: {
    label: "进行中",
    textClass: "text-slate-700",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
  },
  paused: {
    label: "暂停",
    textClass: "text-amber-700",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
  },
  done: {
    label: "已完成",
    textClass: "text-emerald-700",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
  },
  archived: {
    label: "归档",
    textClass: "text-slate-500",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
  },
  todo: {
    label: "待处理",
    textClass: "text-orange-700",
    bgClass: "bg-orange-50",
    borderClass: "border-orange-200",
  },
  doing: {
    label: "进行中",
    textClass: "text-slate-700",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
  },
  cancelled: {
    label: "取消",
    textClass: "text-slate-500",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
  },
} as const

// 优先级颜色遵循用户给定的示例值，稍微统一了浅底色和边框色。
export const PRIORITY_TONE = {
  low: {
    label: "低",
    textClass: "text-slate-600",
    bgClass: "bg-slate-50",
    borderClass: "border-slate-200",
  },
  normal: {
    label: "普通",
    textClass: "text-emerald-700",
    bgClass: "bg-emerald-50",
    borderClass: "border-emerald-200",
  },
  high: {
    label: "高",
    textClass: "text-amber-700",
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
  },
  urgent: {
    label: "紧急",
    textClass: "text-rose-700",
    bgClass: "bg-rose-50",
    borderClass: "border-rose-200",
  },
} as const

// 项目、需求、任务都按优先级从高到低排序，状态仅作为次级视觉和稳定排序依据。
export const PRIORITY_ORDER: Record<Priority, number> = {
  urgent: 3,
  high: 2,
  normal: 1,
  low: 0,
}

// 统一项目状态标签，避免各页面文案不一致。
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  active: STATUS_TONE.active.label,
  paused: STATUS_TONE.paused.label,
  done: STATUS_TONE.done.label,
  archived: STATUS_TONE.archived.label,
}

// 统一需求状态标签。
export const REQUIREMENT_STATUS_LABEL: Record<RequirementStatus, string> = {
  todo: STATUS_TONE.todo.label,
  doing: STATUS_TONE.doing.label,
  done: STATUS_TONE.done.label,
  archived: STATUS_TONE.archived.label,
}

// 统一任务状态标签。
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: STATUS_TONE.todo.label,
  doing: STATUS_TONE.doing.label,
  done: STATUS_TONE.done.label,
  cancelled: STATUS_TONE.cancelled.label,
}

// 统一优先级标签。
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: PRIORITY_TONE.low.label,
  normal: PRIORITY_TONE.normal.label,
  high: PRIORITY_TONE.high.label,
  urgent: PRIORITY_TONE.urgent.label,
}

// 任务与需求的稳定排序：优先级先行，未完成排前，最后用原始排序号兜底。
export function compareByPriorityThenSortOrder<T extends { priority: Priority; sortOrder: number }>(a: T, b: T) {
  const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
  if (priorityDiff !== 0) return priorityDiff
  return a.sortOrder - b.sortOrder
}

// 进行中永远优先，其次按待处理、已完成、归档或取消往后排。
export function getStatusRank(status: string) {
  switch (status) {
    case "doing":
    case "active":
      return 0
    case "todo":
      return 1
    case "paused":
      return 2
    case "done":
      return 3
    case "cancelled":
    case "archived":
      return 4
    default:
      return 5
  }
}

// 通用排序：先优先级，再状态，最后按表内顺序。
export function compareByStatusThenPriority<T extends { status: string; priority: Priority; sortOrder: number }>(a: T, b: T) {
  const priorityDiff = PRIORITY_ORDER[b.priority] - PRIORITY_ORDER[a.priority]
  if (priorityDiff !== 0) return priorityDiff
  const statusDiff = getStatusRank(a.status) - getStatusRank(b.status)
  if (statusDiff !== 0) return statusDiff
  return a.sortOrder - b.sortOrder
}

// project / requirement / task 的状态徽标统一走同一个底层样式，减少页面分叉。
export function getStatusToneClassName(status: keyof typeof STATUS_TONE) {
  const tone = STATUS_TONE[status]
  return `${tone.bgClass} ${tone.textClass} ${tone.borderClass}`
}

// 优先级徽标统一样式。
export function getPriorityToneClassName(priority: Priority) {
  const tone = PRIORITY_TONE[priority]
  return `${tone.bgClass} ${tone.textClass} ${tone.borderClass}`
}

// 轻量辅助：用于列表中的小圆点或强调块，保持视觉一致。
export function getPriorityColor(priority: Priority) {
  switch (priority) {
    case "urgent":
      return "#E28A8A"
    case "high":
      return "#E2B36B"
    case "normal":
      return "#8CC9A1"
    case "low":
    default:
      return "#8AA8E8"
  }
}
