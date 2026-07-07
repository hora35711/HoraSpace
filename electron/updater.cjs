// 轻量更新检查：第一版只提示和跳转 GitHub Release，不自动下载或安装。
const fs = require("node:fs")
const path = require("node:path")
const https = require("node:https")
const { app, shell } = require("electron")

const UPDATE_REPO_OWNER = "hora35711"
const UPDATE_REPO_NAME = "HoraSpace"
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases`
const UPDATE_RELEASES_ATOM_URL = `${UPDATE_RELEASES_URL}.atom`
const UPDATE_LATEST_API_URL = `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`
const DEFAULT_UPDATE_SETTINGS = {
  enabled: false,
  schedule: "daily",
  dailyHour: 10,
  lastCheckedAt: null,
}

let latestStatus = {
  state: "idle",
  currentVersion: "0.0.0",
  update: null,
  error: null,
  checkedAt: null,
}

let statusBroadcaster = () => {}

// 设置状态广播器：主进程用它把检查结果推给所有窗口。
function setUpdateStatusBroadcaster(nextBroadcaster) {
  statusBroadcaster = typeof nextBroadcaster === "function" ? nextBroadcaster : () => {}
}

// 用户更新设置独立存放在 userData，避免混进空间数据库。
function getUpdateSettingsPath() {
  return path.join(app.getPath("userData"), "update-settings.json")
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, "utf8"))
  } catch (error) {
    console.error("[hora] read update settings failed:", error)
    return fallback
  }
}

function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function normalizeUpdateSettings(input) {
  return {
    enabled: Boolean(input?.enabled),
    schedule: input?.schedule === "startup" ? "startup" : "daily",
    dailyHour: Number.isInteger(input?.dailyHour)
      ? Math.min(23, Math.max(0, input.dailyHour))
      : DEFAULT_UPDATE_SETTINGS.dailyHour,
    lastCheckedAt: typeof input?.lastCheckedAt === "string" ? input.lastCheckedAt : null,
  }
}

function getUpdateSettings() {
  return normalizeUpdateSettings(readJsonFile(getUpdateSettingsPath(), DEFAULT_UPDATE_SETTINGS))
}

function setUpdateSettings(input) {
  const current = getUpdateSettings()
  const next = normalizeUpdateSettings({ ...current, ...input })
  writeJsonFile(getUpdateSettingsPath(), next)
  return next
}

function getCurrentVersion() {
  return app.getVersion()
}

function stripVersionPrefix(version) {
  return String(version || "").trim().replace(/^v/i, "")
}

function compareVersions(left, right) {
  const leftParts = stripVersionPrefix(left).split(".").map((part) => Number.parseInt(part, 10) || 0)
  const rightParts = stripVersionPrefix(right).split(".").map((part) => Number.parseInt(part, 10) || 0)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (diff !== 0) return diff
  }

  return 0
}

function buildReleaseSummary(body) {
  const firstParagraph = String(body || "")
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s*/gm, "").trim())
    .find(Boolean)

  return firstParagraph || "这个版本暂时没有填写更新说明。"
}

function decodeXmlText(text) {
  return String(text || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
}

function stripHtml(text) {
  return decodeXmlText(text)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isStableVersionTag(tagName) {
  return /^v?\d+\.\d+\.\d+$/.test(String(tagName || "").trim())
}

function fetchText(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent": "HoraSpace",
          ...headers,
        },
      },
      (response) => {
        const chunks = []

        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub Release 页面请求失败：${response.statusCode || "unknown"} ${text}`))
            return
          }

          resolve(text)
        })
      },
    )

    request.on("error", reject)
    request.setTimeout(15000, () => {
      request.destroy(new Error("GitHub Release 页面请求超时"))
    })
  })
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "HoraSpace",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
      (response) => {
        const chunks = []

        response.on("data", (chunk) => chunks.push(chunk))
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8")
          if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`GitHub Release 请求失败：${response.statusCode || "unknown"} ${text}`))
            return
          }

          try {
            resolve(JSON.parse(text))
          } catch (error) {
            reject(error)
          }
        })
      },
    )

    request.on("error", reject)
    request.setTimeout(15000, () => {
      request.destroy(new Error("GitHub Release 请求超时"))
    })
  })
}

function updateStatus(nextStatus) {
  latestStatus = {
    ...latestStatus,
    ...nextStatus,
  }
  statusBroadcaster(latestStatus)
  return latestStatus
}

