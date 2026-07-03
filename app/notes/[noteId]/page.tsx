"use client"

// Note 详情页：读取 Markdown，交给官方 SimpleEditor 编辑，并保存回文件系统。

import React, { useCallback, useEffect, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import MarkdownIt from "markdown-it"
import TurndownService from "turndown"
import { Plus, X } from "lucide-react"
import { serializeAsJSON } from "@excalidraw/excalidraw"
import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor"
import { Button } from "@/components/ui/button"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import "@excalidraw/excalidraw/index.css"
import type {
  AppState as ExcalidrawAppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"

// Excalidraw 仅在客户端渲染，避免 SSR 触发浏览器 API 报错。
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false },
)

type NoteRecord = {
  id: string
  title: string
  nodeType: "folder" | "file"
  filePath: string | null
  updatedAt: string
}

type NoteNodeRow = {
  id: string
  parentId: string | null
  nodeType: "folder" | "file"
  title: string
  sortOrder: number
  filePath: string | null
}

type EditorTab = {
  id: string
  label: string
  noteId: string | null
}

type NoteFileKind = "markdown" | "drawing" | "text" | "external"

// 兼容新旧绘图后缀：新格式 .excalidraw.md，老格式 .excalidraw。
function isDrawingPath(filePath: string | null | undefined) {
  const lower = (filePath || "").toLowerCase()
  return lower.endsWith(".excalidraw.md") || lower.endsWith(".excalidraw")
}

// 普通文本文件可直接在编辑区编辑，避免使用富文本编辑器改写原始格式。
function isPlainTextPath(filePath: string | null | undefined) {
  const lower = (filePath || "").toLowerCase()
  return [".txt", ".text", ".log", ".csv", ".tsv"].some((suffix) => lower.endsWith(suffix))
}

// 根据路径决定打开策略：Markdown/绘图内嵌，文本直接编辑，PDF/Office 交给系统默认应用。
function getNoteFileKind(filePath: string | null | undefined): NoteFileKind {
  const lower = (filePath || "").toLowerCase()
  if (isDrawingPath(lower)) return "drawing"
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "markdown"
  if (isPlainTextPath(lower)) return "text"
  return "external"
}

// 从绘图文件内容中提取 Excalidraw JSON：
// 1) 兼容纯 JSON（旧格式）
// 2) 兼容 Obsidian .excalidraw.md 中的 ```json 代码块
function extractExcalidrawJsonText(content: string) {
  const raw = content.trim()
  if (!raw) return ""
  if (raw.startsWith("{")) return raw

  const codeBlockMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i)
  if (codeBlockMatch?.[1]) {
    return codeBlockMatch[1].trim()
  }
  return ""
}

// 构建 Obsidian 兼容的 .excalidraw.md 内容：
// Excalidraw 场景 JSON 放到 markdown 的 json 代码块中。
function buildObsidianExcalidrawMarkdown(sceneJson: string) {
  return [
    "---",
    "excalidraw-plugin: parsed",
    "tags: [excalidraw]",
    "---",
    "",
    "==⚠  Switch to EXCALIDRAW VIEW in the MORE OPTIONS menu of this document. ⚠==",
    "",
    "# Drawing",
    "```json",
    sceneJson,
    "```",
    "",
  ].join("\n")
}

const TABS_STORAGE_KEY = "hora_editor_tabs"
const ACTIVE_TAB_STORAGE_KEY = "hora_editor_active_tab"
// 没有 URL open 参数时也需要一个稳定占位，用来区分“关闭后的空白页”和“重新点击打开”。
const BLANK_ROUTE_NO_OPEN_KEY = "__hora_blank_route_without_open__"

