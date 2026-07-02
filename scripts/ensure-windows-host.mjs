// Windows 打包保护：避免在 mac 上生成会带错平台原生模块的 Windows 安装包。
if (process.platform !== "win32") {
  console.error(
    [
      "[hora] Windows 安装包必须在 Windows 主机或 Windows CI 上构建；当前主机不是 Windows，所以这次打包已主动中止。",
      "[hora] 如果你在 macOS/Linux 上需要 Windows 安装包，请运行：npm run dist:github:win",
      "[hora] 也可以到 GitHub Actions 手动运行 Build Windows。",
    ].join("\n"),
  )
  process.exit(1)
}
