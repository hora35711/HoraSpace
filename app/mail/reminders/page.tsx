"use client"

// 邮件提醒页：展示所有尚未触发的本地邮件提醒。

import * as React from "react"

import { MailClient } from "@/components/mail-client"

// 提醒页复用邮件客户端，给查询参数读取提供生产构建需要的 Suspense 边界。
function MailRemindersFallback() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-sm text-muted-foreground">
      邮件提醒正在加载...
    </div>
  )
}

export default function MailRemindersPage() {
  return (
    <React.Suspense fallback={<MailRemindersFallback />}>
      <MailClient view="reminders" />
    </React.Suspense>
  )
}