function toReleaseInfo(release) {
  const version = stripVersionPrefix(release.tag_name)
  return {
    version,
    tagName: release.tag_name,
    name: release.name || `HoraSpace ${release.tag_name}`,
    publishedAt: release.published_at || release.created_at || null,
    releaseUrl: release.html_url || UPDATE_RELEASES_URL,
    summary: buildReleaseSummary(release.body),
    body: release.body || "",
    assets: Array.isArray(release.assets)
      ? release.assets.map((asset) => ({
          name: asset.name,
          size: asset.size,
          downloadUrl: asset.browser_download_url,
        }))
      : [],
  }
}

function parseAtomEntry(entryXml) {
  const linkMatch = entryXml.match(/<link[^>]+href="([^"]+)"/)
  const titleMatch = entryXml.match(/<title[^>]*>([\s\S]*?)<\/title>/)
  const updatedMatch = entryXml.match(/<updated[^>]*>([\s\S]*?)<\/updated>/)
  const contentMatch = entryXml.match(/<content[^>]*>([\s\S]*?)<\/content>/)
  const releaseUrl = decodeXmlText(linkMatch?.[1] || "")
  const tagName = releaseUrl.split("/").pop() || ""

  if (!releaseUrl || !isStableVersionTag(tagName)) {
    return null
  }

  const body = stripHtml(contentMatch?.[1] || "")
  return {
    version: stripVersionPrefix(tagName),
    tagName,
    name: stripHtml(titleMatch?.[1] || `HoraSpace ${tagName}`),
    publishedAt: decodeXmlText(updatedMatch?.[1] || "") || null,
    releaseUrl,
    summary: buildReleaseSummary(body),
    body,
    assets: [],
  }
}

async function fetchLatestReleaseInfo() {
  try {
    const atomText = await fetchText(UPDATE_RELEASES_ATOM_URL, {
      Accept: "application/atom+xml,text/xml",
    })
    const entries = atomText.match(/<entry>[\s\S]*?<\/entry>/g) || []
    const releaseInfo = entries.map(parseAtomEntry).find(Boolean)
    if (releaseInfo) return releaseInfo
    throw new Error("GitHub Releases Atom 中没有找到稳定版 tag")
  } catch (atomError) {
    console.warn("[hora] GitHub Releases Atom 检查失败，回退 REST API:", atomError)
    const release = await fetchJson(UPDATE_LATEST_API_URL)
    return toReleaseInfo(release)
  }
}

async function checkForUpdates(reason = "manual") {
  const currentVersion = getCurrentVersion()
  updateStatus({
    state: "checking",
    currentVersion,
    error: null,
  })

  try {
    const releaseInfo = await fetchLatestReleaseInfo()
    const hasUpdate = compareVersions(releaseInfo.version, currentVersion) > 0
    const checkedAt = new Date().toISOString()
    const settings = setUpdateSettings({ lastCheckedAt: checkedAt })

    return updateStatus({
      state: hasUpdate ? "available" : "not-available",
      currentVersion,
      update: hasUpdate ? releaseInfo : null,
      error: null,
      checkedAt,
      settings,
      reason,
    })
  } catch (error) {
    return updateStatus({
      state: "error",
      currentVersion,
      update: null,
      error: error instanceof Error ? error.message : String(error),
      checkedAt: new Date().toISOString(),
      reason,
    })
  }
}

function shouldRunStartupCheck(settings) {
  if (!settings.enabled) return false
  if (settings.schedule === "startup") return true

  const now = new Date()
  if (now.getHours() < settings.dailyHour) return false

  if (!settings.lastCheckedAt) return true
  const lastChecked = new Date(settings.lastCheckedAt)
  return lastChecked.toDateString() !== now.toDateString()
}

function scheduleConfiguredUpdateCheck() {
  const settings = getUpdateSettings()
  if (!shouldRunStartupCheck(settings)) return

  setTimeout(() => {
    void checkForUpdates("scheduled")
  }, 10000)
}

function getUpdateSnapshot() {
  return {
    settings: getUpdateSettings(),
    status: {
      ...latestStatus,
      currentVersion: getCurrentVersion(),
    },
  }
}

async function openReleasePage(releaseUrl) {
  const targetUrl = typeof releaseUrl === "string" && releaseUrl.startsWith("https://")
    ? releaseUrl
    : UPDATE_RELEASES_URL
  await shell.openExternal(targetUrl)
  return true
}

module.exports = {
  getUpdateSettings,
  setUpdateSettings,
  checkForUpdates,
  openReleasePage,
  scheduleConfiguredUpdateCheck,
  getUpdateSnapshot,
  setUpdateStatusBroadcaster,
}
