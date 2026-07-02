import { spawn } from "node:child_process"
import process from "node:process"
import path from "node:path"

// Electron 开发启动器：用 Node 统一管理两个子进程，避免 Windows / macOS shell 语法差异。
const rootDir = process.cwd()
const electronDir = path.join(rootDir, "electron")
const npmExecPath = process.env.npm_execpath

if (!npmExecPath) {
  console.error("[hora] 未找到 npm_execpath，无法启动 electron:dev。")
  process.exit(1)
}

const npmCommand = process.execPath
const electronRendererUrl = process.env.ELECTRON_RENDERER_URL ?? "http://localhost:3000"

function startNpmScript(cwd, scriptName, extraEnv = {}) {
  // 通过 npm CLI 本身启动脚本，保证各平台行为一致。
  return spawn(npmCommand, [npmExecPath, "run", scriptName], {
    cwd,
    env: {
      ...process.env,
      ...extraEnv,
    },
    stdio: "inherit",
    shell: false,
  })
}

const nextProcess = startNpmScript(rootDir, "dev")
const electronProcess = startNpmScript(electronDir, "start", {
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
