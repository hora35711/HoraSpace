"use client"

// 邮件客户端页面：使用 shadcn 组件拼出账号管理、邮件列表、阅读和写信体验。

import * as React from "react"
import { useSearchParams } from "next/navigation"
import { Archive, Bell, Clock, CornerUpLeft, Forward, Inbox, Mail, MailPlus, MoveRight, OctagonAlert, Paperclip, PenLine, RefreshCw, Send, Star, Trash2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import {
  blockMailSender,
  deleteMailAccount,
  deleteMailMessage,
  deleteMailRule,
  getMailMessage,
  getMailNotificationSettings,
  listMailAccounts,
  listMailFolders,
  listMailReminderMessages,
  listMailMessages,
  listMailRules,
  saveMailAccount,
  saveMailDraft,
  saveMailNotificationSettings,
  saveMailReminder,
  saveMailRule,
  sendMail,
  syncMailAccount,
  testMailAccount,
  updateMailMessageState,
  moveMailMessage,
  type MailAccountInput,
  type MailAccountRecord,
  type MailFolderRecord,
  type MailMessageDetail,
  type MailMessageRecord,
  type MailNotificationSettings,
  type MailRuleRecord,
} from "@/lib/hora-db"

type MailClientProps = {
  accountId?: string
  folderId?: string
  view?: "mailbox" | "reminders"
}

type ComposeDraft = {
  accountId: string
  to: string
  cc: string
  bcc: string
  subject: string
  textBody: string
}

type ComposeMode = "reply" | "replyAll" | "forward"
type ReminderPreset = "oneHour" | "tonight" | "tomorrow" | "nextWeek"
type RuleDraft = {
  message: MailMessageRecord
  field: "from" | "sender_name" | "subject"
  value: string
  targetFolderId: string
}

const DEFAULT_ACCOUNT_DRAFT: MailAccountInput = {
  scope: "global",
  emailAddress: "",
  displayName: "",
  authType: "password",
  imapHost: "",
  imapPort: 993,
  imapSecure: true,
  smtpHost: "",
  smtpPort: 465,
  smtpSecure: true,
  username: "",
  password: "",
  syncEnabled: true,
  syncMode: "manual",
  syncIntervalMinutes: 15,
}

// 把逗号/分号分隔的收件人文本转成 SMTP 可用数组。
function parseRecipients(value: string) {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

// 邮件时间展示：无效时间直接回退为空字符串，避免列表出现 Invalid Date。
function formatMailDate(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleString("zh-CN", { hour12: false })
}

// 把提醒快捷项换算成具体时间，全部本地存储，由 Electron 定时器触发系统通知。
function buildReminderTime(preset: ReminderPreset) {
  const date = new Date()
  if (preset === "oneHour") date.setHours(date.getHours() + 1)
  if (preset === "tonight") date.setHours(20, 0, 0, 0)
  if (preset === "tomorrow") {
    date.setDate(date.getDate() + 1)
    date.setHours(9, 0, 0, 0)
  }
  if (preset === "nextWeek") {
    date.setDate(date.getDate() + 7)
    date.setHours(9, 0, 0, 0)
  }
  if (date.getTime() <= Date.now()) date.setDate(date.getDate() + 1)
  return date.toISOString()
}

// 从账号和文件夹里找到当前页面应该打开的默认位置。
function getFallbackSelection(accounts: MailAccountRecord[], folders: MailFolderRecord[]) {
  const account = accounts[0] || null
  const inbox = folders.find((folder) => folder.role === "inbox") || folders[0] || null
  return { account, folder: inbox }
}

export function MailClient({ accountId, folderId, view = "mailbox" }: MailClientProps) {
  const searchParams = useSearchParams()
  const targetMessageId = searchParams.get("messageId")
  const [accounts, setAccounts] = React.useState<MailAccountRecord[]>([])
  const [folders, setFolders] = React.useState<MailFolderRecord[]>([])
  const [messages, setMessages] = React.useState<MailMessageRecord[]>([])
  const [selectedMessage, setSelectedMessage] = React.useState<MailMessageDetail | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = React.useState(false)
  const [composeOpen, setComposeOpen] = React.useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false)
  const [ruleDraft, setRuleDraft] = React.useState<RuleDraft | null>(null)
  const [activeAccountId, setActiveAccountId] = React.useState<string | undefined>(accountId)
  const [loading, setLoading] = React.useState(true)
  const [syncingInbox, setSyncingInbox] = React.useState(false)
  const [syncResult, setSyncResult] = React.useState<{ ok: boolean; message: string } | null>(null)
  const [savingAccount, setSavingAccount] = React.useState(false)
  const [testingAccount, setTestingAccount] = React.useState(false)
  const [sending, setSending] = React.useState(false)
  const [accountTestResult, setAccountTestResult] = React.useState<string | null>(null)
  const [accountDraft, setAccountDraft] = React.useState<MailAccountInput>(DEFAULT_ACCOUNT_DRAFT)
  const [composeDraft, setComposeDraft] = React.useState<ComposeDraft>({
    accountId: "",
    to: "",
    cc: "",
    bcc: "",
    subject: "",
    textBody: "",
  })

  const currentAccount = React.useMemo(
    () => accounts.find((account) => account.id === accountId || account.id === activeAccountId) || accounts[0] || null,
    [accountId, accounts, activeAccountId],
  )
  const currentFolder = React.useMemo(
    () => folders.find((folder) => folder.id === folderId) || getFallbackSelection(accounts, folders).folder,
    [accounts, folderId, folders],
  )

  const loadAccounts = React.useCallback(async () => {
    const rows = await listMailAccounts()
    setAccounts(rows)
    return rows
  }, [])

  const loadFolders = React.useCallback(async (nextAccountId: string | undefined) => {
    if (!nextAccountId) {
      setFolders([])
      return []
    }
    const rows = await listMailFolders(nextAccountId)
    setFolders(rows)
    return rows
  }, [])

  const loadMessages = React.useCallback(async (nextFolderId: string | undefined, preferredMessageId?: string | null) => {
    if (view === "reminders") {
      const rows = await listMailReminderMessages()
      setMessages(rows)
      const selected = rows.find((row) => row.id === preferredMessageId) || rows[0]
      setSelectedMessage(selected ? await getMailMessage(selected.id) : null)
      return
    }

    if (!nextFolderId) {
      setMessages([])
      setSelectedMessage(null)
      return
    }
    const rows = await listMailMessages({ folderId: nextFolderId, limit: 100 })
    setMessages(rows)
    const selected = rows.find((row) => row.id === preferredMessageId) || rows[0]
    setSelectedMessage(selected ? await getMailMessage(selected.id) : null)
  }, [view])

  React.useEffect(() => {
    let disposed = false

    async function loadPage() {
      setLoading(true)
      try {
        const accountRows = await loadAccounts()
        const nextAccountId = accountId || accountRows[0]?.id
        if (!accountId) setActiveAccountId(nextAccountId)
        const folderRows = await loadFolders(nextAccountId)
        const nextFolderId = view === "reminders" ? undefined : folderId || folderRows.find((folder) => folder.role === "inbox")?.id || folderRows[0]?.id
        if (!disposed) await loadMessages(nextFolderId, targetMessageId)
      } finally {
        if (!disposed) setLoading(false)
      }
    }

    void loadPage()
    return () => {
      disposed = true
    }
  }, [accountId, folderId, loadAccounts, loadFolders, loadMessages, targetMessageId, view])

  React.useEffect(() => {
    if (!currentAccount) return
    setComposeDraft((draft) => ({ ...draft, accountId: currentAccount.id }))
  }, [currentAccount])

  React.useEffect(() => {
    // 左侧目录执行“全部已读”等邮件操作后，右侧当前列表跟着刷新。
    const handleUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ scope?: string }>).detail
      if (detail?.scope === "mail") void loadMessages(currentFolder?.id, selectedMessage?.id)
    }
    window.addEventListener("hora:db-updated", handleUpdated)
    return () => window.removeEventListener("hora:db-updated", handleUpdated)
  }, [currentFolder?.id, loadMessages, selectedMessage?.id])

  const handleSelectMessage = async (message: MailMessageRecord) => {
    // 点击未读邮件时先立即更新 UI，再异步推送远端，避免圆点停留造成“没反应”的感觉。
    if (!message.isRead) {
      setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, isRead: true } : item)))
      setSelectedMessage((current) => (current?.id === message.id ? { ...current, isRead: true } : current))
      void updateMailMessageState({ messageId: message.id, isRead: true })
    }
    const detail = await getMailMessage(message.id)
    setSelectedMessage(detail ? { ...detail, isRead: true } : null)
  }

  const handleSaveAccount = async () => {
    setSavingAccount(true)
    try {
      const saved = await saveMailAccount({
        ...accountDraft,
        username: accountDraft.username || accountDraft.emailAddress,
      })
      setAccountDialogOpen(false)
      setAccountDraft(DEFAULT_ACCOUNT_DRAFT)
      await loadAccounts()
      if (saved) {
        setActiveAccountId(saved.id)
        await loadFolders(saved.id)
      }
    } finally {
      setSavingAccount(false)
    }
  }

  const handleTestAccount = async () => {
    setTestingAccount(true)
    setAccountTestResult(null)
    try {
      const result = await testMailAccount(accountDraft)
      setAccountTestResult(result.ok ? "连接测试通过" : result.error || "连接测试失败")
    } catch (error) {
      setAccountTestResult(error instanceof Error ? error.message : String(error))
    } finally {
      setTestingAccount(false)
    }
  }

  const handleSaveDraft = async () => {
    if (!composeDraft.accountId) return
    await saveMailDraft({
      accountId: composeDraft.accountId,
      to: parseRecipients(composeDraft.to).map((address) => ({ name: "", address })),
      cc: parseRecipients(composeDraft.cc).map((address) => ({ name: "", address })),
      bcc: parseRecipients(composeDraft.bcc).map((address) => ({ name: "", address })),
      subject: composeDraft.subject,
      textBody: composeDraft.textBody,
    })
    setComposeOpen(false)
  }

  const handleSend = async () => {
    if (!composeDraft.accountId) return
    setSending(true)
    try {
      await sendMail({
        accountId: composeDraft.accountId,
        to: parseRecipients(composeDraft.to),
        cc: parseRecipients(composeDraft.cc),
        bcc: parseRecipients(composeDraft.bcc),
        subject: composeDraft.subject,
        textBody: composeDraft.textBody,
      })
      setComposeOpen(false)
      setComposeDraft({ accountId: composeDraft.accountId, to: "", cc: "", bcc: "", subject: "", textBody: "" })
      await loadMessages(currentFolder?.id)
    } finally {
      setSending(false)
    }
  }

  const handleSyncCurrentMailbox = async () => {
    if (!currentAccount) return
    setSyncingInbox(true)
    setSyncResult(null)
    try {
      const result = await syncMailAccount(currentAccount.id)
      await loadAccounts()
      const nextFolders = await loadFolders(currentAccount.id)
      const nextFolderId =
        nextFolders.find((folder) => currentFolder?.role && folder.role === currentFolder.role)?.id ||
        currentFolder?.id ||
        nextFolders.find((folder) => folder.role === "inbox")?.id ||
        nextFolders[0]?.id
      await loadMessages(nextFolderId)
      setSyncResult({
        ok: result.ok,
        message: result.error || `同步完成：${result.folders} 个文件夹，${result.messages} 封邮件`,
      })
    } catch (error) {
      setSyncResult({
        ok: false,
        message: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSyncingInbox(false)
    }
  }

  const openComposeFromMessage = async (message: MailMessageRecord, mode: ComposeMode) => {
    const detail = (await getMailMessage(message.id)) || selectedMessage
    const subjectPrefix = mode === "forward" ? "Fwd:" : "Re:"
    const originalText = detail?.body.textBody || message.snippet || ""
    const quotedText = originalText
      ? `\n\n---- 原始邮件 ----\n发件人：${message.from[0]?.address || ""}\n时间：${formatMailDate(message.receivedAt)}\n主题：${message.subject || ""}\n\n${originalText}`
      : ""
    const replyRecipients = message.from.map((item) => item.address).filter(Boolean).join(", ")
    const allRecipients = [...message.from, ...message.to]
      .map((item) => item.address)
      .filter((address) => address && address !== currentAccount?.emailAddress)
      .join(", ")

    setComposeDraft({
      accountId: message.accountId,
      to: mode === "forward" ? "" : mode === "replyAll" ? allRecipients : replyRecipients,
      cc: mode === "replyAll" ? message.cc.map((item) => item.address).filter(Boolean).join(", ") : "",
      bcc: "",
      subject: `${subjectPrefix} ${message.subject || ""}`.trim(),
      textBody: quotedText,
    })
    setComposeOpen(true)
  }

  const handleMoveMessage = async (message: MailMessageRecord, targetFolderId: string) => {
    await moveMailMessage({ messageId: message.id, targetFolderId })
    await loadMessages(currentFolder?.id)
  }

  const handleMoveToRole = async (message: MailMessageRecord, role: MailFolderRecord["role"]) => {
    const target = folders.find((folder) => folder.role === role)
    if (!target) return
    await handleMoveMessage(message, target.id)
  }

  const handleDeleteMessage = async (message: MailMessageRecord) => {
    await deleteMailMessage(message.id)
    await loadMessages(currentFolder?.id)
  }

  const handleBlockSender = async (message: MailMessageRecord) => {
    await blockMailSender({ messageId: message.id })
    await loadMessages(currentFolder?.id)
  }

  const handleOpenArchiveRule = (message: MailMessageRecord) => {
    const target = folders.find((folder) => folder.role === "archive") || folders.find((folder) => folder.role === "custom") || folders[0]
    setRuleDraft({
      message,
      field: "from",
      value: message.from[0]?.address || "",
      targetFolderId: target?.id || "",
    })
    setRuleDialogOpen(true)
  }

  const handleSaveArchiveRule = async () => {
    if (!ruleDraft?.value.trim() || !ruleDraft.targetFolderId) return
    await saveMailRule({
      accountId: ruleDraft.message.accountId,
      name: `自动归档：${ruleDraft.value.trim()}`,
      ruleType: "archive",
      field: ruleDraft.field,
      operator: "contains",
      value: ruleDraft.value.trim(),
      targetFolderId: ruleDraft.targetFolderId,
      enabled: true,
      applyExisting: true,
    })
    setRuleDialogOpen(false)
    setRuleDraft(null)
    await loadMessages(currentFolder?.id)
  }

  const handleMarkMessageRead = async (message: MailMessageRecord, isRead: boolean) => {
    // 单封已读/未读立即更新列表和详情，远端同步由主进程处理失败重试。
    setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, isRead } : item)))
    setSelectedMessage((current) => (current?.id === message.id ? { ...current, isRead } : current))
    await updateMailMessageState({ messageId: message.id, isRead })
  }

  const handleMoveToInbox = async (message: MailMessageRecord) => {
    const inbox = folders.find((folder) => folder.role === "inbox")
    if (!inbox) return
    await moveMailMessage({ messageId: message.id, targetFolderId: inbox.id })
    await loadMessages(currentFolder?.id)
  }

  const handleRemindMessage = async (message: MailMessageRecord, preset: ReminderPreset) => {
    const remindAt = buildReminderTime(preset)
    await saveMailReminder({
      messageId: message.id,
      remindAt,
      note: `提醒处理：${message.subject || "(无主题)"}`,
    })
    setMessages((items) => items.map((item) => (item.id === message.id ? { ...item, remindAt } : item)))
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold">邮件</h1>
          <p className="truncate text-sm text-muted-foreground">
            {view === "reminders"
              ? "待提醒邮件"
              : currentAccount
                ? `${currentAccount.emailAddress}${currentFolder ? ` / ${currentFolder.name}` : ""}`
                : "添加 IMAP/SMTP 邮箱后开始同步"}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleSyncCurrentMailbox()} disabled={!currentAccount || syncingInbox}>
            <RefreshCw className={cn("size-4", syncingInbox && "animate-spin")} />
            同步
          </Button>
          <Button size="sm" onClick={() => setComposeOpen(true)} disabled={accounts.length === 0}>
            <MailPlus className="size-4" />
            写信
          </Button>
          <AccountDialog
            open={accountDialogOpen}
            draft={accountDraft}
            saving={savingAccount}
            testing={testingAccount}
            testResult={accountTestResult}
            onDraftChange={setAccountDraft}
            onOpenChange={setAccountDialogOpen}
            onSubmit={handleSaveAccount}
            onTest={handleTestAccount}
          />
        </div>
      </div>

      {syncResult ? (
        <div
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            syncResult.ok ? "bg-muted/30 text-muted-foreground" : "border-destructive/30 bg-destructive/5 text-destructive",
          )}
        >
          {syncResult.message}
        </div>
      ) : null}

      {accounts.length === 0 ? (
        <Empty className="flex-1 rounded-lg border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox className="size-6" />
            </EmptyMedia>
            <EmptyTitle>还没有邮箱账号</EmptyTitle>
            <EmptyDescription>添加支持 IMAP/SMTP 的邮箱后，账号会显示在左侧邮件目录中。</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => setAccountDialogOpen(true)}>
              <MailPlus className="size-4" />
              添加邮箱
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden rounded-lg border md:grid-cols-[300px_minmax(0,1fr)]">
          <MessageList
            folders={folders}
            loading={loading}
            messages={messages}
            selectedMessage={selectedMessage}
            view={view}
            onDelete={handleDeleteMessage}
            onBlockSender={handleBlockSender}
            onCreateArchiveRule={handleOpenArchiveRule}
            onMove={handleMoveMessage}
            onMoveToInbox={handleMoveToInbox}
            onMoveToRole={handleMoveToRole}
            onMarkRead={handleMarkMessageRead}
            onRemind={handleRemindMessage}
            onReply={openComposeFromMessage}
            onSelect={handleSelectMessage}
          />
          <MessageDetail message={selectedMessage} onToggleStar={(message) => void updateMailMessageState({ messageId: message.id, isStarred: !message.isStarred })} />
        </div>
      )}

      <ComposeDialog
        open={composeOpen}
        accounts={accounts}
        draft={composeDraft}
        sending={sending}
        onDraftChange={setComposeDraft}
        onOpenChange={setComposeOpen}
        onSaveDraft={handleSaveDraft}
        onSend={handleSend}
      />
      <ArchiveRuleDialog
        open={ruleDialogOpen}
        folders={folders}
        draft={ruleDraft}
        onDraftChange={setRuleDraft}
        onOpenChange={setRuleDialogOpen}
        onSubmit={handleSaveArchiveRule}
      />
    </div>
  )
}

