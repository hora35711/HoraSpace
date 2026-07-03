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

export function UserMenu() {
  // 点击菜单项时直接跳转，保持菜单行为和路由行为分离。
  const router = useRouter()
  // 本地默认用户：与数据库初始化数据保持一致。
  const localUserName = "本地用户"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="h-10 justify-start gap-2 px-2.5">
          <Avatar className="h-6 w-6">
            <AvatarImage src="https://github.com/shadcn.png" />
            <AvatarFallback>CN</AvatarFallback>
          </Avatar>
          <span className="truncate text-sm">{localUserName}</span>
        </SidebarMenuButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56 p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
            <BadgeCheckIcon className="size-4" />
            Account
          </DropdownMenuItem>

          <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
            <CreditCardIcon className="size-4" />
            Billing
          </DropdownMenuItem>

          <DropdownMenuItem className="gap-2 rounded-md px-2.5 py-2">
            <BellIcon className="size-4" />
            Notifications
          </DropdownMenuItem>

          <DropdownMenuItem
            className="gap-2 rounded-md px-2.5 py-2"
            onSelect={() => {
              router.push("/settings")
            }}
          >
            <Settings2Icon className="size-4" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" className="gap-2 rounded-md px-2.5 py-2">
          <LogOutIcon className="size-4" />
          Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
