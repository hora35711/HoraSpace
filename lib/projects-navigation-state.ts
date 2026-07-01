"use client"

// Project 模块导航快照：统一记录离开模块时最后停留的一级或二级地址。

export const PROJECTS_LIST_HREF = "/projects?list=1"
const PROJECTS_NAVIGATION_SNAPSHOT_KEY = "hora_projects_navigation_snapshot"

export type ProjectLayoutMode = "list" | "board" | "gantt"
type ProjectsNavigationSnapshot = {
  href: string
  level: "list" | "detail"
}

function getDefaultSnapshot(): ProjectsNavigationSnapshot {
  // 默认入口始终是“我的项目”一级列表页。
  return {
    href: PROJECTS_LIST_HREF,
    level: "list",
  }
}

export function readProjectsNavigationSnapshot(): ProjectsNavigationSnapshot {
  if (typeof window === "undefined") return getDefaultSnapshot()

  const raw = window.localStorage.getItem(PROJECTS_NAVIGATION_SNAPSHOT_KEY)
  if (!raw) return getDefaultSnapshot()

  try {
    const parsed = JSON.parse(raw) as ProjectsNavigationSnapshot
    if (!parsed?.href?.startsWith("/projects")) return getDefaultSnapshot()
    if (parsed.level !== "list" && parsed.level !== "detail") return getDefaultSnapshot()
    return parsed
  } catch {
    return getDefaultSnapshot()
  }
}

function saveProjectsNavigationSnapshot(snapshot: ProjectsNavigationSnapshot) {
  window.localStorage.setItem(PROJECTS_NAVIGATION_SNAPSHOT_KEY, JSON.stringify(snapshot))
}

export function saveProjectsListSnapshot() {
  // 进入或停留在一级页时，统一保存“我的项目”列表页地址。
  saveProjectsNavigationSnapshot({
    href: PROJECTS_LIST_HREF,
    level: "list",
  })
}

export function saveProjectsDetailSnapshot(projectId: string, layoutMode: ProjectLayoutMode) {
  // 进入或停留在二级页时，保存当前项目和布局。
  saveProjectsNavigationSnapshot({
    href: `/projects/${projectId}?view=${layoutMode}`,
    level: "detail",
  })
}

export function saveProjectsDetailHref(href: string) {
  // 从 Tasks 等外部入口进入项目时，可以直接写入目标详情地址。
  saveProjectsNavigationSnapshot({
    href,
    level: "detail",
  })
}
