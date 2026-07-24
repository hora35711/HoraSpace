import * as React from "react"

// 只提供三种界面语言：简体中文、英文和日文。
export type AppLanguage = "zh-CN" | "en-US" | "ja-JP"

export const APP_LANGUAGE_STORAGE_KEY = "hora_app_language"
export const APP_LANGUAGE_CHANGE_EVENT = "hora:language-changed"

type TranslationCatalog = Record<string, string>

// 公共 UI 文案字典：只放界面壳层、设置页和公共按钮，不放任何业务标题/数据标题。
const TRANSLATIONS: Record<AppLanguage, TranslationCatalog> = {
  "zh-CN": {
    appName: "HoraSpace",
    navigation: "导航",
    workspace: "工作区",
    mail: "邮件",
    notes: "笔记",
    dashboard: "看板",
    projects: "项目",
    tasks: "任务",
    inbox: "收件箱",
    sent: "已发送",
    drafts: "草稿箱",
    trash: "废纸篓",
    archive: "归档",
    junk: "垃圾邮件",
    addMailAccount: "添加邮箱",
    account: "账号",
    billing: "账单",
    notifications: "通知",
    settings: "设置",
    signOut: "退出登录",
    createSpace: "创建空间",
    createFolder: "新建文件夹",
    createAndEnter: "创建并进入",
    choose: "选择",
    chooseSpace: "当前空间",
    chooseSpaceToStart: "选择一个空间目录开始使用",
    spaceList: "空间列表",
    localUser: "本地用户",
    cancel: "取消",
    save: "保存",
    confirm: "确认",
    editSettings: "编辑设置",
    loading: "加载中",
    language: "语言",
    general: "常规",
    location: "位置",
    repository: "仓库",
    plugins: "插件",
    extensions: "扩展",
    interfaceLanguage: "界面语言",
    dateFormat: "日期格式",
    timezone: "时区",
    numberFormat: "数字格式",
    chooseLanguage: "选择语言",
    selectFormat: "选择格式",
    selectStrategy: "选择策略",
    selectMode: "选择展示模式",
    selectLanguage: "选择语言",
    englishUS: "English (US)",
    japanese: "日本語",
    simplifiedChinese: "简体中文",
    createSpaceTitle: "创建空间",
    createSpaceDescription: "选择空间目录并填写空间名称，创建后会把数据、数据库和插件都放到这个空间下。",
    createSpaceSubmit: "创建并进入",
    selectSpaceDirectory: "选择空间目录",
    selectSpaceDirectoryDescription: "把一个目录作为空间根目录，后续数据、数据库和插件都会存放在这里。",
    spaceName: "空间名称",
    spacePath: "空间路径",
    folderName: "文件夹名称",
    folderPath: "文件夹路径",
    chooseFolder: "选择",
    projectList: "项目列表",
    taskList: "任务列表",
    empty: "暂无内容",
    search: "搜索",
    clear: "清除",
    refresh: "刷新",
    import: "导入",
    yes: "确定",
    no: "取消",
  },
  "en-US": {
    appName: "HoraSpace",
    navigation: "Navigation",
    workspace: "Workspace",
    mail: "Mail",
    notes: "Notes",
    dashboard: "Dashboard",
    projects: "Projects",
    tasks: "Tasks",
    inbox: "Inbox",
    sent: "Sent",
    drafts: "Drafts",
    trash: "Trash",
    archive: "Archive",
    junk: "Junk",
    addMailAccount: "Add mail account",
    account: "Account",
    billing: "Billing",
    notifications: "Notifications",
    settings: "Settings",
    signOut: "Sign Out",
    createSpace: "Create Space",
    createFolder: "New folder",
    createAndEnter: "Create and enter",
    choose: "Choose",
    chooseSpace: "Choose Space",
    chooseSpaceToStart: "Choose a space folder to get started",
    spaceList: "Space list",
    localUser: "Local User",
    cancel: "Cancel",
    save: "Save",
    confirm: "Confirm",
    editSettings: "Edit settings",
    loading: "Loading",
    language: "Language",
    general: "General",
    location: "Location",
    repository: "Repository",
    plugins: "Plugins",
    extensions: "Extensions",
    interfaceLanguage: "Interface language",
    dateFormat: "Date format",
    timezone: "Time zone",
    numberFormat: "Number format",
    chooseLanguage: "Choose a language",
    selectFormat: "Choose a format",
    selectStrategy: "Choose strategy",
    selectMode: "Choose display mode",
    selectLanguage: "Choose language",
    englishUS: "English (US)",
    japanese: "Japanese",
    simplifiedChinese: "Simplified Chinese",
    createSpaceTitle: "Create space",
    createSpaceDescription: "Choose a folder and name for the new space. Data, database, and plugins will live inside it.",
    createSpaceSubmit: "Create and enter",
    selectSpaceDirectory: "Choose space folder",
    selectSpaceDirectoryDescription: "Use a folder as the space root. Data, database, and plugins will be stored there.",
    spaceName: "Space name",
    spacePath: "Space path",
    folderName: "Folder name",
    folderPath: "Folder path",
    chooseFolder: "Choose",
    projectList: "Project list",
    taskList: "Task list",
    empty: "Nothing here yet",
    search: "Search",
    clear: "Clear",
    refresh: "Refresh",
    import: "Import",
    yes: "OK",
    no: "Cancel",
  },
  "ja-JP": {
    appName: "HoraSpace",
    navigation: "ナビゲーション",
    workspace: "ワークスペース",
    mail: "メール",
    notes: "ノート",
    dashboard: "ダッシュボード",
    projects: "プロジェクト",
    tasks: "タスク",
    inbox: "受信箱",
    sent: "送信済み",
    drafts: "下書き",
    trash: "ゴミ箱",
    archive: "アーカイブ",
    junk: "迷惑メール",
    addMailAccount: "メールを追加",
    account: "アカウント",
    billing: "請求",
    notifications: "通知",
    settings: "設定",
    signOut: "サインアウト",
    createSpace: "スペースを作成",
    createFolder: "新しいフォルダ",
    createAndEnter: "作成して入る",
    choose: "選択",
    chooseSpace: "スペースを選択",
    chooseSpaceToStart: "開始するスペースフォルダを選択してください",
    spaceList: "スペース一覧",
    localUser: "ローカルユーザー",
    cancel: "キャンセル",
    save: "保存",
    confirm: "確認",
    editSettings: "設定を編集",
    loading: "読み込み中",
    language: "言語",
    general: "一般",
    location: "場所",
    repository: "リポジトリ",
    plugins: "プラグイン",
    extensions: "拡張",
    interfaceLanguage: "表示言語",
    dateFormat: "日付形式",
    timezone: "タイムゾーン",
    numberFormat: "数値形式",
    chooseLanguage: "言語を選択",
    selectFormat: "形式を選択",
    selectStrategy: "方式を選択",
    selectMode: "表示モードを選択",
    selectLanguage: "言語を選択",
    englishUS: "English (US)",
    japanese: "日本語",
    simplifiedChinese: "简体中文",
    createSpaceTitle: "スペースを作成",
    createSpaceDescription: "フォルダを選び、スペース名を入力してください。データ、DB、プラグインはこの中に保存されます。",
    createSpaceSubmit: "作成して入る",
    selectSpaceDirectory: "スペースフォルダを選択",
    selectSpaceDirectoryDescription: "フォルダをスペースのルートとして使います。以後のデータ、DB、プラグインはここに保存されます。",
    spaceName: "スペース名",
    spacePath: "スペースパス",
    folderName: "フォルダ名",
    folderPath: "フォルダパス",
    chooseFolder: "選択",
    projectList: "プロジェクト一覧",
    taskList: "タスク一覧",
    empty: "まだ何もありません",
    search: "検索",
    clear: "クリア",
    refresh: "更新",
    import: "インポート",
    yes: "OK",
    no: "キャンセル",
  },
}

