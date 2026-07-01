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
      <SidebarGroupLabel className="text-muted-foreground">Navigation</SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild isActive={pathname === item.url || pathname.startsWith(`${item.url}/`)} className="h-8 gap-2 px-2">
                <Link href={getHref(item)} onClick={(event) => handleClick(event, item)}>
                  <item.icon className="size-4" />
                  {item.title}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
