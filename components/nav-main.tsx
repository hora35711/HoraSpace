"use client"

import type { MouseEvent } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LucideIcon } from "lucide-react"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { PROJECTS_LIST_HREF, readProjectsNavigationSnapshot, saveProjectsListSnapshot } from "@/lib/projects-navigation-state"
import { useT } from "@/lib/app-language"

type MainItem = {
  title: string
  url: string
  icon: LucideIcon
}

type NavMainProps = {
  items: MainItem[]
}

export function NavMain({ items }: NavMainProps) {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()

  const handleClick = (event: MouseEvent<HTMLAnchorElement>, item: MainItem) => {
    if (item.url === "/projects") {
      event.preventDefault()
      if (pathname.startsWith("/projects/")) {
        // 在项目二级里再次点击左侧 Projects，视为显式回到一级列表页。
        saveProjectsListSnapshot()
        router.push(PROJECTS_LIST_HREF)
        return
      }
      router.push(readProjectsNavigationSnapshot().href)
    }
  }

  const getHref = (item: MainItem) => {
    if (item.url === "/projects") {
      if (pathname.startsWith("/projects/")) return PROJECTS_LIST_HREF
      return readProjectsNavigationSnapshot().href
    }
    return item.url
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-muted-foreground">{t("navigation")}</SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)} className="h-8 gap-2 px-2">
                <Link href={getHref(item)} onClick={(event) => handleClick(event, item)}>
                  <item.icon className="size-4" />
                  {translateNavTitle(item.title, t)}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// 侧边栏主导航只翻译公共入口名称，不碰页面标题和业务数据标题。
function translateNavTitle(title: string, t: ReturnType<typeof useT>) {
  switch (title) {
    case "Dashboard":
      return t("dashboard")
    case "Projects":
      return t("projects")
    case "Tasks":
      return t("tasks")
    default:
      return title
  }
}
