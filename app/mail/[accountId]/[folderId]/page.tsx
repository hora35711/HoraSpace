"use client"

// 邮件文件夹页：从 URL 参数恢复当前账号和文件夹。

import { useParams } from "next/navigation"

import { MailClient } from "@/components/mail-client"

export default function MailFolderPage() {
  const params = useParams<{ accountId: string; folderId: string }>()
  return <MailClient accountId={params.accountId} folderId={params.folderId} />
}