export function MailSettingsPanel() {
  const [accounts, setAccounts] = React.useState<MailAccountRecord[]>([])
  const [rules, setRules] = React.useState<MailRuleRecord[]>([])
  const [notificationSettings, setNotificationSettings] = React.useState<MailNotificationSettings | null>(null)
  const [accountDialogOpen, setAccountDialogOpen] = React.useState(false)
  const [accountDraft, setAccountDraft] = React.useState<MailAccountInput>(DEFAULT_ACCOUNT_DRAFT)
  const [savingAccount, setSavingAccount] = React.useState(false)
  const [testingAccount, setTestingAccount] = React.useState(false)
  const [syncingId, setSyncingId] = React.useState<string | null>(null)
  const [accountTestResult, setAccountTestResult] = React.useState<string | null>(null)

  const loadAccounts = React.useCallback(async () => {
    setAccounts(await listMailAccounts())
  }, [])

  const loadNotificationSettings = React.useCallback(async () => {
    setNotificationSettings(await getMailNotificationSettings())
  }, [])

  const loadRules = React.useCallback(async () => {
    setRules(await listMailRules(null))
  }, [])

  React.useEffect(() => {
    void loadAccounts()
    void loadNotificationSettings()
    void loadRules()
  }, [loadAccounts, loadNotificationSettings, loadRules])

  const handleAccountDialogChange = (open: boolean) => {
    setAccountDialogOpen(open)
    if (open) setAccountTestResult(null)
  }

  const handleSaveAccount = async () => {
    setSavingAccount(true)
    try {
      await saveMailAccount({
        ...accountDraft,
        username: accountDraft.username || accountDraft.emailAddress,
      })
      setAccountDialogOpen(false)
      setAccountDraft(DEFAULT_ACCOUNT_DRAFT)
      await loadAccounts()
    } finally {
      setSavingAccount(false)
    }
  }

  const handleTestAccount = async () => {
    setTestingAccount(true)
    setAccountTestResult(null)
    try {
      const result = await testMailAccount(accountDraft)
      setAccountTestResult(result.ok ? "连接测试通过" : result.error || "连接测试失败")
    } catch (error) {
      setAccountTestResult(error instanceof Error ? error.message : String(error))
    } finally {
      setTestingAccount(false)
    }
  }

  const handleSyncAccount = async (accountId: string) => {
    setSyncingId(accountId)
    try {
      await syncMailAccount(accountId)
      await loadAccounts()
    } finally {
      setSyncingId(null)
    }
  }

  const handleDeleteAccount = async (accountId: string) => {
    await deleteMailAccount(accountId)
    await loadAccounts()
  }

  const handleUpdateSyncSettings = async (
    account: MailAccountRecord,
    patch: Partial<Pick<MailAccountInput, "syncEnabled" | "syncMode" | "syncIntervalMinutes">>,
  ) => {
    // 同步设置复用账号保存接口，只更新策略字段并保留现有服务器配置。
    await saveMailAccount({
      id: account.id,
      scope: account.scope,
      emailAddress: account.emailAddress,
      displayName: account.displayName,
      authType: account.authType,
      imapHost: account.imapHost,
      imapPort: account.imapPort,
      imapSecure: account.imapSecure,
      smtpHost: account.smtpHost,
      smtpPort: account.smtpPort,
      smtpSecure: account.smtpSecure,
      username: account.username,
      syncEnabled: patch.syncEnabled ?? account.syncEnabled,
      syncMode: patch.syncMode ?? account.syncMode,
      syncIntervalMinutes: patch.syncIntervalMinutes ?? account.syncIntervalMinutes,
    })
    await loadAccounts()
  }

  const handleUpdateNotificationSettings = async (patch: Partial<Omit<MailNotificationSettings, "workspaceId" | "updatedAt">>) => {
    // 通知偏好立即保存，下一封新邮件或下一条提醒触发时生效。
    const saved = await saveMailNotificationSettings(patch)
    setNotificationSettings(saved)
  }

  const handleDeleteRule = async (ruleId: string) => {
    await deleteMailRule(ruleId)
    await loadRules()
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="rounded-lg border bg-muted/10 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Bell className="size-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold">邮件通知</h2>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">新邮件和“提醒我”会使用系统通知，点击通知会打开对应邮件。</p>
            </div>
            <Switch
              checked={notificationSettings?.enabled ?? true}
              onCheckedChange={(checked) => void handleUpdateNotificationSettings({ enabled: checked })}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
              <Label className="text-sm">仅收件箱</Label>
              <Switch
                checked={notificationSettings?.inboxOnly ?? true}
                disabled={!notificationSettings?.enabled}
                onCheckedChange={(checked) => void handleUpdateNotificationSettings({ inboxOnly: checked })}
              />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
              <Label className="text-sm">显示摘要</Label>
              <Switch
                checked={notificationSettings?.includeBodyPreview ?? false}
                disabled={!notificationSettings?.enabled}
                onCheckedChange={(checked) => void handleUpdateNotificationSettings({ includeBodyPreview: checked })}
              />
            </div>
            <Field label="勿扰开始">
              <Input
                type="time"
                value={notificationSettings?.quietStart || ""}
                disabled={!notificationSettings?.enabled}
                onChange={(event) => void handleUpdateNotificationSettings({ quietStart: event.target.value || null })}
              />
            </Field>
            <Field label="勿扰结束">
              <Input
                type="time"
                value={notificationSettings?.quietEnd || ""}
                disabled={!notificationSettings?.enabled}
                onChange={(event) => void handleUpdateNotificationSettings({ quietEnd: event.target.value || null })}
              />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">邮箱账号</h2>
            <p className="mt-1 text-sm text-muted-foreground">这里配置支持 IMAP/SMTP 的邮箱账号，配置后左侧邮件目录会自动出现账号和文件夹。</p>
          </div>
          <AccountDialog
            open={accountDialogOpen}
            draft={accountDraft}
            saving={savingAccount}
            testing={testingAccount}
            testResult={accountTestResult}
            onDraftChange={setAccountDraft}
            onOpenChange={handleAccountDialogChange}
            onSubmit={handleSaveAccount}
            onTest={handleTestAccount}
          />
        </div>

        <div className="rounded-lg border bg-muted/10 p-4">
          <div className="flex items-center gap-2">
            <Archive className="size-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold">自动规则与屏蔽</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">在邮件列表右键可创建自动归档规则，也可以屏蔽发件人。</p>

          {rules.length === 0 ? (
            <Empty className="mt-3 rounded-md border border-dashed py-8">
              <EmptyHeader>
                <EmptyTitle>暂无规则</EmptyTitle>
                <EmptyDescription>创建后，新邮件同步时会自动应用这些规则。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {rules.map((rule) => {
                const account = accounts.find((item) => item.id === rule.accountId)
                return (
                  <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={rule.ruleType === "block" ? "outline" : "secondary"}>
                          {rule.ruleType === "block" ? "屏蔽" : "归档"}
                        </Badge>
                        <span className="truncate text-sm font-medium">{rule.name}</span>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {account?.emailAddress || "全局"} · {rule.field} {rule.operator === "equals" ? "等于" : "包含"} “{rule.value}”
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => void handleDeleteRule(rule.id)}>
                      删除规则
                    </Button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {accounts.length === 0 ? (
          <Empty className="rounded-lg border border-dashed py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox className="size-5" />
              </EmptyMedia>
              <EmptyTitle>还没有邮箱账号</EmptyTitle>
              <EmptyDescription>添加账号后可以在邮件页同步、阅读和发送邮件。</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="space-y-3">
            {accounts.map((account) => (
              <div key={account.id} className="space-y-4 rounded-lg border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">{account.displayName || account.emailAddress}</p>
                      <Badge variant={account.scope === "global" ? "default" : "secondary"}>
                        {account.scope === "global" ? "全局" : "当前工作区"}
                      </Badge>
                      {account.lastError ? <Badge variant="secondary">同步异常</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-muted-foreground">
                      {account.emailAddress} · IMAP {account.imapHost}:{account.imapPort} · SMTP {account.smtpHost}:{account.smtpPort}
                    </p>
                    {account.lastSyncAt ? <p className="mt-1 text-xs text-muted-foreground">最近同步：{formatMailDate(account.lastSyncAt)}</p> : null}
                    {account.lastError ? <p className="mt-1 text-xs text-destructive">{account.lastError}</p> : null}
                  </div>
                  <Button variant="destructive" size="sm" onClick={() => void handleDeleteAccount(account.id)}>
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                </div>

                <div className="grid gap-3 rounded-md bg-muted/20 p-3 md:grid-cols-[160px_180px_160px_1fr]">
                  <div className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                    <Label className="text-sm">启用同步</Label>
                    <Switch
                      checked={account.syncEnabled}
                      onCheckedChange={(checked) => void handleUpdateSyncSettings(account, { syncEnabled: checked })}
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">同步方式</Label>
                    <Select
                      value={account.syncMode}
                      onValueChange={(value: MailAccountRecord["syncMode"]) => void handleUpdateSyncSettings(account, { syncMode: value })}
                      disabled={!account.syncEnabled}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manual">手动</SelectItem>
                        <SelectItem value="interval">定时</SelectItem>
                        <SelectItem value="realtime">实时获取</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label className="text-xs text-muted-foreground">定时间隔</Label>
                    <Select
                      value={String(account.syncIntervalMinutes)}
                      onValueChange={(value) => void handleUpdateSyncSettings(account, { syncIntervalMinutes: Number(value) })}
                      disabled={!account.syncEnabled || account.syncMode !== "interval"}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[5, 10, 15, 30, 60].map((minutes) => (
                          <SelectItem key={minutes} value={String(minutes)}>
                            {minutes} 分钟
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end justify-end">
                    <Button variant="outline" size="sm" onClick={() => void handleSyncAccount(account.id)} disabled={syncingId === account.id}>
                      <RefreshCw className={cn("size-4", syncingId === account.id && "animate-spin")} />
                      立即同步
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function AccountDialog({
  open,
  draft,
  saving,
  testing,
  testResult,
  onDraftChange,
  onOpenChange,
  onSubmit,
  onTest,
}: {
  open: boolean
  draft: MailAccountInput
  saving: boolean
  testing: boolean
  testResult: string | null
  onDraftChange: (draft: MailAccountInput) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
  onTest: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <MailPlus className="size-4" />
          添加邮箱
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>添加邮箱账号</DialogTitle>
          <DialogDescription>支持标准 IMAP/SMTP 的邮箱可以共用这一套配置。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="邮箱地址">
            <Input
              placeholder="例如：name@example.com"
              value={draft.emailAddress}
              onChange={(event) => onDraftChange({ ...draft, emailAddress: event.target.value })}
            />
          </Field>
          <Field label="显示名称">
            <Input
              placeholder="例如：张三 / Hora 工作邮箱"
              value={draft.displayName || ""}
              onChange={(event) => onDraftChange({ ...draft, displayName: event.target.value })}
            />
          </Field>
          <Field label="用户名">
            <Input
              placeholder="可先填邮箱名前缀，失败再填完整邮箱"
              value={draft.username}
              onChange={(event) => onDraftChange({ ...draft, username: event.target.value })}
            />
          </Field>
          <Field label="密码或应用专用密码">
            <Input
              type="password"
              placeholder="建议填写邮箱的应用专用密码"
              value={draft.password || ""}
              onChange={(event) => onDraftChange({ ...draft, password: event.target.value })}
            />
          </Field>
          <Field label="IMAP 主机">
            <Input
              placeholder="imap.mail.me.com"
              value={draft.imapHost}
              onChange={(event) => onDraftChange({ ...draft, imapHost: event.target.value })}
            />
          </Field>
          <Field label="IMAP 端口">
            <Input
              type="number"
              placeholder="SSL 常用 993"
              value={draft.imapPort}
              onChange={(event) => onDraftChange({ ...draft, imapPort: Number(event.target.value) })}
            />
          </Field>
          <Field label="SMTP 主机">
            <Input
              placeholder="smtp.mail.me.com"
              value={draft.smtpHost}
              onChange={(event) => onDraftChange({ ...draft, smtpHost: event.target.value })}
            />
          </Field>
          <Field label="SMTP 端口">
            <Input
              type="number"
              placeholder="587，自动走 STARTTLS"
              value={draft.smtpPort}
              onChange={(event) => onDraftChange({ ...draft, smtpPort: Number(event.target.value) })}
            />
          </Field>
          <Field label="账号范围">
            <Select value={draft.scope} onValueChange={(value: "global" | "space") => onDraftChange({ ...draft, scope: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">全局共享</SelectItem>
                <SelectItem value="space">当前工作区</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="flex items-end gap-6">
            <Toggle label="IMAP SSL" checked={draft.imapSecure} onCheckedChange={(checked) => onDraftChange({ ...draft, imapSecure: checked })} />
            <Toggle label="SMTP SSL" checked={draft.smtpSecure} onCheckedChange={(checked) => onDraftChange({ ...draft, smtpSecure: checked })} />
          </div>
        </div>

        {testResult ? <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{testResult}</div> : null}

        <DialogFooter>
          <Button variant="outline" onClick={onTest} disabled={testing || !draft.emailAddress || !draft.imapHost || !draft.smtpHost || !draft.password}>
            <RefreshCw className={cn("size-4", testing && "animate-spin")} />
            {testing ? "测试中" : "测试连接"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={saving || !draft.emailAddress || !draft.imapHost || !draft.smtpHost}>
            {saving ? "保存中" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MessageList({
  folders,
  loading,
  messages,
  selectedMessage,
  view,
  onDelete,
  onBlockSender,
  onCreateArchiveRule,
  onMarkRead,
  onMove,
  onMoveToInbox,
  onMoveToRole,
  onRemind,
  onReply,
  onSelect,
}: {
  folders: MailFolderRecord[]
  loading: boolean
  messages: MailMessageRecord[]
  selectedMessage: MailMessageDetail | null
  view: "mailbox" | "reminders"
  onDelete: (message: MailMessageRecord) => void
  onBlockSender: (message: MailMessageRecord) => void
  onCreateArchiveRule: (message: MailMessageRecord) => void
  onMarkRead: (message: MailMessageRecord, isRead: boolean) => void
  onMove: (message: MailMessageRecord, targetFolderId: string) => void
  onMoveToInbox: (message: MailMessageRecord) => void
  onMoveToRole: (message: MailMessageRecord, role: MailFolderRecord["role"]) => void
  onRemind: (message: MailMessageRecord, preset: ReminderPreset) => void
  onReply: (message: MailMessageRecord, mode: ComposeMode) => void
  onSelect: (message: MailMessageRecord) => void
}) {
  const inboxFolderId = folders.find((folder) => folder.role === "inbox")?.id

  return (
    <div className="min-h-0 overflow-y-auto border-r">
      {messages.length === 0 ? (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{loading ? "加载邮件中" : view === "reminders" ? "暂无待提醒邮件" : "这个文件夹暂无邮件"}</EmptyTitle>
            <EmptyDescription>{view === "reminders" ? "右键邮件选择提醒时间后，会集中显示在这里。" : "同步后邮件会显示在这里。"}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        messages.map((message) => (
          <ContextMenu key={message.id}>
            <ContextMenuTrigger asChild>
              <button
                type="button"
                className={cn(
                  "block w-full border-b px-4 py-3 text-left hover:bg-muted/60",
                  selectedMessage?.id === message.id && "bg-muted",
                )}
                onClick={() => void onSelect(message)}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 shrink-0 rounded-full",
                        message.isRead ? "bg-transparent" : "bg-primary",
                      )}
                    />
                    <span className={cn("truncate text-sm", !message.isRead && "font-semibold")}>
                      {message.from[0]?.name || message.from[0]?.address || "未知发件人"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {message.remindAt ? <Clock className="size-3.5" /> : null}
                    <span>{message.remindAt ? formatMailDate(message.remindAt) : formatMailDate(message.receivedAt)}</span>
                  </div>
                </div>
                <div className={cn("mt-1 truncate text-sm", !message.isRead && "font-medium")}>{message.subject || "(无主题)"}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {message.hasAttachments ? <Paperclip className="size-3.5" /> : null}
                  {message.remindAt ? <Badge variant="secondary">提醒</Badge> : null}
                  <span className="truncate">{message.snippet || "无正文预览"}</span>
                </div>
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onSelect={() => onReply(message, "reply")}>
                <CornerUpLeft className="size-4" />
                回复
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onReply(message, "replyAll")}>
                <CornerUpLeft className="size-4" />
                回复全部
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onReply(message, "forward")}>
                <Forward className="size-4" />
                转发
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onMarkRead(message, !message.isRead)}>
                <Mail className="size-4" />
                {message.isRead ? "标为未读" : "标为已读"}
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onCreateArchiveRule(message)}>
                <Archive className="size-4" />
                创建自动归档规则
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onBlockSender(message)}>
                <OctagonAlert className="size-4" />
                屏蔽发件人
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <Clock className="size-4" />
                  提醒我
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  <ContextMenuItem onSelect={() => onRemind(message, "oneHour")}>1 小时后</ContextMenuItem>
                  <ContextMenuItem onSelect={() => onRemind(message, "tonight")}>今晚 8 点</ContextMenuItem>
                  <ContextMenuItem onSelect={() => onRemind(message, "tomorrow")}>明天 9 点</ContextMenuItem>
                  <ContextMenuItem onSelect={() => onRemind(message, "nextWeek")}>下周</ContextMenuItem>
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuSub>
                <ContextMenuSubTrigger>
                  <MoveRight className="size-4" />
                  移动邮件
                </ContextMenuSubTrigger>
                <ContextMenuSubContent>
                  {folders.map((folder) => (
                    <ContextMenuItem key={folder.id} disabled={folder.id === message.folderId} onSelect={() => onMove(message, folder.id)}>
                      {folder.name}
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
              <ContextMenuItem onSelect={() => onMoveToRole(message, "junk")} disabled={!folders.some((folder) => folder.role === "junk")}>
                <MoveRight className="size-4" />
                移动至垃圾邮件
              </ContextMenuItem>
              <ContextMenuItem
                onSelect={() => onMoveToInbox(message)}
                disabled={message.folderId === inboxFolderId}
              >
                <Inbox className="size-4" />
                {folders.find((folder) => folder.id === message.folderId)?.role === "archive" ? "移除归档" : "移回收件箱"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onSelect={() => onMoveToRole(message, "trash")} disabled={!folders.some((folder) => folder.role === "trash")}>
                <Trash2 className="size-4" />
                移动至废纸篓
              </ContextMenuItem>
              <ContextMenuItem variant="destructive" onSelect={() => onDelete(message)}>
                <Trash2 className="size-4" />
                删除邮件
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        ))
      )}
    </div>
  )
}

function MessageDetail({
  message,
  onToggleStar,
}: {
  message: MailMessageDetail | null
  onToggleStar: (message: MailMessageDetail) => void
}) {
  if (!message) {
    return (
      <div className="hidden min-h-0 overflow-hidden md:block">
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PenLine className="size-5" />
            </EmptyMedia>
            <EmptyTitle>选择一封邮件</EmptyTitle>
            <EmptyDescription>邮件正文和附件会在这里离线展示。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    )
  }

  return (
    <div className="hidden min-h-0 overflow-hidden md:block">
      <div className="border-b p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{message.subject || "(无主题)"}</h2>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {message.from[0]?.name || message.from[0]?.address || "未知发件人"} · {formatMailDate(message.receivedAt)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onToggleStar(message)}>
            <Star className={cn("size-4", message.isStarred && "fill-current")} />
          </Button>
        </div>
      </div>

      <div className="min-h-0 space-y-4 overflow-hidden p-4">
        <Card>
          <CardContent className="p-4">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6">{message.body.textBody || "这封邮件还没有离线正文。"}</pre>
          </CardContent>
        </Card>

        {message.attachments.length > 0 ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">附件</div>
            {message.attachments.map((attachment) => (
              <div key={attachment.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="truncate">{attachment.filename}</span>
                <Badge variant="secondary">{Math.ceil(attachment.size / 1024)} KB</Badge>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ComposeDialog({
  open,
  accounts,
  draft,
  sending,
  onDraftChange,
  onOpenChange,
  onSaveDraft,
  onSend,
}: {
  open: boolean
  accounts: MailAccountRecord[]
  draft: ComposeDraft
  sending: boolean
  onDraftChange: (draft: ComposeDraft) => void
  onOpenChange: (open: boolean) => void
  onSaveDraft: () => void
  onSend: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>写邮件</DialogTitle>
          <DialogDescription>草稿会先保存在本地，发送成功后进入已发送列表。</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="发件账号">
            <Select value={draft.accountId} onValueChange={(value) => onDraftChange({ ...draft, accountId: value })}>
              <SelectTrigger>
                <SelectValue placeholder="选择账号" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.displayName || account.emailAddress}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="收件人">
            <Input value={draft.to} onChange={(event) => onDraftChange({ ...draft, to: event.target.value })} />
          </Field>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="抄送">
              <Input value={draft.cc} onChange={(event) => onDraftChange({ ...draft, cc: event.target.value })} />
            </Field>
            <Field label="密送">
              <Input value={draft.bcc} onChange={(event) => onDraftChange({ ...draft, bcc: event.target.value })} />
            </Field>
          </div>
          <Field label="主题">
            <Input value={draft.subject} onChange={(event) => onDraftChange({ ...draft, subject: event.target.value })} />
          </Field>
          <Field label="正文">
            <Textarea className="min-h-56" value={draft.textBody} onChange={(event) => onDraftChange({ ...draft, textBody: event.target.value })} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onSaveDraft}>
            保存草稿
          </Button>
          <Button onClick={onSend} disabled={sending || !draft.accountId || !draft.to}>
            <Send className="size-4" />
            {sending ? "发送中" : "发送"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ArchiveRuleDialog({
  open,
  folders,
  draft,
  onDraftChange,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  folders: MailFolderRecord[]
  draft: RuleDraft | null
  onDraftChange: (draft: RuleDraft | null) => void
  onOpenChange: (open: boolean) => void
  onSubmit: () => void
}) {
  const customFolders = folders.filter((folder) => folder.role === "custom" || folder.role === "archive")
  const nextDraft = draft || null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建自动归档规则</DialogTitle>
          <DialogDescription>后续同步到的新邮件命中规则后，会自动移动到指定文件夹。</DialogDescription>
        </DialogHeader>

        {nextDraft ? (
          <div className="flex flex-col gap-4">
            <Field label="匹配字段">
              <Select value={nextDraft.field} onValueChange={(value: RuleDraft["field"]) => onDraftChange({ ...nextDraft, field: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="from">发件人邮箱</SelectItem>
                  <SelectItem value="sender_name">发件人名称</SelectItem>
                  <SelectItem value="subject">标题包含</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="包含内容">
              <Input value={nextDraft.value} onChange={(event) => onDraftChange({ ...nextDraft, value: event.target.value })} />
            </Field>
            <Field label="移动到文件夹">
              <Select value={nextDraft.targetFolderId} onValueChange={(value) => onDraftChange({ ...nextDraft, targetFolderId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="选择文件夹" />
                </SelectTrigger>
                <SelectContent>
                  {customFolders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={onSubmit} disabled={!nextDraft?.value.trim() || !nextDraft.targetFolderId}>
            保存规则
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Toggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
      <Label>{label}</Label>
    </div>
  )
}
