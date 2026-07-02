import { spawnSync } from "node:child_process"

// 本机打包入口：根据当前系统选择最安全的原生安装包构建命令。
const scriptByPlatform = {
  darwin: "dist:mac",
  win32: "dist:win",
}

const script = scriptByPlatform[process.platform]

if (!script) {
  console.error(
    [
      `[hora] 当前平台 ${process.platform} 暂未配置本机打包。`,
      "[hora] 请使用 GitHub Actions 构建目标平台安装包：",
      "[hora] - Windows：npm run dist:github:win",
      "[hora] - macOS：npm run dist:github:mac",
    ].join("\n"),
  )
  process.exit(1)
}

// 复用 npm 脚本，保证本机打包流程和显式 dist:mac/dist:win 完全一致。
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm"
const result = spawnSync(npmCommand, ["run", script], { stdio: "inherit" })

process.exit(result.status ?? 1)
