"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
type MailItem = {
  title: string
}

type NavMailProps = {
  items: MailItem[]
}
export function NavMail({ items }: NavMailProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-muted-foreground">Mail</SidebarGroupLabel>

      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton className="h-8 px-2">{item.title}</SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
