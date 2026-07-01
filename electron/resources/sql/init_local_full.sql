-- =============================================
-- Hora 本地完整初始化脚本（SQLite）
-- 包含：用户、工作区、笔记、项目、需求、任务、笔记关联、仪表板视图。
-- 设计目标：Markdown 文件是真相源；SQLite 只存 metadata。
-- =============================================

PRAGMA foreign_keys = ON;

BEGIN TRANSACTION;

-- =============================================
-- 1) 用户
-- =============================================
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT,
  email TEXT,
  is_local_only INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username);

-- =============================================
-- 2) 工作区
-- =============================================
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (owner_user_id) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_workspaces_owner_name
ON workspaces(owner_user_id, name);

-- =============================================
-- 3) 笔记（目录/文件同表，文件内容不入库）
-- =============================================
CREATE TABLE IF NOT EXISTS note_nodes (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  parent_id TEXT,
  node_type TEXT NOT NULL CHECK (node_type IN ('folder', 'file')),
  title TEXT NOT NULL,
  file_path TEXT,                               -- 真实 Markdown 文件路径（绝对路径）。
  file_size INTEGER NOT NULL DEFAULT 0,
  file_hash TEXT,
  sync_status TEXT NOT NULL DEFAULT 'local',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  content_updated_at TEXT,                      -- 文件内容更新时间。
  meta_updated_at TEXT,                         -- 标题/树结构等元信息更新时间。
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
  FOREIGN KEY (parent_id) REFERENCES note_nodes(id),
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_note_nodes_parent_title_alive
ON note_nodes(workspace_id, parent_id, title)
WHERE is_deleted = 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_note_nodes_file_path_alive
ON note_nodes(file_path)
WHERE is_deleted = 0 AND node_type = 'file' AND file_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_note_nodes_parent
ON note_nodes(workspace_id, parent_id, is_deleted, sort_order);

-- =============================================
-- 4) 项目
-- =============================================
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'done', 'archived')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  due_at TEXT,
  completed_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'local_owner',
  updated_by TEXT NOT NULL DEFAULT 'local_owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_title_alive
ON projects(workspace_id, title)
WHERE is_deleted = 0;

CREATE INDEX IF NOT EXISTS idx_projects_workspace
ON projects(workspace_id, is_deleted, sort_order);

CREATE INDEX IF NOT EXISTS idx_projects_status_priority
ON projects(status, priority, updated_at DESC);