// 语言标签：设置页和切换器共用。
export const APP_LANGUAGE_LABEL: Record<AppLanguage, string> = {
  "zh-CN": TRANSLATIONS["zh-CN"].simplifiedChinese,
  "en-US": TRANSLATIONS["en-US"].englishUS,
  "ja-JP": TRANSLATIONS["ja-JP"].japanese,
}

const AppLanguageContext = React.createContext<{
  language: AppLanguage
  setLanguage: (language: AppLanguage) => void
} | null>(null)

// 读取本地缓存语言，默认简体中文。
function getInitialLanguage(): AppLanguage {
  if (typeof window === "undefined") return "zh-CN"

  const saved = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)
  if (saved === "zh-CN" || saved === "en-US" || saved === "ja-JP") {
    return saved
  }

  return "zh-CN"
}

// 语言 provider 使用的轻量同步：切换后立刻写缓存并刷新 document lang。
export function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = React.useState<AppLanguage>(getInitialLanguage)

  React.useEffect(() => {
    window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language)
    document.documentElement.lang = language
    window.dispatchEvent(new CustomEvent(APP_LANGUAGE_CHANGE_EVENT, { detail: { language } }))
  }, [language])

  const setLanguage = React.useCallback((nextLanguage: AppLanguage) => {
    setLanguageState(nextLanguage)
  }, [])

  return <AppLanguageContext.Provider value={{ language, setLanguage }}>{children}</AppLanguageContext.Provider>
}

// 当前语言上下文：页面和公共组件用这个拿语言状态。
export function useAppLanguage() {
  const context = React.useContext(AppLanguageContext)
  if (!context) {
    throw new Error("useAppLanguage must be used within AppLanguageProvider")
  }
  return context
}

// 简单翻译函数：找不到键时回退英文，再回退 key 本身，避免文案丢失。
export function useT() {
  const { language } = useAppLanguage()

  return React.useCallback(
    (key: string) => {
      return TRANSLATIONS[language][key] || TRANSLATIONS["en-US"][key] || key
    },
    [language],
  )
}

export function getLanguageOptions() {
  return (Object.keys(APP_LANGUAGE_LABEL) as AppLanguage[]).map((language) => ({
    value: language,
    label: APP_LANGUAGE_LABEL[language],
  }))
}
