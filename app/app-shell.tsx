"use client"

// 应用主壳：负责 Sidebar 布局、可拖拽宽度和宽度持久化。

import * as React from "react"
import { usePathname, useRouter } from "next/navigation"
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/app/AppSidebar/app-sidebar"
import { saveProjectsDetailHref } from "@/lib/projects-navigation-state"

const SIDEBAR_WIDTH_STORAGE_KEY = "hora_sidebar_width"
const SIDEBAR_WIDTH_DEFAULT = 336
const SIDEBAR_WIDTH_MIN = 220
const SIDEBAR_WIDTH_MAX = 520

// 根据当前路由判断是否处在 Project 模块的一级或二级页面。
function getProjectsRouteLevel(pathname: string) {
  if (pathname === "/projects") return "list"
  if (pathname.startsWith("/projects/")) return "detail"
  return null
}

function getHrefWithSearch(pathname: string, search: string) {
  // 保存完整地址，确保二级页的视图参数也能跟着模块切换恢复。
  const query = search.startsWith("?") ? search.slice(1) : search
  return query ? `${pathname}?${query}` : pathname
}

// 主壳组件：左侧可拖拽、右侧自适应。
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const previousPathnameRef = React.useRef(pathname)
  const previousHrefRef = React.useRef(pathname)

  // 当前 sidebar 宽度（px）。
  const [sidebarWidth, setSidebarWidth] = React.useState<number>(SIDEBAR_WIDTH_DEFAULT)

  // 首次加载时恢复上次宽度。
  React.useEffect(() => {
    const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY)
    if (!raw) return

    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return

    const clamped = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, parsed))
    setSidebarWidth(clamped)
  }, [])

  // 持久化宽度：下次打开继续使用。
  React.useEffect(() => {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth))
  }, [sidebarWidth])

  React.useEffect(() => {
    const previousPathname = previousPathnameRef.current
    const previousHref = previousHrefRef.current
    const currentHref = getHrefWithSearch(pathname, window.location.search)
    const previousProjectsLevel = getProjectsRouteLevel(previousPathname)
    const currentProjectsLevel = getProjectsRouteLevel(pathname)

    // 当前停留在 Project 模块时就记住完整地址，离开后再回来会回到当时离开的那一页。
    if (currentProjectsLevel) {
      saveProjectsDetailHref(currentHref)
    }

    // 切出 Project 模块时，也保留最后一次离开的真实地址。
    if (previousProjectsLevel && !currentProjectsLevel) {
      saveProjectsDetailHref(previousHref)
    }

    previousPathnameRef.current = pathname
    previousHrefRef.current = currentHref
  }, [pathname])

  React.useEffect(() => {
    // 系统通知点击后由主进程发来目标邮件地址，前端负责切换路由。
    const unsubscribe = window.horaDB?.onMailMessageOpen?.((payload) => {
      if (payload?.href) router.push(payload.href)
    })
    return () => {
      unsubscribe?.()
    }
  }, [router])

  React.useEffect(() => {
    // 空间切换、迁移或删除后直接整页刷新，保证右侧页面读取到新的空间数据库和插件目录。
    const unsubscribeSpaces = window.horaDB?.onSpacesChanged?.(() => {
      window.location.reload()
    })

    return () => {
      unsubscribeSpaces?.()
    }
  }, [])

  // 开始拖拽：按鼠标 X 计算新宽度。
  const handleResizeStart = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()

    const onPointerMove = (moveEvent: PointerEvent) => {
      const next = Math.max(SIDEBAR_WIDTH_MIN, Math.min(SIDEBAR_WIDTH_MAX, moveEvent.clientX))
      setSidebarWidth(next)
    }

    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      document.body.style.userSelect = ""
      document.body.style.cursor = ""
    }

    document.body.style.userSelect = "none"
    document.body.style.cursor = "col-resize"
    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
  }, [])

  // 在 notes 页面里，SidebarTrigger 放到标签行中展示，这里不重复显示。
  const hideGlobalTrigger = pathname.startsWith("/notes/")

  return (
    <SidebarProvider
      // 通过 CSS 变量驱动 Sidebar 实际宽度。
      style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
    >
      <div className="flex min-h-screen w-full">
        {/* 左侧主导航区域。 */}
        <AppSidebar />

        {/* 拖拽分隔条：仅桌面显示。 */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          onPointerDown={handleResizeStart}
          className="hidden w-1 shrink-0 cursor-col-resize bg-transparent transition hover:bg-border md:block"
        />

        {/* 右侧主内容区域：上方可选触发器，下方渲染路由页面内容。 */}
        <main className="min-w-0 flex-1 p-4">
          {!hideGlobalTrigger ? <SidebarTrigger /> : null}
          {children}
        </main>
      </div>
    </SidebarProvider>
  )
}
