# HoraSpace

HoraSpace 是一个面向项目、需求、任务和笔记协作的桌面应用，基于 **Next.js + Electron + SQLite**，支持 macOS 和 Windows。

## 快速开始

安装依赖：

```bash
npm install
```

启动桌面开发环境：

```bash
npm run electron:dev
```

如需手动重新准备 Electron 原生依赖：

```bash
npm run setup
```

## 常用命令

```bash
npm run dev                 # 仅启动 Next.js
npm run build               # 构建 Next.js
npm run electron:dev        # Electron 开发模式
npm run electron:prod       # 本地生产模式运行

npm run dist                # 当前系统本机打包
npm run dist:mac            # macOS 打包
npm run dist:win:x64        # Windows x64 打包
npm run dist:win:arm64      # Windows ARM64 打包

npm run dist:github:mac     # GitHub Actions 打 macOS 包
npm run dist:github:win     # GitHub Actions 打 Windows 包

npm run release:patch       # 补丁版本
npm run release:minor       # 小版本
npm run release:major       # 大版本
```

## 打包

项目包含 `better-sqlite3` 等原生依赖，建议在目标系统上构建：

| 当前系统    | 本机打包    | 跨平台打包                     |
| ------- | ------- | ------------------------- |
| macOS   | macOS   | Windows 使用 GitHub Actions |
| Windows | Windows | macOS 使用 GitHub Actions   |
| Linux   | 不推荐     | 使用 GitHub Actions         |

发行文件统一输出到：

```text
dist-electron/releases/
```

安装包命名示例：

```text
HoraSpace-0.0.2-arm64.dmg
HoraSpace-0.0.2-x64.exe
HoraSpace-0.0.2-arm64.exe
```

## GitHub Actions

无法在本机打目标平台时：

```bash
gh auth login

npm run dist:github:mac
npm run dist:github:win
```

也可以进入 GitHub 仓库：

```text
Actions → Build macOS / Build Windows → Run workflow
```

Windows CI 会生成：

```text
hora-windows-x64
hora-windows-arm64
```

macOS CI 会生成：

```text
hora-macos
```

对应工作流：

```text
.github/workflows/build-mac.yml
.github/workflows/build-windows.yml
```

## 正式发布

HoraSpace 使用 GitHub Releases 作为更新源：

```text
https://github.com/hora35711/HoraSpace/releases
```

正式版本使用：

```text
vX.Y.Z
```

例如发布补丁版本：

```bash
npm run release:patch
git push origin main vX.Y.Z
```

推送 tag 后，GitHub Actions 会构建：

* Windows x64
* Windows ARM64
* macOS dmg

并上传到同一个 GitHub Release。

当前应用内更新仅支持：

```text
检查新版 → 显示版本简介 → 跳转 GitHub 下载
```

暂不支持自动下载和自动安装。

## Windows 注意事项

macOS 上不要直接执行：

```bash
npm run dist:win:x64
npm run dist:win:arm64
```

请使用：

```bash
npm run dist:github:win
```

GitHub Actions 下载的 artifact 需要先解压，再运行其中的：

```text
HoraSpace-版本-架构.exe
```

`.exe` 是安装程序，不需要继续解压。

默认安装目录通常为：

```text
C:\Users\用户名\AppData\Local\Programs\HoraSpace
```

正常安装后应包含：

```text
HoraSpace.exe
Uninstall HoraSpace.exe
resources/
locales/
```

如果双击应用没有反应，可查看日志：

```powershell
& "$env:LOCALAPPDATA\Programs\HoraSpace\HoraSpace.exe"

notepad "$env:APPDATA\HoraSpace\logs\hora-main.log"
```

如果 Windows 本地打包出现 `better-sqlite3` ABI 或依赖问题：

```bash
npm run setup
```

严重情况下可删除 Electron 依赖后重新安装：

```powershell
Remove-Item -Recurse -Force .\electron\node_modules
npm install --foreground-scripts --loglevel info
npm run setup
```

建议使用 **Node.js 20 LTS**。

## macOS 注意事项

Windows 上不要直接执行：

```bash
npm run dist:mac
```

请使用：

```bash
npm run dist:github:mac
```

Apple Silicon / ARM 环境优先使用 `arm64` 安装包。

## 项目目录

```text
app/            Next.js 页面和前端
electron/       Electron 主进程、数据库和本地逻辑
icon/           品牌图标
scripts/        构建与发布脚本
dist-electron/  打包产物
```

## 开发提醒

修改 Electron 主进程代码后，建议重新运行：

```bash
npm run electron:dev
```

修改打包配置后，应重新执行对应平台打包命令验证。

如果安装包出现白屏，优先检查：

```text
Electron 主进程日志
Next standalone 构建产物
原生模块架构
端口占用
```

## License

HoraSpace 使用 **MIT License**。

项目依赖 React、Next.js、Electron、Tiptap、Radix UI、Excalidraw 等开源项目。正式发布时应保留相应许可证和版权声明。

部分传递依赖可能涉及 MPL、LGPL、CC-BY 等许可证。正式商用发布前，建议生成完整的第三方开源许可证和 NOTICE 清单。
