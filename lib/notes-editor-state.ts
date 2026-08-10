// 笔记标签状态键集中管理，确保编辑页与工作区切换使用同一套缓存约定。
export const NOTE_EDITOR_TABS_STORAGE_KEY = "hora_editor_tabs"
export const NOTE_EDITOR_ACTIVE_TAB_STORAGE_KEY = "hora_editor_active_tab"
export const NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY = "hora_editor_closed_route"

// 没有 URL open 参数时使用稳定占位，以区分普通路由和关闭全部标签后的路由。
export const NOTE_EDITOR_NO_OPEN_KEY = "__hora_blank_route_without_open__"

export type ClosedNoteRoute = {
  noteId: string | null
  openKey: string
}

// 读取“关闭全部标签”留下的精确路由，损坏缓存会被安全忽略。
export function readClosedNoteRoute(): ClosedNoteRoute | null {
  if (typeof window === "undefined") return null

  const rawValue = window.localStorage.getItem(NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY)
  if (!rawValue) return null

  try {
    const parsed = JSON.parse(rawValue) as Partial<ClosedNoteRoute>
    if (typeof parsed.openKey !== "string") return null
    if (parsed.noteId !== null && typeof parsed.noteId !== "string") return null
    return { noteId: parsed.noteId ?? null, openKey: parsed.openKey }
  } catch {
    return null
  }
}

// 最后一个标签关闭时记录当时路由，只有完全相同的路由才继续显示空白页。
export function writeClosedNoteRoute(route: ClosedNoteRoute) {
  if (typeof window === "undefined") return
  window.localStorage.setItem(NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY, JSON.stringify(route))
}

// 新文件打开后清除关闭标记，避免后续合法导航被旧状态拦截。
export function clearClosedNoteRoute() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY)
}

// 切换工作区时关闭全部笔记标签，防止新空间恢复旧空间的文件 ID。
export function clearNoteEditorTabsState() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(NOTE_EDITOR_TABS_STORAGE_KEY)
  window.localStorage.removeItem(NOTE_EDITOR_ACTIVE_TAB_STORAGE_KEY)
  window.localStorage.removeItem(NOTE_EDITOR_CLOSED_ROUTE_STORAGE_KEY)
}
