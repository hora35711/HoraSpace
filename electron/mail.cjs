// Electron 邮件服务：封装 IMAP/SMTP、MIME 解析、凭据安全存储和本地离线缓存。
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { app, Notification, safeStorage } = require("electron")
const db = require("./db.cjs")

const CREDENTIAL_SERVICE = "HoraSpace Mail"
const DEFAULT_SYNC_LIMIT = Number(process.env.HORA_MAIL_SYNC_LIMIT || 500)
const REALTIME_POLL_MINUTES = 1
let schedulerTimer = null
let reminderTimer = null
let schedulerRunning = false
let notificationClickHandler = null
const realtimeWatchers = new Map()

// 可选依赖延迟加载：让未安装协议依赖时，普通 DB/UI 启动仍能正常工作并给出明确错误。
function requireMailDependency(packageName) {
  try {
    return require(packageName)
  } catch {
    throw new Error(`邮件依赖 ${packageName} 尚未安装，请先在 electron/ 目录安装邮件依赖`)
  }
}

// 凭据文件路径：safeStorage 加密后的密文放在用户配置目录，不进入工作区数据库。
function getCredentialStorePath() {
  return path.join(app.getPath("userData"), "mail-credentials.json")
}

// 读取凭据密文索引：文件损坏时回退空对象，避免应用启动失败。
function readCredentialStore() {
  const storePath = getCredentialStorePath()
  if (!fs.existsSync(storePath)) return {}

  try {
    return JSON.parse(fs.readFileSync(storePath, "utf8"))
  } catch {
    return {}
  }
}

// 写入凭据密文索引：目录不存在时自动创建。
function writeCredentialStore(store) {
  const storePath = getCredentialStorePath()
  fs.mkdirSync(path.dirname(storePath), { recursive: true })
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2))
}

// 保存账号密码：优先使用系统级 safeStorage，加密不可用时拒绝保存明文。
function saveCredential(accountId, password) {
  if (!password) return null
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统暂不支持安全凭据加密，无法保存邮箱密码")
  }

  const credentialRef = `${CREDENTIAL_SERVICE}:${accountId}`
  const store = readCredentialStore()
  store[credentialRef] = safeStorage.encryptString(String(password)).toString("base64")
  writeCredentialStore(store)
  return credentialRef
}

// 读取账号密码：主进程发起 IMAP/SMTP 连接时临时解密。
let readCredential = function readCredential(credentialRef) {
  if (!credentialRef) return ""
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("当前系统暂不支持安全凭据解密")
  }

  const store = readCredentialStore()
  const encrypted = store[credentialRef]
  if (!encrypted) return ""
  return safeStorage.decryptString(Buffer.from(encrypted, "base64"))
}

// 删除账号密码：软删除账号时同步清掉本地密文索引。
function deleteCredential(credentialRef) {
  if (!credentialRef) return
  const store = readCredentialStore()
  delete store[credentialRef]
  writeCredentialStore(store)
}

// 邮件地址归一化：mailparser 和 imapflow 返回结构不同，这里统一成前端数组。
function normalizeAddressList(value) {
  const list = Array.isArray(value?.value) ? value.value : Array.isArray(value) ? value : []
  return list
    .map((item) => ({
      name: item.name || "",
      address: item.address || item.email || "",
    }))
    .filter((item) => item.address)
}

// 从 IMAP 特殊用途标记推导标准文件夹角色。
function roleFromMailbox(mailbox) {
  const specialUse = String(mailbox.specialUse || "").toLowerCase()
  if (specialUse.includes("inbox")) return "inbox"
  if (specialUse.includes("sent")) return "sent"
  if (specialUse.includes("draft")) return "drafts"
  if (specialUse.includes("trash")) return "trash"
  if (specialUse.includes("archive")) return "archive"
  if (specialUse.includes("junk")) return "junk"
  return undefined
}

// 建立 IMAP 客户端：所有账号共用一套标准配置转换。
function createImapClient(account) {
  const { ImapFlow } = requireMailDependency("imapflow")
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSecure === 1,
    auth: {
      user: account.username,
      pass: readCredential(account.credentialRef),
    },
    logger: false,
  })
}

// 建立 SMTP transporter：发送邮件时临时读取密码，不在渲染层暴露。
function createSmtpTransport(account) {
  const nodemailer = requireMailDependency("nodemailer")
  const smtpPort = Number(account.smtpPort)
  const useDirectTls = account.smtpSecure === 1 && smtpPort === 465
  return nodemailer.createTransport({
    host: account.smtpHost,
    port: smtpPort,
    // Nodemailer 的 secure=true 表示 465 直连 TLS；587 要用 STARTTLS。
    secure: useDirectTls,
    requireTLS: account.smtpSecure === 1 && !useDirectTls,
    auth: {
      user: account.username,
      pass: readCredential(account.credentialRef),
    },
  })
}

