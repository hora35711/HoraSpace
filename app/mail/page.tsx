"use client"

// 邮件首页：没有指定账号/文件夹时展示账号添加和默认邮箱入口。

import * as React from "react"

import { MailClient } from "@/components/mail-client"

// 邮件客户端会读取 URL 查询参数，生产构建需要 Suspense 边界承接客户端搜索参数。
function MailPageFallback() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-sm text-muted-foreground">
      邮件正在加载...
    </div>
  )
}

export default function MailPage() {
  return (
    <React.Suspense fallback={<MailPageFallback />}>
      <MailClient />
    </React.Suspense>
  )
}
