# Electron 本地数据库接入说明

## 目标

- 启动应用自动创建本地 SQLite。
- 仅首次初始化执行 SQL（建表 + 默认数据）。
- 笔记内容以 Markdown 文件为真相源，SQLite 仅存 metadata。

## 默认数据库位置

- 账号级配置：`~/Library/hora-notes/hora-config`
- 空间注册表：`~/Library/hora-notes/hora-config/spaces.json`
- 当前空间数据：由空间目录决定，空间内默认包含 `hora.db`、`vault/`、`plugins/`
- 笔记文件：与当前空间的 `hora.db` 同目录，并落在空间 `vault` 资源树中

## 关键文件

- `electron/main.cjs`：主进程与 IPC 注册。
- `electron/preload.cjs`：渲染进程桥接 API。
- `electron/db.cjs`：SQLite 初始化、迁移、文件落盘与 CRUD。
- `electron/resources/sql/init_local_full.sql`：表结构和默认数据。

## 初始化与迁移行为

1. 如果 `hora.db` 不存在：
- 执行 `init_local_full.sql`
- 根据 `note_nodes` 的文件节点自动创建对应 `.md` 文件

2. 如果当前还没有空间：
- 首次启动会先生成默认空间注册信息
- 用户需要在界面里创建或切换空间后才能继续使用

3. 如果 `hora.db` 已存在：
- 不重复执行 init SQL
- 自动补齐 note_nodes 新字段（`file_path/file_hash/file_size/sync_status` 等）
- 若检测到旧 `content` 列，会把内容迁移落盘到 `.md` 并回填 metadata

## 开发启动

1. 在项目根目录安装前端依赖：`npm install`
2. 在 `electron` 目录安装 Electron 依赖：`cd electron && npm install`
3. 如果你已经装过依赖但启动时报 `better-sqlite3` ABI 不匹配，运行：`cd electron && npm rebuild better-sqlite3 --runtime=electron --target=37.0.0 --dist-url=https://electronjs.org/headers`
4. 启动 Next：`npm run dev`
5. 新开终端启动 Electron：`npm run electron:dev`