-- =============================================
-- 5) 需求
-- =============================================
CREATE TABLE IF NOT EXISTS requirements (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done', 'archived')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  completed_at TEXT,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL DEFAULT 'local_owner',
  updated_by TEXT NOT NULL DEFAULT 'local_owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE INDEX IF NOT EXISTS idx_requirements_project
ON requirements(project_id, is_deleted, sort_order);

CREATE INDEX IF NOT EXISTS idx_requirements_status
ON requirements(status, priority, updated_at DESC);

-- =============================================
-- 6) 任务
-- =============================================
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  requirement_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'doing', 'done', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  color TEXT,
  is_completed INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  due_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL DEFAULT 'local_owner',
  updated_by TEXT NOT NULL DEFAULT 'local_owner',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (requirement_id) REFERENCES requirements(id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_project
ON tasks(project_id, is_deleted, sort_order);

CREATE INDEX IF NOT EXISTS idx_tasks_requirement
ON tasks(requirement_id, is_deleted, sort_order);

CREATE INDEX IF NOT EXISTS idx_tasks_status_priority
ON tasks(status, priority, due_at, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_tasks_due
ON tasks(due_at, status, is_deleted);

-- =============================================
-- 7) 插件与笔记关联
-- =============================================
CREATE TABLE IF NOT EXISTS plugins (
  id TEXT PRIMARY KEY,
  plugin_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  description TEXT,
  version TEXT NOT NULL DEFAULT '1.0.0',
  source_path TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'local',
  ui_mode TEXT NOT NULL DEFAULT 'panel' CHECK (ui_mode IN ('editor', 'display', 'panel')),
  enabled INTEGER NOT NULL DEFAULT 1,
  is_installed INTEGER NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  permissions_json TEXT NOT NULL DEFAULT '{}',
  settings_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_plugins_enabled_order
ON plugins(is_installed DESC, enabled DESC, order_index ASC, updated_at DESC);

CREATE TABLE IF NOT EXISTS note_project_links (
  note_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (note_id, project_id),
  FOREIGN KEY (note_id) REFERENCES note_nodes(id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS note_requirement_links (
  note_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (note_id, requirement_id),
  FOREIGN KEY (note_id) REFERENCES note_nodes(id),
  FOREIGN KEY (requirement_id) REFERENCES requirements(id)
);

CREATE TABLE IF NOT EXISTS note_task_links (
  note_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (note_id, task_id),
  FOREIGN KEY (note_id) REFERENCES note_nodes(id),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

-- =============================================
-- 8) 仪表板视图
-- =============================================
DROP VIEW IF EXISTS v_dashboard_summary;

CREATE VIEW v_dashboard_summary AS
SELECT
  p.workspace_id AS workspace_id,
  COUNT(DISTINCT p.id) AS project_total,
  SUM(CASE WHEN p.status = 'active' AND p.is_deleted = 0 THEN 1 ELSE 0 END) AS project_active,
  SUM(CASE WHEN p.status = 'archived' AND p.is_deleted = 0 THEN 1 ELSE 0 END) AS project_archived,
  SUM(CASE WHEN r.status = 'todo' AND r.is_deleted = 0 THEN 1 ELSE 0 END) AS requirement_todo,
  SUM(CASE WHEN r.status = 'done' AND r.is_deleted = 0 THEN 1 ELSE 0 END) AS requirement_done,
  SUM(CASE WHEN r.priority = 'urgent' AND r.is_deleted = 0 THEN 1 ELSE 0 END) AS requirement_urgent
FROM projects p
LEFT JOIN requirements r ON r.project_id = p.id
WHERE p.is_deleted = 0
GROUP BY p.workspace_id;

-- =============================================
-- 9) 默认基础数据（首次安装后即有）
-- =============================================
INSERT OR IGNORE INTO users (id, username, display_name, email, is_local_only)
VALUES ('local_owner', 'local_owner', '本地用户', NULL, 1);

INSERT OR IGNORE INTO workspaces (id, owner_user_id, name)
VALUES ('ws_local_default', 'local_owner', '我的工作区');

INSERT OR IGNORE INTO projects (
  id, workspace_id, title, description, status, sort_order, is_deleted, created_by, updated_by
) VALUES
('proj_001', 'ws_local_default', '官网改版', '主页和项目页视觉升级。', 'active', 0, 0, 'local_owner', 'local_owner'),
('proj_002', 'ws_local_default', '移动端适配', '完成关键页面在移动端响应式适配。', 'active', 1, 0, 'local_owner', 'local_owner');

INSERT OR IGNORE INTO requirements (
  id, project_id, title, description, status, priority, sort_order, due_at, completed_at, is_deleted, created_by, updated_by
) VALUES
('req_001', 'proj_001', '项目卡片模块', '项目列表卡片的展示与交互需求。', 'doing', 'high', 0, NULL, NULL, 0, 'local_owner', 'local_owner'),
('req_002', 'proj_001', '设计系统配色', '统一卡片、标签、按钮配色规范。', 'todo', 'normal', 1, NULL, NULL, 0, 'local_owner', 'local_owner'),
('req_003', 'proj_002', '移动端导航模块', '处理导航和卡片在窄屏下展示。', 'todo', 'normal', 0, NULL, NULL, 0, 'local_owner', 'local_owner');

INSERT OR IGNORE INTO tasks (
  id, project_id, requirement_id, title, description, status, priority, color, is_completed, sort_order, due_at, completed_at, created_by, updated_by
) VALUES
('task_001', 'proj_001', 'req_001', '完成项目卡片悬浮态', '落实悬浮态、点击态和弹窗流程。', 'todo', 'high', '#2563eb', 0, 0, NULL, NULL, 'local_owner', 'local_owner'),
('task_002', 'proj_001', 'req_002', '补齐颜色变量', '统一基础颜色变量并同步页面使用。', 'doing', 'normal', '#16a34a', 0, 1, NULL, NULL, 'local_owner', 'local_owner'),
('task_003', 'proj_002', 'req_003', '适配 iPhone 尺寸', '验证导航和卡片在窄屏下展示。', 'todo', 'normal', '#f59e0b', 0, 0, NULL, NULL, 'local_owner', 'local_owner');

INSERT OR IGNORE INTO note_nodes (
  id, workspace_id, parent_id, node_type, title, file_path, file_size, file_hash, sync_status, sort_order, is_deleted, created_by, updated_by, content_updated_at, meta_updated_at
) VALUES
('node_root_work', 'ws_local_default', NULL, 'folder', '工作', NULL, 0, NULL, 'local', 0, 0, 'local_owner', 'local_owner', NULL, datetime('now')),
('node_root_personal', 'ws_local_default', NULL, 'folder', '个人', NULL, 0, NULL, 'local', 1, 0, 'local_owner', 'local_owner', NULL, datetime('now')),
('node_root_welcome', 'ws_local_default', NULL, 'file', '欢迎.md', NULL, 0, NULL, 'local', 2, 0, 'local_owner', 'local_owner', datetime('now'), datetime('now')),
('node_work_plan', 'ws_local_default', 'node_root_work', 'folder', '方案', NULL, 0, NULL, 'local', 0, 0, 'local_owner', 'local_owner', NULL, datetime('now')),
('node_work_plan_q2', 'ws_local_default', 'node_work_plan', 'folder', '2026Q2', NULL, 0, NULL, 'local', 0, 0, 'local_owner', 'local_owner', NULL, datetime('now')),
('node_work_plan_q2_doc', 'ws_local_default', 'node_work_plan_q2', 'file', '计划.md', NULL, 0, NULL, 'local', 0, 0, 'local_owner', 'local_owner', datetime('now'), datetime('now')),
('node_work_todo', 'ws_local_default', 'node_root_work', 'file', 'TODO.md', NULL, 0, NULL, 'local', 1, 0, 'local_owner', 'local_owner', datetime('now'), datetime('now')),
('node_personal_diary', 'ws_local_default', 'node_root_personal', 'file', '日记.md', NULL, 0, NULL, 'local', 0, 0, 'local_owner', 'local_owner', datetime('now'), datetime('now'));

COMMIT;
