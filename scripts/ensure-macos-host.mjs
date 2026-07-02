// macOS 打包保护：dmg/.app 需要在 macOS 主机或 macOS CI 上构建。
if (process.platform !== "darwin") {
  console.error(
    [
      "[hora] macOS 安装包必须在 macOS 主机或 macOS CI 上构建；当前主机不是 macOS，所以这次打包已主动中止。",
      "[hora] 如果你在 Windows/Linux 上需要 macOS 安装包，请运行：npm run dist:github:mac",
      "[hora] 也可以到 GitHub Actions 手动运行 Build macOS。",
    ].join("\n"),
  )
  process.exit(1)
}
