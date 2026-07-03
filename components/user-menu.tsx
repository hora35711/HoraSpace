"use client"

import { useRouter } from "next/navigation"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

import { SidebarMenuButton } from "@/components/ui/sidebar"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"

import {
  BadgeCheckIcon,
  BellIcon,
  CreditCardIcon,
  LogOutIcon,
  Settings2Icon,
} from "lucide-react"
import { useT } from "@/lib/app-language"

export function UserMenu() {
  // 点击菜单项时直接跳转，保持菜单行为和路由行为分离。
  const router = useRouter()
  const t = useT()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-10 justify-start gap-2 px-2.5">
          <Avatar className="h-6 w-6">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{t("localUser")}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
            <BadgeCheckIcon className="size-4" />
            {t("account")}
          </DropdownMenuItem>

          <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
            <CreditCardIcon className="size-4" />
            {t("billing")}
          </DropdownMenuItem>

          <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
            <BellIcon className="size-4" />
            {t("notifications")}
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 rounded-md px-2.5 py-2"
            onSelect={() => {
              router.push("/settings")
            }}
          >
            <Settings2Icon className="size-4" />
            {t("settings")}
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" className="gap-2 rounded-md px-2.5 py-2">
          <LogOutIcon className="size-4" />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