// 笔记编辑页：左侧点击文件后，在右侧展示并编辑。
export default function NoteEditorPage() {
  // 动态路由参数：noteId 由 Sidebar 文件节点带入。
  const params = useParams<{ noteId: string }>()
  const noteId = params.noteId
  const router = useRouter()
  const searchParams = useSearchParams()
  const openKey = searchParams.get("open")

  // 页面标题：显示当前笔记标题。
  const [title, setTitle] = useState("笔记")
  // 错误提示：用于展示桥接失败等错误。
  const [error, setError] = useState<string | null>(null)
  // 状态提示：保存完成时间。
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // 初始 HTML：Markdown 文件加载后转换得到。
  const [initialHtml, setInitialHtml] = useState("")
  // 编辑器 HTML：SimpleEditor 输出的当前内容。
  const [editorHtml, setEditorHtml] = useState("")
  // 文本编辑内容：txt/csv/log 等按纯文本保存，避免富文本转换破坏格式。
  const [textPreview, setTextPreview] = useState("")
  // 当前路径面包屑。
  const [pathParts, setPathParts] = useState<string[]>([])
  // 当前文件类型：.md 走富文本，.excalidraw.md 走画布。
  const [noteFileKind, setNoteFileKind] = useState<NoteFileKind>("markdown")
  // 画布初始数据：从 .excalidraw JSON 反序列化得到。
  const [drawingInitialData, setDrawingInitialData] = useState<ExcalidrawInitialDataState | null>(null)
  // 画布重建版本：切换绘图文件后递增，强制 Excalidraw 重新初始化。
  const [drawingRenderVersion, setDrawingRenderVersion] = useState(0)
  // 画布是否完成当前文件内容加载：未完成前不渲染，避免空白实例占位。
  const [drawingReady, setDrawingReady] = useState(false)

  // 标签状态：显示标签行并支持切换。
  const [tabs, setTabs] = useState<EditorTab[]>([{ id: "tab-1", label: "未命名", noteId: null }])
  const [activeTabId, setActiveTabId] = useState("tab-1")
  // 最近关闭的标签：用于空白页恢复刚关闭的文件。
  const [lastClosedTab, setLastClosedTab] = useState<EditorTab | null>(null)
  // 记录进入空白页时所在的路由，避免左侧点击其它文件时仍被空白页拦住。
  const [blankRouteNoteId, setBlankRouteNoteId] = useState<string | null>(null)
  // 记录进入空白页时的打开标记，让再次点击同一文件也能被识别为新打开动作。
  const [blankRouteOpenKey, setBlankRouteOpenKey] = useState<string | null>(null)
  // 恢复完成标记：避免初始默认标签把本地多标签缓存覆盖掉。
  const [tabsRestored, setTabsRestored] = useState(false)
  // 当前激活标签的即时引用：避免“点+后立刻点文件”时状态尚未提交导致覆盖旧标签。
  const activeTabIdRef = React.useRef("tab-1")
  // 标签快照引用：供异步回调读取最新 tabs，避免闭包拿到旧值。
  const tabsRef = React.useRef<EditorTab[]>([{ id: "tab-1", label: "未命名", noteId: null }])
  // 内容加载序号：仅允许最后一次请求写入，防止 A/B 标签串内容。
  const loadSeqRef = React.useRef(0)
  // 当前文件是否存在未保存修改：切换文件前先自动落盘。
  const hasUnsavedChangesRef = React.useRef(false)
  // 正在加载文件内容时不把初始化内容误判成编辑修改。
  const isHydratingContentRef = React.useRef(false)
  // 最近一次真正完成加载的 noteId：用于判断是否需要在切换前自动保存。
  const loadedNoteIdRef = React.useRef<string | null>(null)
  // 自动保存中的共享 Promise：避免“点击外部”和“点击文件树”同时触发两次保存。
  const saveInFlightRef = React.useRef<Promise<void> | null>(null)
  // 编辑器可视区域：点击该区域外时触发自动保存。
  const editorSurfaceRef = React.useRef<HTMLDivElement | null>(null)
  // Excalidraw API 引用：用于导入 Mermaid 后直接写入场景。
  const excalidrawApiRef = React.useRef<ExcalidrawImperativeAPI | null>(null)
  // 画布实时场景缓存：保存时直接序列化，避免读取过期状态。
  const drawingSceneRef = React.useRef<{
    // Excalidraw 内部元素类型在当前版本未直接导出，这里使用宽类型持有场景元素。
    elements: readonly unknown[]
    appState: ExcalidrawAppState
    files: BinaryFiles
  } | null>(null)

  // 立即持久化标签状态：避免路由瞬时切换导致读取到旧缓存。
  const persistTabsState = React.useCallback((nextTabs: EditorTab[], nextActiveTabId: string) => {
    window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(nextTabs))
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, nextActiveTabId)
  }, [])

  // 当前编辑内容一旦发生实际修改，就把脏标记打开，后续切换文件时会自动保存。
  const markUnsavedChanges = React.useCallback(() => {
    if (isHydratingContentRef.current) return
    hasUnsavedChangesRef.current = true
  }, [])

  // Markdown -> HTML 转换器。
  const md = useMemo(() => new MarkdownIt({ html: true, linkify: true, breaks: true }), [])
  // HTML -> Markdown 转换器。
  const turndown = useMemo(() => new TurndownService(), [])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  )

  // 同步 tabs 引用，供异步逻辑读取最新值。
  useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  // 首次恢复标签状态。
  useEffect(() => {
    const rawTabs = window.localStorage.getItem(TABS_STORAGE_KEY)
    const rawActive = window.localStorage.getItem(ACTIVE_TAB_STORAGE_KEY)

    if (rawTabs) {
      try {
        const parsed = JSON.parse(rawTabs) as EditorTab[]
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTabs(parsed)
        } else if (Array.isArray(parsed)) {
          setTabs([])
          setActiveTabId("")
          activeTabIdRef.current = ""
          setBlankRouteNoteId(noteId ?? null)
          setBlankRouteOpenKey(openKey ?? BLANK_ROUTE_NO_OPEN_KEY)
        }
      } catch {
        // 保留注释：本地缓存损坏时回退默认标签。
      }
    }

    if (rawActive) {
      setActiveTabId(rawActive)
      activeTabIdRef.current = rawActive
    }

    // 标记恢复完成，后续才允许持久化与路由绑定。
    setTabsRestored(true)
  }, [])

  // 标签状态持久化。
  useEffect(() => {
    // 未完成恢复前禁止写缓存，防止把历史标签误覆盖为默认单标签。
    if (!tabsRestored) return
    tabsRef.current = tabs
    window.localStorage.setItem(TABS_STORAGE_KEY, JSON.stringify(tabs))
  }, [tabs, tabsRestored])

  useEffect(() => {
    // 未完成恢复前禁止写缓存，保持本地状态一致性。
    if (!tabsRestored) return
    window.localStorage.setItem(ACTIVE_TAB_STORAGE_KEY, activeTabId)
    activeTabIdRef.current = activeTabId
  }, [activeTabId, tabsRestored])

  // 仅在路由 noteId 变化时，把当前激活标签绑定到该文件。
  useEffect(() => {
    // 恢复完成后再绑定，避免初始化阶段绑定到错误标签。
    if (!tabsRestored) return
    if (!noteId) return
    if (tabs.length === 0) return

    setTabs((prev) => {
      const next = [...prev]
      const idx = next.findIndex((tab) => tab.id === activeTabIdRef.current)
      if (idx === -1) return prev
      next[idx] = { ...next[idx], noteId }
      persistTabsState(next, activeTabIdRef.current)
      return next
    })
  }, [noteId, persistTabsState, tabs.length, tabsRestored])

  // 加载笔记基础信息与 Markdown 内容：左侧点文件后只跟路由 noteId 走。
  useEffect(() => {
    const run = async () => {
      // 每次路由文件变化触发新序号，旧请求结果会被丢弃。
      const seq = ++loadSeqRef.current
      const currentNoteId = noteId ?? null
      const previousLoadedNoteId = loadedNoteIdRef.current
      const isStale = () => {
        if (seq !== loadSeqRef.current) return true
        return false
      }

      // 先把旧文件保存掉，再加载新文件，避免切换后把未保存内容覆盖掉。
      if (
        previousLoadedNoteId &&
        previousLoadedNoteId !== currentNoteId &&
        hasUnsavedChangesRef.current &&
        activeTab?.noteId === previousLoadedNoteId
      ) {
        await handleSave()
        if (isStale()) return
      }

      // 关闭全部标签后停留在当前路由时显示空白页；点击左侧其它文件会继续加载。
      if (
        tabs.length === 0 &&
        currentNoteId === blankRouteNoteId &&
        // 只有关闭那一刻的原始路由才保持空白，重新点击同一笔记会带新 openKey 并立即打开内容。
        (openKey ?? BLANK_ROUTE_NO_OPEN_KEY) === blankRouteOpenKey
      ) {
        setTitle("未打开文件")
        setPathParts([])
        setInitialHtml("")
        setEditorHtml("")
        setTextPreview("")
        return
      }

      // 空白路由：不读取文件，保留当前标签的空白状态。
      if (!currentNoteId) {
        if (isStale()) return
        loadedNoteIdRef.current = null
        setNoteFileKind("markdown")
        setTitle(activeTab?.label || "未命名")
        setPathParts([])
        setInitialHtml("")
        setEditorHtml("")
        setTextPreview("")
        hasUnsavedChangesRef.current = false
        setDrawingInitialData(null)
        setDrawingReady(false)
        return
      }

      try {
        isHydratingContentRef.current = true
        setError(null)

        const note = (await window.horaDB?.getNote(currentNoteId)) as NoteRecord | null
        if (isStale()) return
        if (note && note.nodeType === "file") {
          setTitle(note.title)
          const nextKind = getNoteFileKind(note.filePath)
          setNoteFileKind(nextKind)
          if (tabs.length === 0) {
            const id = `tab-${Date.now()}`
            const nextTab: EditorTab = { id, label: note.title, noteId: currentNoteId }
            persistTabsState([nextTab], id)
            activeTabIdRef.current = id
            setActiveTabId(id)
            setTabs([nextTab])
            setBlankRouteNoteId(null)
            setBlankRouteOpenKey(null)
          }
          setTabs((prev) => {
            if (prev.length === 0) return prev
            const next = [...prev]
            // 将当前路由文件绑定到当前激活标签；找不到时只加载内容，不阻塞显示。
            const idx = next.findIndex((tab) => tab.id === activeTabIdRef.current)
            if (idx === -1) return prev
            next[idx] = { ...next[idx], label: note.title, noteId: currentNoteId }
            return next
          })
        } else {
          setTitle("笔记")
        }

        const rows = (await window.horaDB?.listNoteNodes()) as NoteNodeRow[]
        if (isStale()) return
        const rowMap = new Map(rows.map((row) => [row.id, row]))
        const parts: string[] = []
        let cursor = rowMap.get(currentNoteId) || null
        while (cursor) {
          parts.unshift(cursor.title)
          cursor = cursor.parentId ? rowMap.get(cursor.parentId) || null : null
        }
        if (isStale()) return
        setPathParts(parts)

        if (getNoteFileKind(note?.filePath) === "external") {
          try {
            // PDF/Word/Excel 等文件交给系统默认应用，避免错误读写二进制内容。
            await window.horaDB?.openNoteWithDefaultApp(currentNoteId)
          } catch (openError) {
            setError(openError instanceof Error ? openError.message : "打开默认应用失败")
          }
          if (isStale()) return
          setInitialHtml("")
          setEditorHtml("")
          setTextPreview("")
          hasUnsavedChangesRef.current = false
          setDrawingInitialData(null)
          setDrawingReady(false)
          loadedNoteIdRef.current = currentNoteId
          return
        }

        const text = (await window.horaDB?.readNoteContent(currentNoteId)) as string
        if (isStale()) return
        if (isDrawingPath(note?.filePath)) {
          // 绘图文件切换期间先标记未就绪，防止先挂空画布后不再刷新。
          setDrawingReady(false)
          // 绘图文件：优先按 Excalidraw JSON 恢复；空文件则给空白画布。
          if (!text.trim()) {
            setDrawingInitialData({ elements: [], appState: { viewBackgroundColor: "#ffffff" } })
          } else {
            try {
              const jsonText = extractExcalidrawJsonText(text)
              const parsed = JSON.parse(jsonText) as ExcalidrawInitialDataState
              setDrawingInitialData(parsed)
            } catch {
              setDrawingInitialData({ elements: [], appState: { viewBackgroundColor: "#ffffff" } })
            }
          }
          // 每次成功读取绘图内容后，强制重建 Excalidraw，确保 initialData 生效。
          setDrawingRenderVersion((prev) => prev + 1)
          setDrawingReady(true)
          drawingSceneRef.current = null
          setInitialHtml("")
          setEditorHtml("")
          setTextPreview("")
          hasUnsavedChangesRef.current = false
        } else if (getNoteFileKind(note?.filePath) === "text") {
          // 文本类文件进入纯文本编辑模式，保留原始换行和逗号/制表符结构。
          setTextPreview(text || "")
          setInitialHtml("")
          setEditorHtml("")
          hasUnsavedChangesRef.current = false
          setDrawingInitialData(null)
          setDrawingReady(false)
        } else {
          const html = md.render(text || "")
          if (isStale()) return
          setInitialHtml(html)
          setEditorHtml(html)
          setTextPreview("")
          hasUnsavedChangesRef.current = false
          setDrawingInitialData(null)
          setDrawingReady(false)
        }
        loadedNoteIdRef.current = currentNoteId
      } catch (err) {
        if (isStale()) return
        setError(err instanceof Error ? err.message : "加载笔记失败")
      } finally {
        isHydratingContentRef.current = false
      }
    }

    void run()
  }, [
    activeTab?.label,
    blankRouteNoteId,
    blankRouteOpenKey,
    md,
    noteId,
    openKey,
    persistTabsState,
    tabs.length,
  ])

  // 保存当前内容：HTML -> Markdown 后写入 .md 文件。
  const handleSave = useCallback(async () => {
    // 保存时以当前激活标签绑定的 noteId 为准，防止路由与标签短暂不同步。
    const currentNoteId = tabs.find((tab) => tab.id === activeTabIdRef.current)?.noteId ?? null
    if (!currentNoteId) {
      return
    }

    try {
      setError(null)
      if (noteFileKind === "external") {
        return
      }

      if (noteFileKind === "text") {
        // 文本模式直接按原始字符串保存，不经过 Markdown/HTML 转换。
        await window.horaDB?.saveNoteContent({ noteId: currentNoteId, content: textPreview })
      } else if (noteFileKind === "drawing") {
        // 绘图模式：将当前场景完整序列化到 .excalidraw.md 文件。
        const scene = drawingSceneRef.current
        const sceneJson = scene
          ? serializeAsJSON(scene.elements as never[], scene.appState, scene.files, "local")
          : JSON.stringify({ type: "excalidraw", version: 2, source: "hora", elements: [], appState: {} })
        // .excalidraw.md 按 Obsidian 插件可识别的 markdown 容器格式保存。
        const content = buildObsidianExcalidrawMarkdown(sceneJson)
        await window.horaDB?.saveNoteContent({ noteId: currentNoteId, content })
      } else {
        const markdown = turndown.turndown(editorHtml)
        await window.horaDB?.saveNoteContent({ noteId: currentNoteId, content: markdown })
      }
      hasUnsavedChangesRef.current = false
      setLastSavedAt(new Date().toLocaleString())
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    }
  }, [editorHtml, noteFileKind, tabs, textPreview, turndown])

  // 共享自动保存入口：外部点击、文件树切换、标签切换都可以共用它。
  const requestAutoSave = useCallback(async () => {
    if (!hasUnsavedChangesRef.current) return
    if (saveInFlightRef.current) {
      await saveInFlightRef.current
      return
    }

    let currentPromise: Promise<void>
    currentPromise = handleSave().finally(() => {
      if (saveInFlightRef.current === currentPromise) {
        saveInFlightRef.current = null
      }
    })
    saveInFlightRef.current = currentPromise
    await currentPromise
  }, [handleSave])

  // 左侧文件树切换文件前的统一保存回调：树组件会先等待这里完成，再执行路由跳转。
  useEffect(() => {
    const bridge = window as Window & {
      horaNotesBeforeNavigate?: () => Promise<void>
    }

    bridge.horaNotesBeforeNavigate = async () => {
      await requestAutoSave()
    }

    return () => {
      if (bridge.horaNotesBeforeNavigate === undefined) return
      delete bridge.horaNotesBeforeNavigate
    }
  }, [requestAutoSave])

  // 鼠标点击编辑器区域之外时自动保存，避免切走前忘记点保存按钮。
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      const editorSurface = editorSurfaceRef.current
      if (!editorSurface) return
      if (editorSurface.contains(target)) return
      void requestAutoSave()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true)
    }
  }, [requestAutoSave])

  // 绘图/文本模式快捷键桥接：补齐 Markdown 编辑器已有的 Cmd/Ctrl + S 保存行为。
  useEffect(() => {
    // 非绘图/文本模式不挂载快捷键，避免影响现有 Markdown 编辑体验。
    if (noteFileKind !== "drawing" && noteFileKind !== "text") return

    const onKeyDown = (event: KeyboardEvent) => {
      // 同时兼容 macOS Command 与 Windows/Linux Control。
      const isCommand = event.metaKey
        || event.ctrlKey
        || event.getModifierState("Meta")
        || event.getModifierState("Control")
      if (!isCommand) return

      // 与 Markdown 一致：Cmd/Ctrl + S 直接保存当前绘图或纯文本。
      if (event.key.toLowerCase() === "s") {
        event.preventDefault()
        event.stopPropagation()
        void handleSave()
      }
    }

    // 使用捕获阶段优先处理，避免被画布或文本框内部按键逻辑提前吞掉。
    window.addEventListener("keydown", onKeyDown, true)
    return () => {
      window.removeEventListener("keydown", onKeyDown, true)
    }
  }, [handleSave, noteFileKind])

  // 新建空标签：切换到空白页面，等待后续点左侧文件绑定。
  const handleAddTab = () => {
    const id = `tab-${Date.now()}`
    const nextTab: EditorTab = { id, label: "未命名", noteId: null }
    const nextTabs = [...tabs, nextTab]

    // 先同步写缓存，再更新内存状态，确保后续立刻跳转也能恢复到新标签。
    persistTabsState(nextTabs, id)
    activeTabIdRef.current = id
    setTabs(nextTabs)
    setActiveTabId(id)
    setBlankRouteNoteId(null)
    setBlankRouteOpenKey(null)
    setInitialHtml("")
    setEditorHtml("")
    setTextPreview("")
    setTitle("未命名")
    setPathParts([])
  }

  // 空白页创建根目录 Markdown 文件，并立即用新标签打开。
  const handleCreateFileFromBlank = async () => {
    const created = await window.horaDB?.createNoteNode({
      parentId: null,
      nodeType: "file",
      title: "新建文件",
    }) as { id?: string; title?: string } | null | undefined

    if (!created?.id) return

    const id = `tab-${Date.now()}`
    const nextTab: EditorTab = {
      id,
      label: created.title || "新建文件",
      noteId: created.id,
    }

    persistTabsState([nextTab], id)
    activeTabIdRef.current = id
    setTabs([nextTab])
    setActiveTabId(id)
    setBlankRouteNoteId(null)
    setBlankRouteOpenKey(null)
    router.push(`/notes/${created.id}`)
  }

  // 空白页恢复刚刚关闭的标签。
  const handleReopenLastClosedTab = () => {
    if (!lastClosedTab) return

    const restoredTab: EditorTab = {
      ...lastClosedTab,
      id: `tab-${Date.now()}`,
    }

    persistTabsState([restoredTab], restoredTab.id)
    activeTabIdRef.current = restoredTab.id
    setTabs([restoredTab])
    setActiveTabId(restoredTab.id)
    setLastClosedTab(null)
    setBlankRouteNoteId(null)
    setBlankRouteOpenKey(null)

    if (restoredTab.noteId) {
      router.push(`/notes/${restoredTab.noteId}`)
      return
    }

    setTitle(restoredTab.label)
    setPathParts([])
    setInitialHtml("")
    setEditorHtml("")
    setTextPreview("")
  }

  // 切换标签：有绑定笔记就跳转该笔记，没有则停留空白状态。
  const handleSwitchTab = (tabId: string) => {
    const nextTarget = tabs.find((tab) => tab.id === tabId)
    void (async () => {
      // 切换标签前先自动保存当前标签内容，避免用户没点手动保存就丢失。
      if (hasUnsavedChangesRef.current) {
        await handleSave()
      }

      persistTabsState(tabs, tabId)
      activeTabIdRef.current = tabId
      setActiveTabId(tabId)
      setBlankRouteNoteId(null)
      setBlankRouteOpenKey(null)
      // 立即清空旧内容，避免视觉上停留在上一个标签内容。
      setInitialHtml("")
      setEditorHtml("")
      setTextPreview("")
      setPathParts([])
      setTitle(nextTarget?.label || "未命名")
      if (nextTarget?.noteId) {
        router.push(`/notes/${nextTarget.noteId}`)
      }
    })()
  }

  // 关闭指定标签：关闭当前标签时自动切换到相邻标签并同步内容与路由。
  const handleCloseTab = async (tabId: string) => {
    const closingIndex = tabs.findIndex((tab) => tab.id === tabId)
    if (closingIndex === -1) return

    const closingTab = tabs[closingIndex]
    const nextTabs = tabs.filter((tab) => tab.id !== tabId)
    const isClosingActive = activeTabIdRef.current === tabId
    setLastClosedTab(closingTab)

    // 关闭当前标签前先自动保存，避免误关导致修改丢失。
    if (isClosingActive && hasUnsavedChangesRef.current) {
      await handleSave()
    }

    // 最后一个标签也允许关闭，关闭后显示空白页。
    if (nextTabs.length === 0) {
      persistTabsState([], "")
      activeTabIdRef.current = ""
      setTabs([])
      setActiveTabId("")
      setBlankRouteNoteId(noteId ?? null)
      setBlankRouteOpenKey(openKey ?? BLANK_ROUTE_NO_OPEN_KEY)
      setTitle("未打开文件")
      setPathParts([])
      setInitialHtml("")
      setEditorHtml("")
      setTextPreview("")
      return
    }

    // 非当前标签：仅移除该标签，不影响当前视图。
    if (!isClosingActive) {
      persistTabsState(nextTabs, activeTabIdRef.current)
      setTabs(nextTabs)
      return
    }

    // 关闭当前标签：优先切到右侧，否则切到左侧标签。
    const fallbackIndex = Math.min(closingIndex, nextTabs.length - 1)
    const nextActiveTab = nextTabs[fallbackIndex]
    const nextActiveTabId = nextActiveTab?.id ?? "tab-1"

    persistTabsState(nextTabs, nextActiveTabId)
    activeTabIdRef.current = nextActiveTabId
    setTabs(nextTabs)
    setActiveTabId(nextActiveTabId)

    // 根据目标标签是否绑定文件，立即同步视图状态与路由。
    if (nextActiveTab?.noteId) {
      router.push(`/notes/${nextActiveTab.noteId}`)
      return
    }

    setInitialHtml("")
    setEditorHtml("")
    setTextPreview("")
    setTitle(nextActiveTab?.label || "未命名")
    setPathParts([])
  }

  return (
    <section className="flex h-[calc(100vh-2rem)] flex-col">
      {/* 第一行：左侧展开按钮 + 标签行（同一行）。 */}
      <header className="mb-2 flex items-center gap-2 border-b border-border pb-2">
        <SidebarTrigger className="shrink-0" />

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="group flex max-w-[220px] shrink-0 items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-sm"
            >
              {/* 标签标题按钮：只负责切换，避免和关闭按钮发生嵌套冲突。 */}
              <Button
                type="button"
                onClick={() => handleSwitchTab(tab.id)}
                variant={tab.id === activeTabId ? "secondary" : "ghost"}
                size="sm"
                className="min-w-0 flex-1 justify-start gap-2 px-2"
              >
                <span className="min-w-0 truncate text-left">{tab.label}</span>
              </Button>

              {/* 关闭按钮：使用独立图标按钮，保持结构和可点击区域都更清晰。 */}
              <Button
                type="button"
                aria-label={`关闭标签 ${tab.label}`}
                variant="ghost"
                size="icon-sm"
                className="shrink-0 text-muted-foreground opacity-70 transition group-hover:opacity-100"
                onClick={() => handleCloseTab(tab.id)}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>

        <Button type="button" size="icon-sm" variant="outline" onClick={handleAddTab}>
          <Plus className="size-4" />
        </Button>
      </header>

      {tabs.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center text-foreground">
            <p className="text-base font-medium">未打开文件</p>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                void handleCreateFileFromBlank()
              }}
            >
              创建新文件
            </Button>
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={handleReopenLastClosedTab}
              disabled={!lastClosedTab}
            >
              打开上一个标签页
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* 面包屑：显示当前文件路径。 */}
          <div className="mb-1 flex justify-center text-center text-[10px] text-muted-foreground">
            <Breadcrumb>
              <BreadcrumbList className="justify-center gap-1 text-[10px] text-muted-foreground">
                {pathParts.length === 0 ? (
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-muted-foreground">空白标签</BreadcrumbPage>
                  </BreadcrumbItem>
                ) : (
                  pathParts.map((part, index) => (
                    <React.Fragment key={`${part}-${index}`}>
                      <BreadcrumbItem>
                        <BreadcrumbPage className="text-muted-foreground">{part}</BreadcrumbPage>
                      </BreadcrumbItem>
                      {index < pathParts.length - 1 ? <BreadcrumbSeparator /> : null}
                    </React.Fragment>
                  ))
                )}
              </BreadcrumbList>
            </Breadcrumb>
          </div>

          {/* 错误提示。 */}
          {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}

          {/* 编辑区：去掉外层圆角和内缩，消除边框间距。 */}
          <div ref={editorSurfaceRef} className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            {noteFileKind === "drawing" ? (
              <div className="h-full min-h-0">
                {drawingReady ? (
                  <Excalidraw
                    key={`${activeTabId}:${noteId ?? activeTab?.noteId ?? "blank"}:${drawingRenderVersion}`}
                    initialData={drawingInitialData}
                    // 自动聚焦画布，确保复制/粘贴等快捷键可直接命中 Excalidraw。
                    autoFocus
                    excalidrawAPI={(api) => {
                      // 缓存 API：后续如需扩展动作（如导入）可复用。
                      excalidrawApiRef.current = api
                    }}
                    onChange={(elements, appState, files) => {
                      // 实时缓存画布状态，供保存时直接序列化。
                      drawingSceneRef.current = { elements, appState, files }
                      markUnsavedChanges()
                    }}
                  />
                ) : (
                  // 绘图内容加载中占位：避免出现“先空白后不刷新”的错觉。
                  <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                    正在加载绘图...
                  </div>
                )}
              </div>
            ) : noteFileKind === "text" ? (
              // 文本编辑：不进入富文本编辑器，保存时直接写回原始纯文本。
              <textarea
                value={textPreview}
                onChange={(event) => {
                  setTextPreview(event.target.value)
                  markUnsavedChanges()
                }}
                spellCheck={false}
                className="h-full w-full resize-none overflow-auto border-0 bg-card p-4 font-mono text-sm leading-6 text-foreground outline-none"
              />
            ) : noteFileKind === "external" ? (
              <div className="flex h-full items-center justify-center p-6 text-center">
                <div className="max-w-sm space-y-3 text-sm text-muted-foreground">
                  <p className="text-base font-medium text-foreground">已使用系统默认应用打开</p>
                  <p>该文件类型不适合直接在编辑器中读写，避免损坏原文件。</p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      if (noteId) void window.horaDB?.openNoteWithDefaultApp(noteId)
                    }}
                  >
                    再次打开
                  </Button>
                </div>
              </div>
            ) : (
              <SimpleEditor
                // 使用标签与文件绑定作为 key，切换标签时强制重建编辑器，立即显示对应内容。
                key={`${activeTabId}:${activeTab?.noteId ?? "blank"}`}
                contentKey={`${activeTabId}:${noteId ?? activeTab?.noteId ?? "blank"}`}
                initialContent={initialHtml}
                onContentChange={(html) => {
                  setEditorHtml(html)
                  markUnsavedChanges()
                }}
                onSave={() => {
                  void handleSave()
                }}
              />
            )}
          </div>

          {lastSavedAt ? (
            <p className="mt-1 text-[10px] text-muted-foreground">上次保存：{lastSavedAt}</p>
          ) : null}
        </>
      )}
    </section>
  )
}
