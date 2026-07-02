import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import process from "node:process"

// Electron 依赖引导：根目录安装后，顺手把 electron/ 的原生依赖准备到可运行状态。
const rootDir = process.cwd()
const electronDir = path.join(rootDir, "electron")
const electronNodeModulesDir = path.join(electronDir, "node_modules")
const electronBinaryName = process.platform === "win32" ? "electron.cmd" : "electron"
const electronBinaryPath = path.join(electronNodeModulesDir, ".bin", electronBinaryName)
const requiredElectronFiles = [
  path.join(electronNodeModulesDir, "electron", "package.json"),
  path.join(electronNodeModulesDir, "better-sqlite3", "package.json"),
  path.join(electronNodeModulesDir, "prebuild-install", "bin.js"),
  electronBinaryPath,
]
// 优先使用 npm 自己暴露的执行入口，避免 Windows 下 PATH 不完整导致 spawnSync ENOENT。
const npmExecPath = process.env.npm_execpath

if (!npmExecPath) {
  console.error("[hora] 未找到 npm_execpath，无法安全启动 electron 依赖准备流程。")
  process.exit(1)
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`)
  }
}

function hasCompleteElectronInstall() {
  return requiredElectronFiles.every((filePath) => fs.existsSync(filePath))
}

function warnAboutWindowsNodeVersion() {
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10)

  if (process.platform === "win32" && nodeMajor >= 24) {
    console.warn(
      [
        `[hora] 当前 Windows Node 版本是 ${process.versions.node}。`,
        "[hora] 如果安装 Electron 依赖仍失败，建议切换到 Node.js 20 LTS 后重新执行 npm install。",
      ].join("\n"),
    )
  }
}

try {
  warnAboutWindowsNodeVersion()

  if (!hasCompleteElectronInstall()) {
    // node_modules 可能存在但不完整，比如缺 electron.cmd 或 prebuild-install，这时必须完整安装。
    run(process.execPath, [npmExecPath, "install"], electronDir)
  }

  // 依赖完整后再重编译关键原生模块，避免 Node / Electron ABI 不一致。
  run(
    process.execPath,
    [
      npmExecPath,
      "rebuild",
      "better-sqlite3",
      "--runtime=electron",
      "--target=37.0.0",
      "--dist-url=https://electronjs.org/headers",
    ],
    electronDir,
  )

  console.log("[hora] electron 依赖已准备完成")
} catch (error) {
  console.error("[hora] electron 依赖准备失败：")
  console.error(error instanceof Error ? error.message : error)
  console.error("[hora] Windows 上如果反复失败，请先安装 Node.js 20 LTS，然后删除 electron/node_modules 后重新执行 npm install。")
  process.exit(1)
}
