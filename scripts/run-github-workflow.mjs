import { spawnSync } from "node:child_process"

// 远程打包入口：本机不适合跨平台打包时，用 GitHub Actions 负责目标平台构建。
const workflow = process.argv[2]

if (!workflow) {
  console.error("[hora] 缺少 workflow 文件名，例如：npm run dist:github:win")
  process.exit(1)
}

// GitHub Actions 只能构建远端仓库代码；本地没提交或没 push 时先阻止，避免打出旧包。
const gitStatus = spawnSync("git", ["status", "--porcelain=v1", "--branch"], {
  encoding: "utf8",
})

if (!gitStatus.error) {
  const statusText = gitStatus.stdout.trim()
  const statusLines = statusText.split("\n").filter(Boolean)
  const branchLine = statusLines[0] ?? ""
  const hasLocalChanges = statusLines.slice(1).length > 0
  const hasUnpushedCommits = branchLine.includes("[ahead")

  if (hasLocalChanges || hasUnpushedCommits) {
    console.error(
      [
        "[hora] 当前本地代码还没有完全同步到 GitHub，远程打包会拿不到这些修改。",
        "[hora] 请先 commit 并 push 后再运行远程打包命令。",
        `[hora] 当前状态：${branchLine || "unknown"}`,
      ].join("\n"),
    )
    process.exit(1)
  }
}

// 用 GitHub CLI 触发 workflow；没有安装 gh 时给出手动操作路径。
const result = spawnSync("gh", ["workflow", "run", workflow, "--ref", "main"], {
  stdio: "inherit",
})

if (result.error?.code === "ENOENT") {
  console.error(
    [
      "[hora] 未检测到 GitHub CLI：gh。",
      "[hora] 你可以安装 gh 并登录后重试，也可以手动打开 GitHub 仓库：Actions -> 选择对应 workflow -> Run workflow。",
      `[hora] 目标 workflow：${workflow}`,
    ].join("\n"),
  )
  process.exit(1)
}

if (result.status !== 0) {
  console.error(
    [
      `[hora] 触发 ${workflow} 失败，请确认当前代码已 push 到 GitHub，且 gh 已登录正确账号。`,
      "[hora] 你也可以手动打开 GitHub 仓库：Actions -> 选择对应 workflow -> Run workflow。",
    ].join("\n"),
  )
  process.exit(result.status ?? 1)
}

console.log(`[hora] 已触发 ${workflow}，请到 GitHub Actions 页面查看构建进度并下载 artifact。`)
