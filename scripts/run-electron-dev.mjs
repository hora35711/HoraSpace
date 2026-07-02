import { spawn, spawnSync } from "node:child_process"
import process from "node:process"
import path from "node:path"
import fs from "node:fs"
import http from "node:http"

// Electron 开发启动器：先准备 Electron 依赖，再统一管理两个子进程，避免 Windows / macOS shell 语法差异。
const rootDir = process.cwd()
const electronDir = path.join(rootDir, "electron")
const bootstrapScript = path.join(rootDir, "scripts", "bootstrap-electron.mjs")
const electronRendererUrl = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:3000"
const npmExecPath = process.env.npm_execpath
const rendererUrl = new URL(electronRendererUrl)
const rendererPort = rendererUrl.port || (rendererUrl.protocol === "https:" ? "443" : "80")
const nextDevLockPath = path.join(rootDir, ".next", "dev", "lock")
let nextProcess = null
let electronProcess = null

// 先把 electron/ 目录依赖准备好，避免用户只跑一次 electron:dev 时缺少 electron 二进制。
const bootstrapResult = spawnSync(process.execPath, [bootstrapScript], {
  cwd: rootDir,
  stdio: "inherit",
  shell: false,
})

if (bootstrapResult.error) {
  console.error("[hora] 无法准备 Electron 依赖：", bootstrapResult.error)
  process.exit(1)
}

if (bootstrapResult.status !== 0) {
  process.exit(bootstrapResult.status ?? 1)
}

if (!npmExecPath) {
  console.error("[hora] 未找到 npm_execpath，无法启动 Next 开发服务器。")
  process.exit(1)
}

const electronCliPath = path.join(electronDir, "node_modules", "electron", "cli.js")

if (!fs.existsSync(electronCliPath)) {
  console.error(`[hora] 未找到 Electron CLI：${electronCliPath}`)
  console.error("[hora] 请先运行 npm run setup，然后再执行 npm run electron:dev")
  process.exit(1)
}

function startProcess(command, args, cwd, extraEnv = {}) {
  // 通过 Node 启动 Electron CLI，避免 Windows 直接 spawn electron.cmd 时出现 EINVAL。
  return spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
    shell: false,
  })
}

function isRendererAvailable(url) {
  // 如果用户已经在 IDEA 或终端里启动了 Next dev，Electron 直接复用，避免 .next/dev/lock 冲突。
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume()
      resolve(true)
    })

    request.setTimeout(1000, () => {
      request.destroy()
      resolve(false)
    })

    request.on("error", () => {
      resolve(false)
    })
  })
}

function waitForRenderer(url, timeoutMs = 60000) {
  // Electron 必须等 Next 真正 ready 后再 loadURL，否则首屏会停在空白页且不会自动重试。
  const startedAt = Date.now()

  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) {
          resolve(true)
          return
        }

        retry()
      })

      const retry = () => {
        if (Date.now() - startedAt > timeoutMs) {
          reject(new Error(`等待 Next 开发服务超时：${url}`))
          return
        }
        setTimeout(probe, 500)
      }

      request.setTimeout(1000, () => {
        request.destroy()
        retry()
      })

      request.on("error", retry)
    }

    probe()
  })
}

function removeStaleNextDevLock() {
  // 没有可用渲染服务时，旧 lock 多半来自异常退出；删除它可以让本次开发启动自愈。
  if (fs.existsSync(nextDevLockPath)) {
    console.warn(`[hora] 删除残留的 Next dev lock：${nextDevLockPath}`)
    fs.rmSync(nextDevLockPath, { force: true })
  }
}

const shouldReuseRenderer = await isRendererAvailable(electronRendererUrl)

if (shouldReuseRenderer) {
  console.log(`[hora] 复用已有 Next 开发服务：${electronRendererUrl}`)
} else {
  removeStaleNextDevLock()
}

if (!shouldReuseRenderer) {
  nextProcess = startProcess(
    process.execPath,
    [npmExecPath, "run", "dev", "--", "--hostname", "127.0.0.1", "--port", rendererPort],
    rootDir,
  )
}

try {
  await waitForRenderer(electronRendererUrl)
} catch (error) {
  console.error("[hora] Next 开发服务没有按时就绪：", error)
  shutdown(1)
  process.exit(1)
}

electronProcess = startProcess(process.execPath, [electronCliPath, "."], electronDir, {
  ELECTRON_RENDERER_URL: electronRendererUrl,
})

let exitCode = 0
let finishedCount = 0

function shutdown(code) {
  exitCode = exitCode || code || 0
  nextProcess?.kill()
  electronProcess?.kill()
}

for (const child of [nextProcess, electronProcess].filter(Boolean)) {
  child.on("error", (error) => {
    console.error("[hora] electron:dev 子进程启动失败：", error)
    shutdown(1)
  })

  child.on("exit", (code, signal) => {
    finishedCount += 1

    // 任意一边退出，另一边也一起收尾，避免残留开发进程。
    if (code !== 0 && code !== null) {
      exitCode = code
    } else if (signal) {
      exitCode = 1
    }

    if (finishedCount >= 2) {
      process.exit(exitCode)
    } else {
      shutdown(exitCode)
    }
  })
}
