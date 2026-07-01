# Hora Space
Hora Space 是一个面向项目、需求、任务和笔记协作的桌面应用，支持 Next.js 前端、Electron 桌面壳、SQLite 本地数据和品牌化安装包。

## 快速开始

先安装依赖：

```bash
npm install
cd electron && npm install
cd ..
```

然后启动开发环境：

```bash
npm run electron:dev
```

这条命令会同时启动：

- Next.js 开发服务器
- Electron 桌面窗口

## 常用脚本

- `npm run dev`：仅启动 Next.js 开发服务
- `npm run build`：构建生产版 Next.js 产物
- `npm run start`：启动 Next.js 生产服务
- `npm run electron:dev`：开发模式下启动桌面应用
- `npm run electron:prod`：先构建，再用本地生产方式启动 Electron
- `npm run dist:mac`：打包 mac 安装包
- `npm run dist:win:x64`：打包 Windows x64 安装包
- `npm run dist:win:arm64`：打包 Windows arm64 安装包

## 打包说明

桌面端打包会先执行 Next 构建，再准备 Electron 运行所需的 standalone 目录，最后交给 `electron-builder` 输出安装包。

### 输出目录

所有发行物统一输出到：

```text
dist-electron/releases/
```

### 文件命名

安装包文件名统一使用驼峰风格，并携带版本和架构，例如：

- `HoraSpace-0.0.1-arm64.dmg`
- `HoraSpace-0.0.1-x64.exe`

### 图标资源

品牌图标会同步复制到：

```text
dist-electron/releases/icon/
```

同时，应用窗口、安装包、启动台、快捷方式和站点图标都会尽量统一到同一套品牌图标。

## 平台注意事项

- macOS：ARM 虚拟机可直接使用 `arm64` 安装包
- Windows：请在 Windows 机器或 Windows CI 上打包，避免原生模块架构不匹配
- 当前仓库已经提供 Windows x64 和 arm64 的 GitHub Actions 构建流程

## Windows CI

Windows 构建工作流位于：

```text
.github/workflows/build-windows.yml
```

触发方式：

- 手动在 GitHub Actions 里运行 `Build Windows`
- 或者在 `main` 分支 push 后自动执行

CI 会同时产出：

- `hora-windows-x64`
- `hora-windows-arm64`

## 在 Mac 上打 Windows 包

Mac 上不要直接执行 Windows 打包命令。项目里有平台保护脚本，`npm run dist:win:x64` 和 `npm run dist:win:arm64` 在 macOS 上会主动中止，避免把 macOS 的原生模块带进 Windows 安装包。

推荐流程：

1. 把当前代码推送到 GitHub 仓库
2. 打开 GitHub 仓库页面
3. 进入 `Actions`
4. 选择 `Build Windows`
5. 点击 `Run workflow`
6. 等待两个任务完成
7. 在 workflow 详情页下载构建产物

下载后的产物包含：

- `hora-windows-x64`：适合大多数 Intel / AMD Windows 电脑
- `hora-windows-arm64`：适合 Windows ARM 设备

安装包内部文件名会保持统一格式：

```text
HoraSpace-0.0.1-x64.exe
HoraSpace-0.0.1-arm64.exe
```

Windows 下载后，请先解压 GitHub Actions 下载的 artifact 压缩包，拿到里面的 `HoraSpace-版本-架构.exe` 安装器，然后在 Windows 上双击运行这个安装器。不要继续用 7-Zip、WinRAR 或系统解压工具去解压这个 `.exe`，它是安装程序，不是普通压缩包。

安装完成后，安装器会创建桌面快捷方式和开始菜单快捷方式，名称为 `Hora Space`，主程序文件名为 `HoraSpace.exe`，也可以在安装完成页面直接启动应用。

如果 Windows 提示“缺少快捷方式”或正在查找旧的 `Hora Space.exe`，通常是旧版本快捷方式残留、安装器被当作压缩包解开，或安全软件隔离了主程序。请先删除旧的桌面快捷方式，必要时卸载旧版本后重新运行最新安装器。

正常安装后的 Windows 程序目录根部应该包含：

```text
HoraSpace.exe
Uninstall HoraSpace.exe
resources/
locales/
```

## 在 Windows 上本地打包

如果你有 Windows 电脑或 Windows 虚拟机，可以在 Windows 里直接打包：

```bash
npm install
cd electron && npm install
cd ..
npm run dist:win:x64
npm run dist:win:arm64
```

打包完成后，安装包会输出到：

```text
dist-electron/releases/
```

## 目录约定

- `app/`：Next.js App Router 页面和前端界面
- `electron/`：Electron 主进程、预加载脚本、本地数据库和空间管理逻辑
- `icon/`：品牌图标源文件
- `scripts/`：打包前后处理脚本
- `dist-electron/`：打包产物输出目录

## 本地开发提醒

- 如果你在开发时修改了 Electron 相关逻辑，建议重新运行 `npm run electron:dev`
- 如果你在修改打包逻辑，建议重新执行 `npm run dist:mac` 或对应 Windows 构建脚本验证产物
- 如果安装包出现白屏，优先检查 Electron 主进程日志和 `standalone` 是否完整拷贝

## 许可证

本项目当前使用 MIT License，详见根目录 `LICENSE`。

## 开源许可证说明

本项目依赖了多个开源项目。根据当前 `package.json`、`electron/package.json` 和本地依赖扫描结果，直接依赖主要是宽松许可证：

- MIT：React、Next.js、Electron、Radix UI、Tiptap、Excalidraw、Tailwind 相关工具、date-fns、Recharts 等
- Apache-2.0：TypeScript、class-variance-authority 等
- ISC：lucide-react 等

这些许可证通常允许商用、修改、分发和闭源发布，但发布软件时应保留对应开源项目的版权声明和许可证文本。

需要额外注意的传递依赖：

- `@img/sharp-libvips-darwin-arm64`：LGPL-3.0-or-later
- `lightningcss` / `lightningcss-darwin-arm64`：MPL-2.0
- `axe-core`：MPL-2.0
- `dompurify`：MPL-2.0 OR Apache-2.0
- `caniuse-lite`：CC-BY-4.0

发布安装包时建议：

- 保留根目录 `LICENSE`
- 不要删除 Electron 打包产物里的 `LICENSE.electron.txt` 和 `LICENSES.chromium.html`
- 如正式对外分发，建议生成并随安装包附带第三方开源许可证清单
- 如果修改了 MPL 许可证覆盖的源码文件，需要按 MPL 要求公开对应修改文件
- 如果分发包含 LGPL 组件的二进制产物，需要保留许可证声明，并确保满足 LGPL 对替换、重新链接或获取相关组件源码的要求

以上内容是工程侧合规提示，不构成法律意见。正式商用发布前，建议再使用许可证扫描工具生成完整第三方 notice 文件。
