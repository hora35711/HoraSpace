"use client"

// 邮件文件夹页：从 URL 参数恢复当前账号和文件夹。

import * as React from "react"
import { useParams } from "next/navigation"

import { MailClient } from "@/components/mail-client"

// 文件夹页同样会在邮件客户端内读取搜索参数，所以这里统一补 Suspense 边界。
function MailFolderFallback() {
  return (
    <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-sm text-muted-foreground">
      邮件文件夹正在加载...
    </div>
  )
}

export default function MailFolderPage() {
  const params = useParams<{ accountId: string; folderId: string }>()
  return (
    <React.Suspense fallback={<MailFolderFallback />}>
      <MailClient accountId={params.accountId} folderId={params.folderId} />
    </React.Suspense>
  )
}
