"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { useT } from "@/lib/app-language"
type MailItem = {
  title: string
}

type NavMailProps = {
  items: MailItem[]
}
export function NavMail({ items }: NavMailProps) {
  const t = useT()

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-muted-foreground">{t("mail")}</SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton className="h-8 px-2">{translateMailTitle(item.title, t)}</SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

// 邮件菜单只翻译公共文件夹名称，不影响实际数据标题。
function translateMailTitle(title: string, t: ReturnType<typeof useT>) {
  switch (title) {
    case "Inbox":
      return t("inbox")
    case "Sent":
      return t("sent")
    case "Drafts":
      return t("drafts")
    default:
      return title
  }
}
