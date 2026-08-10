"use client"

// Note 详情页：读取 Markdown，交给官方 SimpleEditor 编辑，并保存回文件系统。

import React, { useCallback, useEffect, useEffectEvent, useMemo, useState } from "react"
import dynamic from "next/dynamic"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import MarkdownIt from "markdown-it"
import footnotePlugin from "markdown-it-footnote"
import taskListsPlugin from "markdown-it-task-lists"
import texmathPlugin from "markdown-it-texmath"
import katex from "katex"
import hljs from "highlight.js"
import {
  Download,
  Eye,
  FileCode2,
  Focus,
  Menu,
  PenLine,
  Plus,
  Search,
  TextCursorInput,
  X,
} from "lucide-react"
import { SimpleEditor } from "@/components/tiptap-templates/simple/simple-editor"
import { type AppLanguage, useAppLanguage, useT } from "@/lib/app-language"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import "@excalidraw/excalidraw/index.css"
import "katex/dist/katex.min.css"
import "markdown-it-texmath/css/texmath.css"
import "highlight.js/styles/github.css"
import type {
  AppState as ExcalidrawAppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from "@excalidraw/excalidraw/types"

// Excalidraw 仅在客户端渲染，避免 SSR 触发浏览器 API 报错。
const HoraExcalidraw = dynamic(
  async () => (await import("@/components/hora-excalidraw")).HoraExcalidraw,
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
type MarkdownViewMode = "rich" | "source" | "preview"

type HeadingOutlineItem = {
  id: string
  index: number
  level: number
  line: number
  text: string
}

type SearchMatch = {
  end: number
  start: number
}

type ParsedFrontmatter = {
  body: string
  frontmatter: string
}

type MarkdownActionsMenuProps = {
  className?: string
  focusMode: boolean
  markdownViewMode: MarkdownViewMode
  onExportHtml: () => void
  onMarkdownViewModeChange: (mode: MarkdownViewMode) => void
  onToggleFocusMode: () => void
  onToggleSearch: () => void
  onTypewriterModeChange: (enabled: boolean) => void
  searchOpen: boolean
  typewriterMode: boolean
}

// 编辑器视图与阅读辅助项统一收进右上角菜单，避免单独占用一整行内容高度。
function MarkdownActionsMenu({
  className,
  focusMode,
  markdownViewMode,
  onExportHtml,
  onMarkdownViewModeChange,
  onToggleFocusMode,
  onToggleSearch,
  onTypewriterModeChange,
  searchOpen,
  typewriterMode,
}: MarkdownActionsMenuProps) {
  const t = useT()

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className={cn("shrink-0", className)}
          aria-label={t("editorViewOptions")}
          title={t("editorViewOptions")}
        >
          <Menu aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {/* 三种文档模式互斥，RadioGroup 会清晰保留当前选择。 */}
        <DropdownMenuLabel>{t("editorViewOptions")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={markdownViewMode}
          onValueChange={(nextMode) => onMarkdownViewModeChange(nextMode as MarkdownViewMode)}
        >
          <DropdownMenuRadioItem value="rich">
            <PenLine aria-hidden="true" />
            {t("editorRichMode")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="source">
            <FileCode2 aria-hidden="true" />
            {t("editorSourceMode")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="preview">
            <Eye aria-hidden="true" />
            {t("editorPreviewMode")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        {/* 文档辅助操作保留原有处理函数，只调整入口层级。 */}
        <DropdownMenuGroup>
          <DropdownMenuCheckboxItem checked={searchOpen} onCheckedChange={onToggleSearch}>
            <Search aria-hidden="true" />
            {t("editorSearch")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={focusMode} onCheckedChange={onToggleFocusMode}>
            <Focus aria-hidden="true" />
            {t("editorFocusMode")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={typewriterMode} onCheckedChange={onTypewriterModeChange}>
            <TextCursorInput aria-hidden="true" />
            {t("editorTypewriterMode")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onExportHtml}>
          <Download aria-hidden="true" />
          {t("editorExportHtml")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const OUTLINE_INDENT_CLASSES = ["pl-2", "pl-5", "pl-8", "pl-11", "pl-14", "pl-16"]

// 大纲最多按 h1-h6 缩进，避免动态 style 破坏 Tailwind 风格一致性。
function getOutlineIndentClass(level: number) {
  return OUTLINE_INDENT_CLASSES[Math.min(Math.max(level, 1), 6) - 1]
}

// 预览层拼 HTML 时只允许我们生成结构，用户标题文本必须转义。
function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

// Mermaid 源码放进 data 属性前先编码，避免图表文本破坏 HTML 属性结构。
function encodeMermaidSource(source: string) {
  return encodeURIComponent(source)
}

// 解析 Markdown 文件头部 YAML frontmatter；只识别文件开头的 --- 块，避免误伤正文分隔线。
function splitMarkdownFrontmatter(markdown: string): ParsedFrontmatter {
  const normalized = markdown.replace(/^\uFEFF/, "")
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized)
  if (!match) return { body: markdown, frontmatter: "" }

  const frontmatterBlock = match[0].replace(/\r?\n$/, "")
  return {
    body: normalized.slice(match[0].length).replace(/^\r?\n/, ""),
    frontmatter: frontmatterBlock,
  }
}

// 写作模式保存时把原始 frontmatter 拼回正文，避免 YAML 元信息被富文本编辑区改写。
function composeMarkdownWithFrontmatter(frontmatter: string, body: string) {
  const trimmedBody = body.replace(/^\n+/, "")
  if (!frontmatter.trim()) return trimmedBody
  return `${frontmatter.trimEnd()}\n\n${trimmedBody}`
}

// 统一创建 Markdown 渲染器：基础 Markdown + 脚注 + 数学公式 + Mermaid 占位。
function createMarkdownRenderer() {
  const renderer = new MarkdownIt({
    html: true,
    linkify: true,
    breaks: true,
    highlight: (code, language) => {
      const normalizedLanguage = language?.trim().toLowerCase()
      if (normalizedLanguage && hljs.getLanguage(normalizedLanguage)) {
        try {
          return hljs.highlight(code, { language: normalizedLanguage, ignoreIllegals: true }).value
        } catch {
          // 高亮失败时回退自动识别，避免整个预览报错。
        }
      }

      return hljs.highlightAuto(code).value
    },
  })
  const defaultFence = renderer.renderer.rules.fence

  renderer.use(footnotePlugin)
  renderer.use(taskListsPlugin, {
    enabled: false,
    label: false,
  })
  renderer.use(texmathPlugin, {
    engine: katex,
    delimiters: ["dollars", "brackets"],
    katexOptions: {
      throwOnError: false,
      output: "html",
    },
  })

  renderer.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const language = token.info.trim().split(/\s+/)[0]?.toLowerCase()
    if (language === "mermaid") {
      // Mermaid 预览由客户端 effect 渲染成 SVG，MarkdownIt 这里只输出稳定占位。
      return `<div class="hora-mermaid-block" data-mermaid-source="${encodeMermaidSource(token.content)}"></div>`
    }

    return defaultFence?.(tokens, idx, options, env, slf) ?? slf.renderToken(tokens, idx, options)
  }

  return renderer
}

// Hora 全局语言和 Excalidraw 语言码不完全一致，这里集中做映射。
function getExcalidrawLanguageCode(language: AppLanguage) {
  if (language === "en-US") return "en"
  return language
}

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

// 从 Markdown 源码提取标题，跳过 fenced code block，避免代码示例里的 # 被误当标题。
function getMarkdownOutline(markdown: string): HeadingOutlineItem[] {
  const rows = markdown.split(/\r?\n/)
  const headings: HeadingOutlineItem[] = []
  let inFence = false

  rows.forEach((row, rowIndex) => {
    if (/^\s*(```|~~~)/.test(row)) {
      inFence = !inFence
      return
    }
    if (inFence) return

    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(row)
    if (!match) return

    headings.push({
      id: `source-heading-${rowIndex}`,
      index: headings.length,
      level: match[1].length,
      line: rowIndex,
      text: match[2].trim(),
    })
  })

  return headings
}

// 生成预览模式中的 [TOC] 目录 HTML；源码仍保留 [TOC]，只在预览层替换。
function renderTocHtml(outlineItems: HeadingOutlineItem[], title: string) {
  if (outlineItems.length === 0) return ""

  const items = outlineItems
    .map((item) => {
      const indentClass = getOutlineIndentClass(item.level)
      return [
        `<li class="${indentClass}">`,
        `<a href="#hora-heading-${item.index}">${escapeHtml(item.text)}</a>`,
        "</li>",
      ].join("")
    })
    .join("")

  return `<nav class="hora-toc-block"><div class="hora-toc-title">${escapeHtml(title)}</div><ul>${items}</ul></nav>`
}

// 给标题补锚点，方便 [TOC] 点击跳转；只处理预览 HTML，不改 Markdown 源码。
function addHeadingAnchors(html: string) {
  let headingIndex = 0
  return html.replace(/<h([1-6])([^>]*)>/g, (_match, level: string, attrs: string) => {
    const nextHeading = `<h${level}${attrs} id="hora-heading-${headingIndex}">`
    headingIndex += 1
    return nextHeading
  })
}

// 替换正文里的独立 [TOC] 行，跳过 fenced code block，保证代码示例不被改写。
function replaceTocMarkers(markdown: string, tocHtml: string) {
  const rows = markdown.split(/\r?\n/)
  let inFence = false

  return rows
    .map((row) => {
      if (/^\s*(```|~~~)/.test(row)) {
        inFence = !inFence
        return row
      }
      if (!inFence && /^\s*\[TOC\]\s*$/i.test(row)) {
        return tocHtml
      }
      return row
    })
    .join("\n")
}

// Typora 兼容：独立一行 [TOC] 在预览模式渲染为基于标题的大纲目录。
function renderMarkdownPreviewHtml(markdown: string, renderer: MarkdownIt, tocTitle: string) {
  const outline = getMarkdownOutline(markdown)
  const tocHtml = renderTocHtml(outline, tocTitle)
  const markdownWithoutToc = replaceTocMarkers(markdown, tocHtml || "")
  return addHeadingAnchors(renderer.render(markdownWithoutToc))
}

// 导出文件名需要避开 macOS/Windows 都不适合放进文件名的符号。
function getSafeExportFileName(value: string) {
  const fallbackName = "HoraSpace-note"
  const safeName = value.trim().replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ")
  return `${safeName || fallbackName}.html`
}

// 浏览器下载用于渲染层导出，避免为了 HTML 导出增加新的 Electron 文件系统权限面。
function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

// 导出前把 Mermaid 占位块渲染成静态 SVG，保证导出的 HTML 离开编辑器后也能直接查看图表。
async function renderMermaidInExportHtml(html: string) {
  const container = document.createElement("div")
  container.innerHTML = html

  const blocks = Array.from(container.querySelectorAll<HTMLElement>("[data-mermaid-source]"))
  if (blocks.length === 0) return container.innerHTML

  const mermaid = (await import("mermaid")).default
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: document.documentElement.classList.contains("dark") ? "dark" : "default",
  })

  // 导出也串行渲染多张图，避免 Mermaid 全局临时容器发生并发冲突。
  for (const [index, block] of blocks.entries()) {
    const source = decodeURIComponent(block.dataset.mermaidSource || "")
    const renderId = `hora-export-mermaid-${Date.now()}-${index}`

    try {
      const result = await mermaid.render(renderId, source)
      block.innerHTML = result.svg
      block.removeAttribute("data-mermaid-source")
    } catch (error) {
      block.textContent = error instanceof Error ? error.message : "Mermaid render failed"
      block.classList.add("hora-export-error")
    }
  }

  return container.innerHTML
}

// 独立 HTML 导出壳：内联基础排版样式，让文件在浏览器中打开时保持接近 Hora/Typora 的阅读层级。
function buildMarkdownExportHtml(input: {
  bodyHtml: string
  frontmatter: string
  frontmatterHint: string
  frontmatterTitle: string
  language: AppLanguage
  title: string
}) {
  const frontmatterBlock = input.frontmatter.trim()
    ? [
        `<section class="frontmatter">`,
        `<div class="frontmatter-title">${escapeHtml(input.frontmatterTitle)}</div>`,
        `<pre>${escapeHtml(input.frontmatter)}</pre>`,
        `<p>${escapeHtml(input.frontmatterHint)}</p>`,
        `</section>`,
      ].join("")
    : ""

  return [
    "<!doctype html>",
    `<html lang="${input.language}">`,
    "<head>",
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(input.title)}</title>`,
    "<style>",
    `:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",sans-serif;background:#f7f7f5;color:#242424}`,
    `body{margin:0;padding:48px 20px;background:linear-gradient(180deg,#fbfbfa,#f2f2ef)}`,
    `.page{max-width:880px;margin:0 auto;border:1px solid rgba(0,0,0,.08);border-radius:24px;background:rgba(255,255,255,.9);box-shadow:0 24px 70px rgba(0,0,0,.08);padding:48px}`,
    `h1{font-size:2.25rem;line-height:1.18;margin:0 0 1rem;font-weight:700}h2{font-size:1.65rem;margin:2rem 0 .75rem}h3{font-size:1.28rem;margin:1.5rem 0 .5rem}`,
    `p,li{font-size:1rem;line-height:1.82}a{color:#2563eb}blockquote{border-left:3px solid rgba(0,0,0,.18);margin:1.25rem 0;padding-left:1rem;color:#666}`,
    `pre{overflow:auto;border-radius:16px;background:#f1f1ef;padding:16px}code{border-radius:6px;background:#f1f1ef;padding:.12rem .35rem}pre code{background:transparent;padding:0}`,
    `table{width:100%;border-collapse:collapse;margin:1rem 0}th,td{border:1px solid rgba(0,0,0,.12);padding:.6rem .7rem}th{background:#f5f5f2}`,
    `.frontmatter,.hora-toc-block,.hora-mermaid-block{border:1px solid rgba(0,0,0,.1);border-radius:18px;background:#fafaf8;padding:16px;margin:0 0 20px}`,
    `.frontmatter-title,.hora-toc-title{font-size:.78rem;font-weight:600;color:#737373;margin-bottom:8px}.frontmatter p{font-size:.72rem;color:#858585;margin:.5rem 0 0}`,
    `.hora-toc-block ul{margin:0;padding-left:0}.hora-toc-block li{list-style:none;margin:.25rem 0}.hora-toc-block a{text-decoration:none;color:#666}.hora-export-error{color:#dc2626}`,
    `@media (prefers-color-scheme:dark){:root{background:#161616;color:#e7e5e4}body{background:linear-gradient(180deg,#151515,#20201e)}.page{background:rgba(28,28,27,.92);border-color:rgba(255,255,255,.1);box-shadow:0 24px 70px rgba(0,0,0,.35)}blockquote{border-left-color:rgba(255,255,255,.18);color:#a8a29e}pre,code,.frontmatter,.hora-toc-block,.hora-mermaid-block,th{background:#242422}th,td{border-color:rgba(255,255,255,.12)}.frontmatter-title,.hora-toc-title,.frontmatter p,.hora-toc-block a{color:#a8a29e}}`,
    "</style>",
    "</head>",
    "<body>",
    `<main class="page">`,
    `<h1>${escapeHtml(input.title)}</h1>`,
    frontmatterBlock,
    input.bodyHtml,
    "</main>",
    "</body>",
    "</html>",
  ].join("")
}

// 源码 textarea 的打字机模式：根据光标所在行把滚动位置推到中线附近。
function scrollTextareaCursorToCenter(textarea: HTMLTextAreaElement) {
  const cursorLine = textarea.value.slice(0, textarea.selectionStart).split(/\r?\n/).length - 1
  const lineHeight = 28
  textarea.scrollTop = Math.max(0, cursorLine * lineHeight - textarea.clientHeight / 2)
}

// 普通字符串查找：默认忽略大小写，避免正则特殊字符误伤 Markdown 原文。
function getSearchMatches(source: string, query: string): SearchMatch[] {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return []

  const matches: SearchMatch[] = []
  const haystack = source.toLowerCase()
  const needle = normalizedQuery.toLowerCase()
  let cursor = 0

  while (cursor <= haystack.length) {
    const index = haystack.indexOf(needle, cursor)
    if (index === -1) break
    matches.push({ start: index, end: index + needle.length })
    cursor = index + Math.max(needle.length, 1)
  }

  return matches
}

function FrontmatterPanel({ frontmatter }: { frontmatter: string }) {
  const t = useT()
  if (!frontmatter.trim()) return null

  return (
    <div className="mb-4 rounded-xl border border-border bg-muted/20 p-3">
      <div className="mb-2 text-xs font-medium text-muted-foreground">{t("editorFrontmatter")}</div>
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-background/70 p-3 font-mono text-xs leading-5 text-muted-foreground">
        {frontmatter}
      </pre>
      <p className="mt-2 text-[11px] text-muted-foreground">{t("editorFrontmatterHidden")}</p>
    </div>
  )
}

function MarkdownPreview({
  focusMode = false,
  frontmatter = "",
  html,
}: {
  focusMode?: boolean
  frontmatter?: string
  html: string
}) {
  const previewRef = React.useRef<HTMLDivElement | null>(null)
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    let cancelled = false

    const renderMermaidBlocks = async () => {
      const previewNode = previewRef.current
      if (!previewNode) return

      const blocks = Array.from(previewNode.querySelectorAll<HTMLElement>("[data-mermaid-source]"))
      if (blocks.length === 0) return

      const mermaid = (await import("mermaid")).default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: resolvedTheme === "dark" ? "dark" : "default",
      })

      // Mermaid 使用全局渲染状态，多图按顺序渲染可避免并发时临时 DOM 与 ID 相互覆盖。
      for (const [index, block] of blocks.entries()) {
        const source = decodeURIComponent(block.dataset.mermaidSource || "")
        const renderId = `hora-mermaid-${Date.now()}-${index}`

        try {
          const result = await mermaid.render(renderId, source)
          if (!cancelled) {
            block.innerHTML = result.svg
            block.removeAttribute("data-mermaid-source")
          }
        } catch (error) {
          if (!cancelled) {
            block.textContent = error instanceof Error ? error.message : "Mermaid render failed"
            block.classList.add("text-destructive")
          }
        }
      }
    }

    void renderMermaidBlocks()
    return () => {
      cancelled = true
    }
  }, [html, resolvedTheme])

  return (
    <div
      ref={previewRef}
      data-markdown-preview
      className={cn(
        "h-full overflow-auto bg-card px-8 py-6 text-sm leading-7 text-foreground dark:[&_.hljs]:bg-transparent dark:[&_.hljs-attr]:text-sky-300 dark:[&_.hljs-keyword]:text-rose-300 dark:[&_.hljs-name]:text-sky-300 dark:[&_.hljs-number]:text-amber-300 dark:[&_.hljs-string]:text-emerald-300 dark:[&_.hljs-title]:text-violet-300 [&_.contains-task-list]:list-none [&_.contains-task-list]:pl-0 [&_.footnotes]:mt-10 [&_.footnotes]:border-t [&_.footnotes]:border-border [&_.footnotes]:pt-4 [&_.hora-mermaid-block]:my-6 [&_.hora-mermaid-block]:overflow-auto [&_.hora-mermaid-block]:rounded-xl [&_.hora-mermaid-block]:border [&_.hora-mermaid-block]:border-border [&_.hora-mermaid-block]:bg-muted/20 [&_.hora-mermaid-block]:p-4 [&_.hora-toc-block]:my-6 [&_.hora-toc-block]:rounded-xl [&_.hora-toc-block]:border [&_.hora-toc-block]:border-border [&_.hora-toc-block]:bg-muted/20 [&_.hora-toc-block]:p-4 [&_.hora-toc-block_a]:!no-underline [&_.hora-toc-block_a]:text-muted-foreground [&_.hora-toc-block_a:hover]:text-foreground [&_.hora-toc-block_li]:list-none [&_.hora-toc-block_ul]:m-0 [&_.hora-toc-block_ul]:space-y-1 [&_.hora-toc-title]:mb-2 [&_.hora-toc-title]:text-xs [&_.hora-toc-title]:font-medium [&_.hora-toc-title]:text-muted-foreground [&_.task-list-item-checkbox]:mr-2 [&_.task-list-item-checkbox]:translate-y-px [&_.task-list-item]:list-none [&_.task-list-item]:text-foreground/80 [&_.task-list-item:has(input:checked)]:text-muted-foreground [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_h1]:mb-4 [&_h1]:mt-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h2]:mb-3 [&_h2]:mt-6 [&_h2]:text-2xl [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-xl [&_h3]:font-semibold [&_hr]:my-8 [&_hr]:border-border [&_li]:my-1 [&_ol]:my-4 [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-3 [&_pre]:my-4 [&_pre]:overflow-auto [&_pre]:rounded-xl [&_pre]:bg-muted [&_pre]:p-4 dark:[&_pre]:bg-muted/40 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:bg-muted/50 [&_th]:p-2 [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-6",
        focusMode && "mx-auto max-w-4xl px-12",
      )}
    >
      <FrontmatterPanel frontmatter={frontmatter} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
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
  const initialRouteRef = React.useRef({
    noteId: noteId ?? null,
    openKey: openKey ?? BLANK_ROUTE_NO_OPEN_KEY,
  })
  const { language } = useAppLanguage()
  const t = useT()
  const excalidrawLanguageCode = getExcalidrawLanguageCode(language)

  // 页面标题：显示当前笔记标题。
  const [title, setTitle] = useState("笔记")
  // 错误提示：用于展示桥接失败等错误。
  const [error, setError] = useState<string | null>(null)
  // 状态提示：保存完成时间。
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  // 初始 Markdown 正文：Tiptap 原生 Markdown 管线直接解析，不再先转成 HTML。
  const [initialMarkdownBody, setInitialMarkdownBody] = useState("")
  // 编辑器 Markdown 正文：SimpleEditor 每次更新后直接序列化得到。
  const [editorMarkdownBody, setEditorMarkdownBodyState] = useState("")
  // Markdown 文件头部 YAML 元信息：写作模式不编辑它，但保存时会原样保留。
  const [frontmatterSource, setFrontmatterSourceState] = useState("")
  // Markdown 源码：保留文件原文，源码模式保存时不经过 HTML 往返转换。
  const [markdownSource, setMarkdownSourceState] = useState("")
  // Markdown 视图模式：rich 是所见即所得，source 是源码直编。
  const [markdownViewMode, setMarkdownViewMode] = useState<MarkdownViewMode>("rich")
  // 富文本重建版本：源码切回写作模式时强制 SimpleEditor 解析最新 Markdown。
  const [richEditorVersion, setRichEditorVersion] = useState(0)
  // 专注模式隐藏编辑以外的干扰元素，尽量贴近 Typora 的沉浸写作体验。
  const [focusMode, setFocusMode] = useState(false)
  // 打字机模式让当前编辑行保持在视线中部。
  const [typewriterMode, setTypewriterMode] = useState(false)
  // 查找替换面板：基于 Markdown 源码执行，避免富文本 DOM 替换造成结构损坏。
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [replaceText, setReplaceText] = useState("")
  const [activeSearchIndex, setActiveSearchIndex] = useState(0)
  // 文本编辑内容：txt/csv/log 等按纯文本保存，避免富文本转换破坏格式。
  const [textPreview, setTextPreviewState] = useState("")
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

  // 保存读取同步引用，避免 React 状态尚未提交时丢失最后一次键入或粘贴的内容。
  const editorMarkdownBodyRef = React.useRef("")
  const frontmatterSourceRef = React.useRef("")
  const markdownSourceValueRef = React.useRef("")
  const textPreviewValueRef = React.useRef("")

  // 内容 setter 同步更新状态与保存引用，所有编辑入口共用同一条数据链。
  const setEditorMarkdownBody = React.useCallback((value: string) => {
    editorMarkdownBodyRef.current = value
    setEditorMarkdownBodyState(value)
  }, [])
  const setFrontmatterSource = React.useCallback((value: string) => {
    frontmatterSourceRef.current = value
    setFrontmatterSourceState(value)
  }, [])
  const setMarkdownSource = React.useCallback((value: string) => {
    markdownSourceValueRef.current = value
    setMarkdownSourceState(value)
  }, [])
  const setTextPreview = React.useCallback((value: string) => {
    textPreviewValueRef.current = value
    setTextPreviewState(value)
  }, [])

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
  // 加载新文件前需要调用最新保存函数；用 ref 避免把 handleSave 放入加载 effect 依赖造成循环加载。
  const handleSaveRef = React.useRef<(() => Promise<void>) | null>(null)
  // 编辑器可视区域：点击该区域外时触发自动保存。
  const editorSurfaceRef = React.useRef<HTMLDivElement | null>(null)
  // Markdown 源码 textarea 引用：大纲点击时可以直接定位到对应行。
  const markdownSourceRef = React.useRef<HTMLTextAreaElement | null>(null)
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

  // 预览与导出使用 Mermaid 占位，客户端再把占位安全渲染为 SVG。
  const previewMarkdownRenderer = useMemo(() => createMarkdownRenderer(), [])

  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId) || tabs[0],
    [activeTabId, tabs],
  )

  const getActiveTabEvent = useEffectEvent(() => activeTab)

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
          setBlankRouteNoteId(initialRouteRef.current.noteId)
          setBlankRouteOpenKey(initialRouteRef.current.openKey)
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
        getActiveTabEvent()?.noteId === previousLoadedNoteId
      ) {
        await handleSaveRef.current?.()
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
        setInitialMarkdownBody("")
        setEditorMarkdownBody("")
        setFrontmatterSource("")
        setMarkdownSource("")
        setTextPreview("")
        return
      }

      // 空白路由：不读取文件，保留当前标签的空白状态。
      if (!currentNoteId) {
        if (isStale()) return
        loadedNoteIdRef.current = null
        setNoteFileKind("markdown")
        setTitle(getActiveTabEvent()?.label || "未命名")
        setPathParts([])
        setInitialMarkdownBody("")
        setEditorMarkdownBody("")
        setFrontmatterSource("")
        setMarkdownSource("")
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
          setInitialMarkdownBody("")
          setEditorMarkdownBody("")
          setFrontmatterSource("")
          setMarkdownSource("")
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
          setInitialMarkdownBody("")
          setEditorMarkdownBody("")
          setFrontmatterSource("")
          setMarkdownSource("")
          setTextPreview("")
          hasUnsavedChangesRef.current = false
        } else if (getNoteFileKind(note?.filePath) === "text") {
          // 文本类文件进入纯文本编辑模式，保留原始换行和逗号/制表符结构。
          setTextPreview(text || "")
          setInitialMarkdownBody("")
          setEditorMarkdownBody("")
          setFrontmatterSource("")
          setMarkdownSource("")
          hasUnsavedChangesRef.current = false
          setDrawingInitialData(null)
          setDrawingReady(false)
        } else {
          const parsedMarkdown = splitMarkdownFrontmatter(text || "")
          if (isStale()) return
          setInitialMarkdownBody(parsedMarkdown.body)
          setEditorMarkdownBody(parsedMarkdown.body)
          setFrontmatterSource(parsedMarkdown.frontmatter)
          setMarkdownSource(text || "")
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
    blankRouteNoteId,
    blankRouteOpenKey,
    noteId,
    openKey,
    persistTabsState,
    setEditorMarkdownBody,
    setFrontmatterSource,
    setMarkdownSource,
    setTextPreview,
    tabs.length,
  ])

  // 保存当前内容：源码模式保留原文，写作模式使用 Tiptap 原生 Markdown 输出。
  const handleSave = useCallback(async () => {
    // 保存时以当前激活标签绑定的 noteId 为准，防止路由与标签短暂不同步。
    const currentNoteId = tabsRef.current.find((tab) => tab.id === activeTabIdRef.current)?.noteId ?? null
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
        await window.horaDB?.saveNoteContent({ noteId: currentNoteId, content: textPreviewValueRef.current })
      } else if (noteFileKind === "drawing") {
        // 绘图模式：将当前场景完整序列化到 .excalidraw.md 文件。
        const scene = drawingSceneRef.current
        // Excalidraw 运行时代码只在客户端保存动作发生时加载，避免 Next 服务端渲染访问 window。
        const { serializeAsJSON } = await import("@excalidraw/excalidraw")
        const sceneJson = scene
          ? serializeAsJSON(scene.elements as never[], scene.appState, scene.files, "local")
          : JSON.stringify({ type: "excalidraw", version: 2, source: "hora", elements: [], appState: {} })
        // .excalidraw.md 按 Obsidian 插件可识别的 markdown 容器格式保存。
        const content = buildObsidianExcalidrawMarkdown(sceneJson)
        await window.horaDB?.saveNoteContent({ noteId: currentNoteId, content })
      } else {
        // 源码模式保留用户原文；写作模式直接使用 Tiptap 官方 Markdown 序列化结果。
        const markdown = markdownViewMode === "source" || markdownViewMode === "preview"
          ? markdownSourceValueRef.current
          : composeMarkdownWithFrontmatter(frontmatterSourceRef.current, editorMarkdownBodyRef.current)
        await window.horaDB?.saveNoteContent({ noteId: currentNoteId, content: markdown })
      }
      hasUnsavedChangesRef.current = false
      setLastSavedAt(new Date().toLocaleString())
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败")
    }
  }, [markdownViewMode, noteFileKind])

  useEffect(() => {
    // 给文件加载 effect 提供最新保存函数，同时避免加载 effect 依赖 handleSave 后被编辑内容变化反复触发。
    handleSaveRef.current = handleSave
  }, [handleSave])

  // 共享自动保存入口：外部点击、文件树切换、标签切换都可以共用它。
  const requestAutoSave = useCallback(async () => {
    if (!hasUnsavedChangesRef.current) return
    if (saveInFlightRef.current) {
      await saveInFlightRef.current
      return
    }

    const currentPromise = handleSave().finally(() => {
      if (saveInFlightRef.current === currentPromise) {
        saveInFlightRef.current = null
      }
    })
    saveInFlightRef.current = currentPromise
    await currentPromise
  }, [handleSave])

  // Markdown 视图切换：在源码和写作模式之间同步内容，尽量接近 Typora 的双编辑心智。
  const handleMarkdownViewModeChange = useCallback((nextMode: MarkdownViewMode) => {
    if (nextMode === markdownViewMode) return

    if (nextMode === "source" || nextMode === "preview") {
      // 进入源码/预览前，把当前富文本内容转换为 Markdown，避免刚写的内容不可见。
      if (markdownViewMode === "rich") {
        setMarkdownSource(composeMarkdownWithFrontmatter(frontmatterSource, editorMarkdownBody))
      }
      setMarkdownViewMode(nextMode)
      return
    }

    // 回到写作模式前提取 Markdown 正文，并递增版本让 Tiptap 原生解析最新内容。
    const parsedMarkdown = splitMarkdownFrontmatter(markdownSource || "")
    setFrontmatterSource(parsedMarkdown.frontmatter)
    setInitialMarkdownBody(parsedMarkdown.body)
    setEditorMarkdownBody(parsedMarkdown.body)
    setMarkdownViewMode("rich")
    setRichEditorVersion((prev) => prev + 1)
  }, [editorMarkdownBody, frontmatterSource, markdownSource, markdownViewMode, setEditorMarkdownBody, setFrontmatterSource, setMarkdownSource])

  const handleToggleFocusMode = useCallback(() => {
    // 专注模式仅切换编辑版心，右侧大纲已从编辑器界面移除。
    setFocusMode((current) => !current)
  }, [])

  // 导出时复用保存路径的 Markdown 来源，确保写作/源码/预览三种模式导出的都是用户眼前内容。
  const getCurrentMarkdownForExport = useCallback(() => {
    if (markdownViewMode === "source" || markdownViewMode === "preview") {
      return markdownSource
    }

    return composeMarkdownWithFrontmatter(frontmatterSource, editorMarkdownBody)
  }, [editorMarkdownBody, frontmatterSource, markdownSource, markdownViewMode])

  // HTML 导出：复用预览渲染链路，并把 Mermaid 预先转成 SVG，尽量接近 Typora 的静态导出体验。
  const handleExportHtml = useCallback(async () => {
    try {
      setError(null)
      const parsedMarkdown = splitMarkdownFrontmatter(getCurrentMarkdownForExport())
      const previewHtml = renderMarkdownPreviewHtml(parsedMarkdown.body, previewMarkdownRenderer, t("editorTocTitle"))
      const bodyHtml = await renderMermaidInExportHtml(previewHtml)
      const html = buildMarkdownExportHtml({
        bodyHtml,
        frontmatter: parsedMarkdown.frontmatter,
        frontmatterHint: t("editorFrontmatterHidden"),
        frontmatterTitle: t("editorFrontmatter"),
        language,
        title,
      })

      downloadTextFile(getSafeExportFileName(title), html, "text/html;charset=utf-8")
    } catch (err) {
      setError(err instanceof Error ? err.message : t("editorExportFailed"))
    }
  }, [getCurrentMarkdownForExport, language, previewMarkdownRenderer, t, title])

  const previewMarkdown = useMemo(
    () => splitMarkdownFrontmatter(markdownSource || ""),
    [markdownSource],
  )

  const searchMatches = useMemo(
    () => getSearchMatches(markdownSource, searchQuery),
    [markdownSource, searchQuery],
  )

  useEffect(() => {
    // 查找词或文档变化后，确保当前匹配下标始终落在有效范围内。
    if (activeSearchIndex < searchMatches.length) return
    setActiveSearchIndex(Math.max(searchMatches.length - 1, 0))
  }, [activeSearchIndex, searchMatches.length])

  // 查找替换统一进入源码模式执行，确保操作对象是 Markdown 原文。
  const ensureSearchSourceMode = useCallback(() => {
    if (markdownViewMode === "rich") {
      setMarkdownSource(composeMarkdownWithFrontmatter(frontmatterSource, editorMarkdownBody))
    }
    if (markdownViewMode !== "source") {
      setMarkdownViewMode("source")
    }
    window.requestAnimationFrame(() => markdownSourceRef.current?.focus())
  }, [editorMarkdownBody, frontmatterSource, markdownViewMode, setMarkdownSource])

  const selectSearchMatch = useCallback((match: SearchMatch | undefined) => {
    const textarea = markdownSourceRef.current
    if (!textarea || !match) return

    textarea.focus()
    textarea.setSelectionRange(match.start, match.end)
    // 根据匹配位置估算行号，滚动到视线附近，保证定位反馈明确。
    const line = markdownSource.slice(0, match.start).split(/\r?\n/).length - 1
    textarea.scrollTop = Math.max(0, (line - 3) * 28)
  }, [markdownSource])

  const handleToggleSearch = useCallback(() => {
    const nextOpen = !searchOpen
    setSearchOpen(nextOpen)
    if (nextOpen) {
      ensureSearchSourceMode()
    }
  }, [ensureSearchSourceMode, searchOpen])

  const handleFindByOffset = useCallback((offset: number) => {
    ensureSearchSourceMode()
    if (searchMatches.length === 0) return

    const nextIndex = (activeSearchIndex + offset + searchMatches.length) % searchMatches.length
    setActiveSearchIndex(nextIndex)
    window.requestAnimationFrame(() => selectSearchMatch(searchMatches[nextIndex]))
  }, [activeSearchIndex, ensureSearchSourceMode, searchMatches, selectSearchMatch])

  const handleReplaceCurrent = useCallback(() => {
    ensureSearchSourceMode()
    const match = searchMatches[activeSearchIndex]
    if (!match) return

    const nextSource = `${markdownSource.slice(0, match.start)}${replaceText}${markdownSource.slice(match.end)}`
    setMarkdownSource(nextSource)
    markUnsavedChanges()
    window.requestAnimationFrame(() => {
      const nextMatches = getSearchMatches(nextSource, searchQuery)
      const nextIndex = Math.min(activeSearchIndex, Math.max(nextMatches.length - 1, 0))
      setActiveSearchIndex(nextIndex)
      selectSearchMatch(nextMatches[nextIndex])
    })
  }, [
    activeSearchIndex,
    ensureSearchSourceMode,
    markdownSource,
    markUnsavedChanges,
    replaceText,
    searchMatches,
    searchQuery,
    selectSearchMatch,
    setMarkdownSource,
  ])

  const handleReplaceAll = useCallback(() => {
    ensureSearchSourceMode()
    if (!searchQuery.trim()) return

    const matches = getSearchMatches(markdownSource, searchQuery)
    if (matches.length === 0) return

    let cursor = 0
    const chunks: string[] = []
    matches.forEach((match) => {
      chunks.push(markdownSource.slice(cursor, match.start), replaceText)
      cursor = match.end
    })
    chunks.push(markdownSource.slice(cursor))

    setMarkdownSource(chunks.join(""))
    setActiveSearchIndex(0)
    markUnsavedChanges()
  }, [ensureSearchSourceMode, markdownSource, markUnsavedChanges, replaceText, searchQuery, setMarkdownSource])

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
    setInitialMarkdownBody("")
    setEditorMarkdownBody("")
    setFrontmatterSource("")
    setMarkdownSource("")
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
    setInitialMarkdownBody("")
    setEditorMarkdownBody("")
    setFrontmatterSource("")
    setMarkdownSource("")
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
      setInitialMarkdownBody("")
      setEditorMarkdownBody("")
      setFrontmatterSource("")
      setMarkdownSource("")
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
      setInitialMarkdownBody("")
      setEditorMarkdownBody("")
      setFrontmatterSource("")
      setMarkdownSource("")
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

    setInitialMarkdownBody("")
    setEditorMarkdownBody("")
    setFrontmatterSource("")
    setMarkdownSource("")
    setTextPreview("")
    setTitle(nextActiveTab?.label || "未命名")
    setPathParts([])
  }

  return (
    <section
      aria-label={title}
      className={cn(
        "flex h-[calc(100vh-2rem)] flex-col",
        focusMode && "h-[calc(100vh-0.5rem)]",
      )}
    >
      {/* 第一行：左侧展开按钮 + 标签行（同一行）。 */}
      <header className={cn("mb-2 flex items-center gap-2 border-b border-border pb-2", focusMode && "hidden")}>
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

        {tabs.length > 0 && noteFileKind === "markdown" ? (
          <MarkdownActionsMenu
            focusMode={focusMode}
            markdownViewMode={markdownViewMode}
            onExportHtml={() => {
              void handleExportHtml()
            }}
            onMarkdownViewModeChange={handleMarkdownViewModeChange}
            onToggleFocusMode={handleToggleFocusMode}
            onToggleSearch={handleToggleSearch}
            onTypewriterModeChange={setTypewriterMode}
            searchOpen={searchOpen}
            typewriterMode={typewriterMode}
          />
        ) : null}
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
          <div className={cn("mb-1 flex justify-center text-center text-[10px] text-muted-foreground", focusMode && "hidden")}>
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
          <div
            ref={editorSurfaceRef}
            className={cn(
              "relative min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm",
              focusMode && "rounded-2xl border-transparent shadow-none",
            )}
          >
            {noteFileKind === "drawing" ? (
              <div className="hora-excalidraw-shell h-full min-h-0">
                {drawingReady ? (
                  <HoraExcalidraw
                    key={`${activeTabId}:${noteId ?? activeTab?.noteId ?? "blank"}:${drawingRenderVersion}`}
                    initialData={drawingInitialData}
                    langCode={excalidrawLanguageCode}
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
              <div className="relative flex h-full min-h-0 flex-col bg-card">
                {/* 专注模式会隐藏文件标签栏，因此保留一个浮动入口用于切换视图和退出专注。 */}
                {focusMode ? (
                  <MarkdownActionsMenu
                    className={cn("absolute top-1 z-20", markdownViewMode === "rich" ? "right-12" : "right-2")}
                    focusMode={focusMode}
                    markdownViewMode={markdownViewMode}
                    onExportHtml={() => {
                      void handleExportHtml()
                    }}
                    onMarkdownViewModeChange={handleMarkdownViewModeChange}
                    onToggleFocusMode={handleToggleFocusMode}
                    onToggleSearch={handleToggleSearch}
                    onTypewriterModeChange={setTypewriterMode}
                    searchOpen={searchOpen}
                    typewriterMode={typewriterMode}
                  />
                ) : null}

                {searchOpen ? (
                  <div className="flex flex-wrap items-center justify-end gap-1 border-b border-border bg-muted/10 px-2 py-1">
                    <input
                      value={searchQuery}
                      onChange={(event) => {
                        setSearchQuery(event.target.value)
                        setActiveSearchIndex(0)
                      }}
                      onFocus={ensureSearchSourceMode}
                      placeholder={t("editorSearchPlaceholder")}
                      className="h-7 w-40 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <input
                      value={replaceText}
                      onChange={(event) => setReplaceText(event.target.value)}
                      onFocus={ensureSearchSourceMode}
                      placeholder={t("editorReplacePlaceholder")}
                      className="h-7 w-40 rounded-lg border border-border bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <span className="min-w-16 text-center text-xs text-muted-foreground">
                      {searchMatches.length > 0 ? `${activeSearchIndex + 1}/${searchMatches.length}` : t("editorNoSearchResults")}
                    </span>
                    <Button type="button" size="sm" variant="ghost" onClick={() => handleFindByOffset(-1)} disabled={searchMatches.length === 0}>
                      {t("editorFindPrevious")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => handleFindByOffset(1)} disabled={searchMatches.length === 0}>
                      {t("editorFindNext")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={handleReplaceCurrent} disabled={searchMatches.length === 0}>
                      {t("editorReplace")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={handleReplaceAll} disabled={searchMatches.length === 0}>
                      {t("editorReplaceAll")}
                    </Button>
                  </div>
                ) : null}

                <div className="flex min-h-0 flex-1">
                  <div className={cn("min-w-0 flex-1 overflow-hidden", focusMode && "bg-card")}>
                    {markdownViewMode === "source" ? (
                      // 源码模式直接编辑 Markdown 原文，保存时不经过 HTML 转换，避免复杂语法丢失。
                      <textarea
                        ref={markdownSourceRef}
                        value={markdownSource}
                        onChange={(event) => {
                          const textarea = event.currentTarget
                          setMarkdownSource(event.target.value)
                          markUnsavedChanges()
                          if (typewriterMode) {
                            // 源码模式下实时保持当前编辑行在视线中部。
                            window.requestAnimationFrame(() => scrollTextareaCursorToCenter(textarea))
                          }
                        }}
                        onKeyDown={(event) => {
                          const textarea = event.currentTarget
                          const isCommand = event.metaKey || event.ctrlKey
                          if (isCommand && event.key.toLowerCase() === "s") {
                            event.preventDefault()
                            void handleSave()
                          }
                          if (typewriterMode) {
                            // 键盘移动光标时也同步居中，例如上下方向键。
                            window.requestAnimationFrame(() => scrollTextareaCursorToCenter(textarea))
                          }
                        }}
                        spellCheck={false}
                        placeholder={t("editorSourcePlaceholder")}
                        className={cn(
                          "h-full w-full resize-none overflow-auto border-0 bg-card px-6 py-5 font-mono text-sm leading-7 text-foreground outline-none selection:bg-primary/15",
                          focusMode && "mx-auto block max-w-4xl px-12",
                        )}
                      />
                    ) : markdownViewMode === "preview" ? (
                      // 预览模式渲染 Typora 常见扩展：数学公式、Mermaid 图表和脚注。
                      <MarkdownPreview
                        focusMode={focusMode}
                        frontmatter={previewMarkdown.frontmatter}
                        html={renderMarkdownPreviewHtml(previewMarkdown.body, previewMarkdownRenderer, t("editorTocTitle"))}
                      />
                    ) : (
                      <SimpleEditor
                        // 使用标签、文件与源码同步版本作为 key，切换标签或源码回写时强制显示对应内容。
                        key={`${activeTabId}:${activeTab?.noteId ?? "blank"}:${richEditorVersion}`}
                        contentKey={`${activeTabId}:${noteId ?? activeTab?.noteId ?? "blank"}:${richEditorVersion}`}
                        initialMarkdown={initialMarkdownBody}
                        typewriterMode={typewriterMode}
                        focusMode={focusMode}
                        onMarkdownChange={(markdown) => {
                          setEditorMarkdownBody(markdown)
                          markUnsavedChanges()
                        }}
                        onSave={() => {
                          void handleSave()
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {lastSavedAt && !focusMode ? (
            <p className="mt-1 text-[10px] text-muted-foreground">上次保存：{lastSavedAt}</p>
          ) : null}
        </>
      )}
    </section>
  )
}
