import { spawn, spawnSync } from "node:child_process"
import process from "node:process"
import path from "node:path"
import fs from "node:fs"

// Electron 开发启动器：先准备 Electron 依赖，再统一管理两个子进程，避免 Windows / macOS shell 语法差异。
const rootDir = process.cwd()
const electronDir = path.join(rootDir, "electron")
const bootstrapScript = path.join(rootDir, "scripts", "bootstrap-electron.mjs")
const electronRendererUrl = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:3000"
const npmExecPath = process.env.npm_execpath

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

const electronBinaryName = process.platform === "win32" ? "electron.cmd" : "electron"
const electronBinaryPath = path.join(electronDir, "node_modules", ".bin", electronBinaryName)

if (!fs.existsSync(electronBinaryPath)) {
  console.error(`[hora] 未找到 Electron 可执行文件：${electronBinaryPath}`)
  console.error("[hora] 请先运行 npm run setup，然后再执行 npm run electron:dev")
  process.exit(1)
}

function startProcess(command, args, cwd, extraEnv = {}) {
  // 直接启动对应平台的二进制，绕开 npm 对 electron 命令解析的差异。
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

const nextProcess = startProcess(process.execPath, [npmExecPath, "run", "dev"], rootDir)
const electronProcess = startProcess(electronBinaryPath, ["."], electronDir, {
  ELECTRON_RENDERER_URL: electronRendererUrl,
})

let exitCode = 0
let finishedCount = 0

function shutdown(code) {
  exitCode = exitCode || code || 0
  nextProcess.kill()
  electronProcess.kill()
}

for (const child of [nextProcess, electronProcess]) {
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