// 测试账号配置：先测 IMAP 登录，再测 SMTP 连接，失败会直接抛出给表单。
async function testMailAccount(input) {
  const temporaryAccount = {
    ...input,
    imapSecure: input.imapSecure === false ? 0 : 1,
    smtpSecure: input.smtpSecure === false ? 0 : 1,
    credentialRef: "__temporary__",
  }
  const password = String(input.password || "")
  const originalReadCredential = readCredential

  // 临时账号不落盘，直接在当前调用里返回输入密码。
  readCredential = (credentialRef) => (credentialRef === "__temporary__" ? password : originalReadCredential(credentialRef))
  try {
    const imap = createImapClient(temporaryAccount)
    try {
      await imap.connect()
      await imap.logout()
    } catch (error) {
      throw new Error(`IMAP 连接失败：${formatMailError(error)}`)
    }

    const smtp = createSmtpTransport(temporaryAccount)
    try {
      await smtp.verify()
    } catch (error) {
      throw new Error(`SMTP 连接失败：${formatMailError(error)}`)
    }
    return { ok: true, error: null }
  } finally {
    readCredential = originalReadCredential
  }
}

// 邮件错误格式化：把底层库的 command/code/response 一起带给前端，方便用户判断哪里填错。
function formatMailError(error) {
  if (!error) return "未知错误"
  const parts = []
  if (error.message) parts.push(error.message)
  if (error.code) parts.push(`code=${error.code}`)
  if (error.command) parts.push(`command=${error.command}`)
  if (error.response) parts.push(`response=${error.response}`)
  return parts.join("；") || String(error)
}

// 外部注入通知点击处理：main.cjs 负责把点击转换成窗口导航。
function setNotificationClickHandler(handler) {
  notificationClickHandler = typeof handler === "function" ? handler : null
}

// 判断当前是否处在勿扰时段；支持跨午夜，例如 22:00 到 08:00。
function isInQuietHours(settings) {
  if (!settings?.quietStart || !settings?.quietEnd) return false
  const [startHour, startMinute] = String(settings.quietStart).split(":").map(Number)
  const [endHour, endMinute] = String(settings.quietEnd).split(":").map(Number)
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return false

  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const startMinutes = startHour * 60 + startMinute
  const endMinutes = endHour * 60 + endMinute
  if (startMinutes === endMinutes) return false
  return startMinutes < endMinutes
    ? nowMinutes >= startMinutes && nowMinutes < endMinutes
    : nowMinutes >= startMinutes || nowMinutes < endMinutes
}

// 统一系统通知出口：所有邮件通知都先经过偏好设置和系统能力判断。
function showMailNotification({ title, body, message }) {
  if (!Notification.isSupported()) return false
  const settings = db.getMailNotificationSettings()
  if (!settings.enabled || isInQuietHours(settings)) return false

  const notification = new Notification({
    title,
    body,
  })
  notification.on("click", () => {
    if (notificationClickHandler && message) notificationClickHandler(message)
  })
  notification.show()
  return true
}

// 系统通知：同步到新收件箱邮件时提示，点击后打开对应邮件。
function notifyNewMail(message) {
  const settings = db.getMailNotificationSettings()
  const sender = message.from?.[0]?.name || message.from?.[0]?.address || "新邮件"
  showMailNotification({
    title: message.subject || "(无主题)",
    body: settings.includeBodyPreview && message.snippet ? `${sender}\n${message.snippet}` : sender,
    message,
  })
}

// 系统通知：提醒到期时提示用户回到指定邮件。
function notifyMailReminder(reminder) {
  const message = db.getMailMessage(reminder.messageId)
  if (!message) return false
  const sender = message.from?.[0]?.name || message.from?.[0]?.address || "邮件提醒"
  return showMailNotification({
    title: reminder.note || `提醒：${message.subject || "(无主题)"}`,
    body: sender,
    message,
  })
}

