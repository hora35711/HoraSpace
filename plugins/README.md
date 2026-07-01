# 插件规范

这个目录用于承载插件规范说明；真正运行时的插件包会放到用户数据目录下的 `plugins/`。

## 运行时位置

- macOS: `~/Library/hora-notes/hora-data/plugins/`
- 其他平台: `AppData/Local/.../hora-data/plugins/` 或对应的 `userData/plugins/`
- 应用打包后只读取运行时目录，不再依赖仓库根目录

## 目录约定

```text
plugins/
  <plugin-name>/
    .codex-plugin/
      plugin.json
    src/
    assets/
    data/
```

- `plugin-name` 使用小写连字符命名，例如 `internal-reporting`
- `.codex-plugin/plugin.json` 是插件入口清单
- `src/` 放插件自己的 UI、逻辑和内部状态
- `assets/` 放图片、图标、静态资源
- `data/` 放插件自己的可写数据

## 插件能力边界

- 插件可以读取和写入业务数据，例如项目、需求、任务、笔记关联
- 插件不能直接读写系统配置和用户隐私配置
- 插件可以定义自己的二级分组，但主应用只保留 `Tasks` 下的一级插件模块入口
- 插件的右侧区域可以选择三种展示模式：
  - `editor`：以编辑器为主
  - `display`：纯展示模式
  - `panel`：功能面板模式

## 推荐清单字段

```json
{
  "name": "internal-reporting",
  "displayName": "内部报表",
  "version": "1.0.0",
  "description": "展示关键指标与趋势",
  "sourcePath": "./plugins/internal-reporting",
  "entry": ".codex-plugin/plugin.json",
  "uiMode": "panel",
  "orderIndex": 10,
  "permissions": {
    "read": ["projects", "requirements", "tasks", "notes"],
    "write": ["projects", "requirements", "tasks"]
  },
  "modules": [
    {
      "id": "overview",
      "title": "概览",
      "orderIndex": 0
    },
    {
      "id": "trend",
      "title": "趋势",
      "orderIndex": 1
    }
  ]
}
```

## 插件管理规则

- 插件会在设置页中集中管理
- 排序以 `orderIndex` 为准
- 是否启用由主应用控制
- 插件的 `modules` 只负责插件内部层级，不影响主应用的二级页面结构
- 插件可以使用主应用的编辑器、数据模型和视图组件，但不能越权访问系统敏感配置
- 用户通过设置页“导入插件包”后，系统会自动复制到运行时目录并提示重启

## 落地原则

- 如果未来新增插件，只需要在这个目录下新增一个插件包
- 主应用只读取清单和元数据，不要求每次都改主题或全局布局
- 当插件包不存在或清单不合法时，设置页会把它当作未安装/未启用处理
