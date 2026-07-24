"use client"

// 邮件提醒页：展示所有尚未触发的本地邮件提醒。

import { MailClient } from "@/components/mail-client"

export default function MailRemindersPage() {
  return <MailClient view="reminders" />
}