// 保存账号：凭据先加密，再把凭据引用写进 SQLite。
async function saveMailAccount(input) {
  const accountId = input.id || `mail_account_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
  const credentialRef = input.password ? saveCredential(accountId, input.password) : input.credentialRef
  const account = db.saveMailAccount({
    ...input,
    id: accountId,
    credentialRef,
  })

  // 新账号先补一组标准本地文件夹，首次同步后会被 IMAP 真实文件夹刷新。
  db.upsertMailFolders(account.id, [
    { path: "INBOX", name: "Inbox", role: "inbox", sortOrder: 0, isRemote: false },
    { path: "Drafts", name: "Drafts", role: "drafts", sortOrder: 1, isRemote: false },
    { path: "Sent", name: "Sent", role: "sent", sortOrder: 2, isRemote: false },
    { path: "Trash", name: "Trash", role: "trash", sortOrder: 3, isRemote: false },
  ])
  return account
}

// 删除账号：DB 软删除，凭据密文立即移除。
async function deleteMailAccount(accountId) {
  const account = db.getMailAccountInternal(accountId)
  if (account?.credentialRef) {
    deleteCredential(account.credentialRef)
  }
  return db.deleteMailAccount(accountId)
}

// 对外：创建 IMAP 自定义文件夹，成功后同步文件夹列表并返回本地记录。
async function createMailFolder(input) {
  const account = db.getMailAccountInternal(input.accountId)
  if (!account) throw new Error("邮件账号不存在")
  const folderName = String(input.name || "").trim()
  if (!folderName) throw new Error("文件夹名称不能为空")

  const client = createImapClient(account)
  try {
    await client.connect()
    await client.mailboxCreate(folderName)
    await syncMailFolders(client, account.id)
    await client.logout()
  } catch (error) {
    try {
      await client.logout()
    } catch {
      // 创建失败时连接可能已经关闭，忽略二次关闭错误。
    }
    throw new Error(`创建文件夹失败：${formatMailError(error)}`)
  }
  return db.listMailFolders(account.id).find((folder) => folder.path === folderName || folder.name === folderName) || null
}

// 对外：重命名自定义文件夹，远端成功后更新本地目录信息。
async function renameMailFolder(input) {
  const folder = db.getMailFolder(input.folderId)
  const account = folder ? db.getMailAccountInternal(folder.accountId) : null
  if (!folder || !account) throw new Error("文件夹不存在")
  if (folder.role !== "custom") throw new Error("系统文件夹不支持重命名")

  const nextName = String(input.name || "").trim()
  if (!nextName) throw new Error("文件夹名称不能为空")
  const client = createImapClient(account)
  try {
    await client.connect()
    await client.mailboxRename(folder.path, nextName)
    await client.logout()
    return db.renameMailFolder({ folderId: folder.id, name: nextName, path: nextName })
  } catch (error) {
    try {
      await client.logout()
    } catch {
      // 连接关闭错误不覆盖真实重命名错误。
    }
    throw new Error(`重命名文件夹失败：${formatMailError(error)}`)
  }
}

// 对外：删除自定义文件夹前先把远端邮件移动回收件箱，再删除远端文件夹和本地目录。
async function deleteMailFolder(input) {
  const folder = db.getMailFolder(input.folderId)
  const account = folder ? db.getMailAccountInternal(folder.accountId) : null
  const inbox = folder ? db.listMailFolders(folder.accountId).find((item) => item.role === "inbox") : null
  if (!folder || !account || !inbox) throw new Error("文件夹或收件箱不存在")
  if (folder.role !== "custom") throw new Error("系统文件夹不支持删除")

  const client = createImapClient(account)
  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder.path)
    try {
      const total = Number(client.mailbox?.exists || 0)
      if (total > 0) await client.messageMove("1:*", inbox.path)
    } finally {
      lock.release()
    }
    await client.mailboxDelete(folder.path)
    await client.logout()
  } catch (error) {
    try {
      await client.logout()
    } catch {
      // 删除失败时连接可能已经关闭，忽略收尾错误。
    }
    throw new Error(`删除文件夹失败：${formatMailError(error)}`)
  }
  return db.deleteMailFolderToInbox(folder.id)
}

// 同步文件夹列表：IMAP 返回的层级路径直接保留，前端负责按账号展示。
async function syncMailFolders(client, accountId) {
  const mailboxes = await client.list()
  const folders = mailboxes
    .filter((mailbox) => !mailbox.flags?.has?.("\\Noselect") && !mailbox.flags?.has?.("\\NonExistent"))
    .map((mailbox, index) => ({
      path: mailbox.path,
      name: mailbox.name || mailbox.path,
      delimiter: mailbox.delimiter || "/",
      role: roleFromMailbox(mailbox),
      sortOrder: index,
    }))
  return db.upsertMailFolders(accountId, folders)
}

// 生成正文摘要：列表里只需要短文本，HTML 邮件优先使用 text 版本。
function buildSnippet(parsed) {
  const text = String(parsed.text || parsed.html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return text.slice(0, 180)
}

// 把附件写入当前空间 mail-cache，并返回 DB 可存的相对信息。
function persistAttachments(accountId, messageId, attachments) {
  const baseDir = path.join(db.getMailCachePath(), accountId, messageId)
  fs.mkdirSync(baseDir, { recursive: true })

  return (attachments || []).map((attachment) => {
    const safeName = String(attachment.filename || "attachment").replace(/[\\/]/g, "_")
    const fileName = `${crypto.randomBytes(4).toString("hex")}-${safeName}`
    const absPath = path.join(baseDir, fileName)
    if (attachment.content) {
      fs.writeFileSync(absPath, attachment.content)
    }
    return {
      filename: safeName,
      contentType: attachment.contentType || null,
      size: Number(attachment.size || attachment.content?.length || 0),
      contentId: attachment.cid || null,
      cachePath: path.relative(db.getMailCachePath(), absPath).split(path.sep).join("/"),
      downloadedAt: new Date().toISOString(),
    }
  })
}

// 判断单条规则是否命中邮件，支持发件邮箱、发件人名称和主题包含/等于。
function matchesMailRule(rule, message) {
  const from = message.from?.[0] || {}
  const candidates = {
    from: from.address || "",
    sender_name: from.name || "",
    subject: message.subject || "",
  }
  const source = String(candidates[rule.field] || "").toLowerCase()
  const value = String(rule.value || "").toLowerCase()
  if (!value) return false
  return rule.operator === "equals" ? source === value : source.includes(value)
}

// 新邮件入库后应用规则：屏蔽优先移动到垃圾邮件，自动归档移动到指定文件夹。
async function applyRulesToMessage(message) {
  const rules = db.listMailRules(message.accountId).filter((rule) => rule.enabled)
  if (rules.length === 0) return message

  const folders = db.listMailFolders(message.accountId)
  const junk = folders.find((folder) => folder.role === "junk")
  for (const rule of rules) {
    if (!matchesMailRule(rule, message)) continue
    const targetFolder = rule.ruleType === "block" ? junk : folders.find((folder) => folder.id === rule.targetFolderId)
    if (!targetFolder || targetFolder.id === message.folderId) return message
    await moveMailMessage({ messageId: message.id, targetFolderId: targetFolder.id })
    return db.getMailMessage(message.id) || message
  }
  return message
}

// 保存规则后立即扫描已有邮件，把已经满足条件的历史邮件也移动到目标文件夹。
async function applyRuleToExistingMessages(rule) {
  if (!rule?.enabled || !rule.accountId) return 0
  const folders = db.listMailFolders(rule.accountId)
  const junk = folders.find((folder) => folder.role === "junk")
  const targetFolder = rule.ruleType === "block" ? junk : folders.find((folder) => folder.id === rule.targetFolderId)
  if (!targetFolder) return 0

  let movedCount = 0
  const candidates = db.listMailRuleCandidateMessages(rule.accountId)
  for (const message of candidates) {
    if (message.folderId === targetFolder.id || !matchesMailRule(rule, message)) continue
    await moveMailMessage({ messageId: message.id, targetFolderId: targetFolder.id })
    movedCount += 1
  }
  return movedCount
}

// 同步单个文件夹：第一版拉取最近一段范围，保留游标表给后续增量扩展。
async function refreshRecentFlags(client, folder, total) {
  // 轻量刷新最近一批邮件的 flags，让其他客户端的已读/星标状态能同步回本地。
  const startSeq = Math.max(1, Number(total || 0) - DEFAULT_SYNC_LIMIT + 1)
  for await (const message of client.fetch(`${startSeq}:*`, { uid: true, flags: true })) {
    const cached = db.findMailMessageByUid(folder.id, message.uid)
    if (cached?.id) {
      db.updateMailMessageFlags(cached.id, Array.from(message.flags || []))
    }
  }
}

async function syncFolderMessages(client, account, folder) {
  const { simpleParser } = requireMailDependency("mailparser")
  const lock = await client.getMailboxLock(folder.path)

  try {
    // getMailboxLock 已经完成 SELECT；这里直接使用当前 mailbox，避免重复打开导致连接状态异常。
    const mailbox = client.mailbox
    const total = Number(mailbox.exists || 0)
    if (total <= 0) {
      db.updateMailSyncState({ accountId: account.id, folderId: folder.id, syncPhase: "idle" })
      return 0
    }

    const maxCachedUid = db.getMailFolderMaxUid(folder.id)
    await refreshRecentFlags(client, folder, total)

    const startSeq = Math.max(1, total - DEFAULT_SYNC_LIMIT + 1)
    const fetchRange = maxCachedUid > 0 ? `${maxCachedUid + 1}:*` : `${startSeq}:*`
    const fetchOptions = maxCachedUid > 0 ? { uid: true } : {}
    let synced = 0
    let notified = 0

    for await (const message of client.fetch(fetchRange, {
      uid: true,
      flags: true,
      envelope: true,
      source: true,
      internalDate: true,
      size: true,
    }, fetchOptions)) {
      const parsed = await simpleParser(message.source)
      const isNewMessage = maxCachedUid > 0 && Number(message.uid) > maxCachedUid
      const saved = db.upsertMailMessage({
        accountId: account.id,
        folderId: folder.id,
        messageUid: message.uid,
        messageId: parsed.messageId,
        subject: parsed.subject || message.envelope?.subject || "(无主题)",
        from: normalizeAddressList(parsed.from),
        to: normalizeAddressList(parsed.to),
        cc: normalizeAddressList(parsed.cc),
        bcc: normalizeAddressList(parsed.bcc),
        replyTo: normalizeAddressList(parsed.replyTo),
        sentAt: parsed.date ? parsed.date.toISOString() : null,
        receivedAt: message.internalDate ? new Date(message.internalDate).toISOString() : null,
        snippet: buildSnippet(parsed),
        flags: Array.from(message.flags || []),
        hasAttachments: parsed.attachments.length > 0,
        size: message.size || 0,
      })

      db.saveMailBody({
        messageId: saved.id,
        textBody: parsed.text || "",
        htmlBody: parsed.html || "",
      })
      db.saveMailAttachments(saved.id, persistAttachments(account.id, saved.id, parsed.attachments))
      const finalMessage = isNewMessage && folder.role === "inbox" ? await applyRulesToMessage(saved) : saved
      if (isNewMessage && folder.role === "inbox" && finalMessage.folderId === folder.id && !finalMessage.isRead) {
        notifyNewMail(finalMessage)
        notified += 1
      }
      synced += 1
    }

    db.updateMailSyncState({
      accountId: account.id,
      folderId: folder.id,
      syncPhase: "idle",
      lastSyncedUid: mailbox.uidNext ? String(mailbox.uidNext) : null,
      lastSyncedModseq: mailbox.highestModseq ? String(mailbox.highestModseq) : null,
      lastIncrementalSyncAt: new Date().toISOString(),
    })
    return synced
  } finally {
    lock.release()
  }
}

// 临时连接到指定邮件所在文件夹，执行一次 IMAP 状态操作。
async function withMessageMailbox(messageId, callback) {
  const message = db.getMailMessage(messageId)
  if (!message) throw new Error("邮件不存在")
  if (!message.messageUid) throw new Error("邮件缺少远端 UID，无法同步状态")

  const account = db.getMailAccountInternal(message.accountId)
  const folder = db.getMailFolder(message.folderId)
  if (!account || !folder?.isRemote) throw new Error("邮件账号或远端文件夹不存在")

  const client = createImapClient(account)
  await client.connect()
  const lock = await client.getMailboxLock(folder.path)
  try {
    return await callback(client, message, folder)
  } finally {
    lock.release()
    await client.logout()
  }
}

// 对外：更新本地状态后推送 IMAP flags，失败时保留本地状态方便离线使用。
async function updateMailMessageState(input) {
  const updated = db.updateMailMessageState(input)
  try {
    await withMessageMailbox(input.messageId, async (client, message) => {
      if (typeof input.isRead === "boolean") {
        if (input.isRead) {
          await client.messageFlagsAdd(String(message.messageUid), ["\\Seen"], { uid: true })
        } else {
          await client.messageFlagsRemove(String(message.messageUid), ["\\Seen"], { uid: true })
        }
      }

      if (typeof input.isStarred === "boolean") {
        if (input.isStarred) {
          await client.messageFlagsAdd(String(message.messageUid), ["\\Flagged"], { uid: true })
        } else {
          await client.messageFlagsRemove(String(message.messageUid), ["\\Flagged"], { uid: true })
        }
      }
    })
    db.updateMailMessageSyncResult(input.messageId, { ok: true })
  } catch (error) {
    db.updateMailMessageSyncResult(input.messageId, {
      ok: false,
      pendingAction: input.pendingAction || "update-flags",
      lastError: formatMailError(error),
    })
    console.warn("[hora] push mail flags failed:", formatMailError(error))
  }
  return updated
}

// 对外：移动邮件先推送远端 MOVE，成功后更新本地文件夹；失败时保留本地移动意图。
async function moveMailMessage(input) {
  let remoteMoved = false
  try {
    await withMessageMailbox(input.messageId, async (client, message) => {
      const targetFolder = db.getMailFolder(input.targetFolderId)
      if (!targetFolder?.isRemote) throw new Error("目标远端文件夹不存在")
      await client.messageMove(String(message.messageUid), targetFolder.path, { uid: true })
    })
    remoteMoved = true
  } catch (error) {
    console.warn("[hora] move remote mail failed:", formatMailError(error))
  }
  const moved = db.moveMailMessage(input)
  if (remoteMoved) return db.updateMailMessageSyncResult(input.messageId, { ok: true })
  return moved
}

// 对外：删除邮件优先远端删除，随后清理本地缓存。
async function deleteMailMessage(messageId) {
  try {
    await withMessageMailbox(messageId, async (client, message) => {
      await client.messageDelete(String(message.messageUid), { uid: true })
    })
  } catch (error) {
    console.warn("[hora] delete remote mail failed:", formatMailError(error))
  }
  return db.deleteMailMessage(messageId)
}

// 对外：文件夹全部已读，先本地更新，再对远端文件夹批量加 \Seen。
async function markMailFolderRead(folderId) {
  const folder = db.getMailFolder(folderId)
  const account = folder ? db.getMailAccountInternal(folder.accountId) : null
  const changedCount = db.markMailFolderRead(folderId)
  if (!folder?.isRemote || !account || changedCount === 0) return { ok: true, changedCount }

  const client = createImapClient(account)
  try {
    await client.connect()
    const lock = await client.getMailboxLock(folder.path)
    try {
      await client.messageFlagsAdd("1:*", ["\\Seen"])
    } finally {
      lock.release()
    }
    await client.logout()
    return { ok: true, changedCount }
  } catch (error) {
    console.warn("[hora] mark folder read failed:", formatMailError(error))
    return { ok: false, changedCount, error: formatMailError(error) }
  }
}

// 对外：保存邮件提醒，提醒完全本地化，不依赖 IMAP/SMTP。
async function saveMailReminder(input) {
  if (!input?.messageId || !input?.remindAt) throw new Error("提醒缺少邮件或时间")
  return db.saveMailReminder(input)
}

// 对外：读取通知设置，前端设置页用于展示当前偏好。
function getMailNotificationSettings() {
  return db.getMailNotificationSettings()
}

// 对外：保存通知设置，下一次通知触发时立即生效。
function saveMailNotificationSettings(input) {
  return db.saveMailNotificationSettings(input)
}

// 对外：保存自动归档规则；保存后可选择立即应用给已有收件箱邮件。
async function saveMailRule(input) {
  const rule = db.saveMailRule(input)
  const appliedCount = input.applyExisting === false ? 0 : await applyRuleToExistingMessages(rule)
  return { ...rule, appliedCount }
}

// 对外：屏蔽发件人，后续同发件人邮件会自动进入垃圾邮件。
async function blockMailSender(input) {
  const message = db.getMailMessage(input.messageId)
  if (!message) throw new Error("邮件不存在")
  const sender = message.from?.[0]?.address
  if (!sender) throw new Error("邮件缺少发件人")
  const folders = db.listMailFolders(message.accountId)
  const junk = folders.find((folder) => folder.role === "junk")
  const rule = db.saveMailRule({
    accountId: message.accountId,
    name: `屏蔽 ${sender}`,
    ruleType: "block",
    field: "from",
    operator: "equals",
    value: sender,
    targetFolderId: junk?.id || null,
    enabled: true,
  })
  if (junk && message.folderId !== junk.id) {
    await moveMailMessage({ messageId: message.id, targetFolderId: junk.id })
  }
  return rule
}

// 对外：同步账号。账号失败只更新该账号错误，不影响其他账号。
async function syncMailAccount(accountId) {
  const account = db.getMailAccountInternal(accountId)
  if (!account) throw new Error("邮件账号不存在")

  const client = createImapClient(account)
  try {
    await client.connect()
    const folders = await syncMailFolders(client, account.id)
    const remoteFolders = folders.filter((folder) => folder.isRemote === true)
    let syncedMessages = 0
    const folderErrors = []

    for (const folder of remoteFolders) {
      try {
        syncedMessages += await syncFolderMessages(client, account, folder)
      } catch (error) {
        const errorMessage = `${folder.name || folder.path}：${formatMailError(error)}`
        folderErrors.push(errorMessage)
        db.updateMailSyncState({
          accountId: account.id,
          folderId: folder.id,
          syncPhase: "error",
          lastError: errorMessage,
        })
      }
    }

    await client.logout()
    db.updateMailAccountSyncState(account.id, {
      lastSyncAt: new Date().toISOString(),
      lastError: folderErrors.length > 0 ? folderErrors.join("；") : null,
    })
    return {
      ok: folderErrors.length === 0,
      folders: folders.length,
      messages: syncedMessages,
      error: folderErrors.length > 0 ? folderErrors.join("；") : null,
    }
  } catch (error) {
    db.updateMailAccountSyncState(account.id, {
      lastSyncAt: new Date().toISOString(),
      lastError: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

// 同步策略换算：实时第一版用短周期轮询，后续可替换为 IMAP IDLE。
function getSyncIntervalMs(account) {
  if (!account.syncEnabled) return null
  if (account.syncMode === "realtime") return REALTIME_POLL_MINUTES * 60 * 1000
  if (account.syncMode === "interval") return Math.max(1, Number(account.syncIntervalMinutes || 15)) * 60 * 1000
  return null
}

// 判断账号是否到达下一次自动同步时间。
function shouldAutoSyncAccount(account, nowMs) {
  const intervalMs = getSyncIntervalMs(account)
  if (!intervalMs) return false
  if (!account.lastSyncAt) return true

  const lastSyncMs = new Date(account.lastSyncAt).getTime()
  if (Number.isNaN(lastSyncMs)) return true
  return nowMs - lastSyncMs >= intervalMs
}

// 关闭单个实时监听连接，账号删除、空间切换或策略变化时调用。
async function stopRealtimeWatcher(accountId) {
  const watcher = realtimeWatchers.get(accountId)
  if (!watcher) return
  realtimeWatchers.delete(accountId)
  clearTimeout(watcher.debounceTimer)
  try {
    await watcher.client.logout()
  } catch {
    // 连接可能已经被服务器断开，关闭阶段不需要向用户暴露错误。
  }
}

// 启动 INBOX 的 IMAP IDLE 监听；有 EXISTS 事件时触发一次账号同步。
async function startRealtimeWatcher(account) {
  if (realtimeWatchers.has(account.id)) return
  const folders = db.listMailFolders(account.id)
  const inbox = folders.find((folder) => folder.role === "inbox" && folder.isRemote)
  if (!inbox) return

  const client = createImapClient(account)
  const watcher = { client, debounceTimer: null }
  realtimeWatchers.set(account.id, watcher)

  try {
    await client.connect()
    await client.mailboxOpen(inbox.path)
    client.on("exists", () => {
      clearTimeout(watcher.debounceTimer)
      // 服务器可能连续推送多条 EXISTS，轻微防抖后统一同步，减少频繁登录和解析。
      watcher.debounceTimer = setTimeout(() => {
        void syncMailAccount(account.id).catch((error) => {
          console.warn("[hora] realtime mail sync failed:", account.emailAddress, error)
        })
      }, 1200)
    })
    client.on("error", () => {
      void stopRealtimeWatcher(account.id)
    })
    client.on("close", () => {
      void stopRealtimeWatcher(account.id)
    })
  } catch (error) {
    await stopRealtimeWatcher(account.id)
    console.warn("[hora] realtime watcher failed:", account.emailAddress, formatMailError(error))
  }
}

// 对齐实时监听连接：只给开启“实时获取”的账号保留一条 INBOX IDLE 连接。
async function reconcileRealtimeWatchers(accounts) {
  const realtimeAccountIds = new Set(
    accounts
      .filter((account) => account.syncEnabled && account.syncMode === "realtime")
      .map((account) => account.id),
  )

  for (const accountId of realtimeWatchers.keys()) {
    if (!realtimeAccountIds.has(accountId)) await stopRealtimeWatcher(accountId)
  }

  for (const account of accounts) {
    if (realtimeAccountIds.has(account.id)) await startRealtimeWatcher(account)
  }
}

// 后台队列：重试已读/星标这类可重复执行的远端状态推送。
async function processPendingMailActions() {
  const pendingMessages = db.listPendingMailMessages(50)
  for (const message of pendingMessages) {
    if (message.pendingAction !== "update-flags") continue
    try {
      await withMessageMailbox(message.id, async (client) => {
        if (message.isRead) {
          await client.messageFlagsAdd(String(message.messageUid), ["\\Seen"], { uid: true })
        } else {
          await client.messageFlagsRemove(String(message.messageUid), ["\\Seen"], { uid: true })
        }

        if (message.isStarred) {
          await client.messageFlagsAdd(String(message.messageUid), ["\\Flagged"], { uid: true })
        } else {
          await client.messageFlagsRemove(String(message.messageUid), ["\\Flagged"], { uid: true })
        }
      })
      db.updateMailMessageSyncResult(message.id, { ok: true })
    } catch (error) {
      db.updateMailMessageSyncResult(message.id, {
        ok: false,
        pendingAction: "update-flags",
        lastError: formatMailError(error),
      })
    }
  }
}

// 提醒队列：到期后弹系统通知并标记 delivered，避免一分钟后重复提醒。
function processDueMailReminders() {
  const reminders = db.listDueMailReminders(new Date().toISOString(), 20)
  for (const reminder of reminders) {
    if (notifyMailReminder(reminder)) {
      db.markMailReminderDelivered(reminder.id)
    }
  }
}

// 自动同步调度器：只处理开启定时/实时的账号，失败写回账号错误但不打断其他账号。
async function runScheduledSyncOnce() {
  if (schedulerRunning) return
  schedulerRunning = true
  try {
    const nowMs = Date.now()
    const accounts = db.listMailAccounts()
    await reconcileRealtimeWatchers(accounts)
    await processPendingMailActions()
    for (const account of accounts) {
      if (!shouldAutoSyncAccount(account, nowMs)) continue
      try {
        await syncMailAccount(account.id)
      } catch (error) {
        console.warn("[hora] scheduled mail sync failed:", account.emailAddress, error)
      }
    }
    processDueMailReminders()
  } finally {
    schedulerRunning = false
  }
}

// 对外：启动后台同步调度器，空间重载后可重复调用。
function startMailScheduler() {
  if (schedulerTimer) return schedulerTimer

  schedulerTimer = setInterval(() => {
    void runScheduledSyncOnce()
  }, 60 * 1000)
  reminderTimer = setInterval(() => {
    processDueMailReminders()
  }, 30 * 1000)
  void runScheduledSyncOnce()
  return schedulerTimer
}

// 对外：停止后台同步调度器，空间切换或退出时清理计时器。
function stopMailScheduler() {
  if (schedulerTimer) clearInterval(schedulerTimer)
  if (reminderTimer) clearInterval(reminderTimer)
  schedulerTimer = null
  reminderTimer = null
  schedulerRunning = false
  for (const accountId of [...realtimeWatchers.keys()]) {
    void stopRealtimeWatcher(accountId)
  }
}

// 对外：发送邮件。发送成功后保存到本地已发送文件夹，远端已发送追加留给后续增量同步校准。
async function sendMail(input) {
  const account = db.getMailAccountInternal(input.accountId)
  if (!account) throw new Error("邮件账号不存在")

  const transport = createSmtpTransport(account)
  const info = await transport.sendMail({
    from: {
      name: account.displayName || account.emailAddress,
      address: account.emailAddress,
    },
    to: input.to,
    cc: input.cc,
    bcc: input.bcc,
    subject: input.subject || "(无主题)",
    text: input.textBody || "",
    html: input.htmlBody || undefined,
    attachments: input.attachments || [],
  })

  const sentFolder = db.listMailFolders(account.id).find((folder) => folder.role === "sent")
  if (sentFolder) {
    const saved = db.upsertMailMessage({
      accountId: account.id,
      folderId: sentFolder.id,
      messageId: info.messageId,
      subject: input.subject || "(无主题)",
      from: [{ name: account.displayName || "", address: account.emailAddress }],
      to: (input.to || []).map((address) => ({ name: "", address })),
      cc: (input.cc || []).map((address) => ({ name: "", address })),
      bcc: (input.bcc || []).map((address) => ({ name: "", address })),
      sentAt: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      snippet: String(input.textBody || "").slice(0, 180),
      flags: ["\\Seen"],
      isRead: true,
      syncStatus: "pending",
      pendingAction: "append-sent",
    })
    db.saveMailBody({ messageId: saved.id, textBody: input.textBody || "", htmlBody: input.htmlBody || "" })
  }

  if (input.draftId) {
    db.deleteMailDraft(input.draftId)
  }
  return { ok: true, messageId: info.messageId || null }
}

module.exports = {
  testMailAccount,
  saveMailAccount,
  deleteMailAccount,
  createMailFolder,
  renameMailFolder,
  deleteMailFolder,
  syncMailAccount,
  setNotificationClickHandler,
  updateMailMessageState,
  moveMailMessage,
  deleteMailMessage,
  markMailFolderRead,
  saveMailReminder,
  getMailNotificationSettings,
  saveMailNotificationSettings,
  saveMailRule,
  blockMailSender,
  startMailScheduler,
  stopMailScheduler,
  sendMail,
}
