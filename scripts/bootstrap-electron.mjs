import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import process from "node:process"

// Electron 依赖引导：根目录安装后，顺手把 electron/ 的原生依赖准备到可运行状态。
const rootDir = process.cwd()
const electronDir = path.join(rootDir, "electron")
const electronNodeModulesDir = path.join(electronDir, "node_modules")
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

try {
  if (!fs.existsSync(electronNodeModulesDir)) {
    // 第一次拉代码时，electron/ 目录可能还没有依赖，先完整安装一次。
    run(process.execPath, [npmExecPath, "install"], electronDir)
  } else {
    // 已经安装过时，只重编译关键原生模块，避免 Node / Electron ABI 不一致。
    run(
      process.execPath,
      [npmExecPath, "rebuild", "better-sqlite3", "--runtime=electron", "--target=37.0.0", "--dist-url=https://electronjs.org/headers"],
      electronDir,
    )
  }

  console.log("[hora] electron 依赖已准备完成")
} catch (error) {
  console.error("[hora] electron 依赖准备失败：")
  console.error(error instanceof Error ? error.message : error)
  console.error("[hora] 你也可以手动进入 electron/ 目录执行 npm install 或 npm rebuild better-sqlite3")
  process.exit(1)
}
