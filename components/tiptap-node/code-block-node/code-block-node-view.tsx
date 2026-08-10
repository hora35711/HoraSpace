"use client"

// 代码块节点视图：普通代码保留高亮编辑，Mermaid 代码在写作模式中实时渲染为 SVG。

import { useEffect, useState } from "react"
import type { NodeViewProps } from "@tiptap/core"
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react"
import { Code2Icon, RefreshCwIcon } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useT } from "@/lib/app-language"
import { cn } from "@/lib/utils"

type MermaidTheme = "default" | "dark"

type MermaidRenderState = {
  error: string
  key: string
  svg: string
}

// Mermaid 使用全局配置；串行渲染可避免多个图表同时更新时互相覆盖主题和临时 DOM。
let mermaidRenderQueue: Promise<void> = Promise.resolve()
let mermaidRenderSequence = 0
const mermaidRenderCache = new Map<string, string>()
const MERMAID_RENDER_CACHE_LIMIT = 40

// 语言选项覆盖 Hora 常见技术栈，并与 Lowlight 已注册的语言名称保持一致。
const CODE_BLOCK_LANGUAGE_OPTIONS = [
  { label: "Auto", value: "auto" },
  { label: "JavaScript", value: "javascript" },
  { label: "TypeScript", value: "typescript" },
  { label: "HTML", value: "html" },
  { label: "CSS", value: "css" },
  { label: "JSON", value: "json" },
  { label: "Markdown", value: "markdown" },
  { label: "Mermaid", value: "mermaid" },
  { label: "C", value: "c" },
  { label: "C++", value: "cpp" },
  { label: "C#", value: "csharp" },
  { label: "Java", value: "java" },
  { label: "Kotlin", value: "kotlin" },
  { label: "Swift", value: "swift" },
  { label: "Go", value: "go" },
  { label: "Rust", value: "rust" },
  { label: "Python", value: "python" },
  { label: "Ruby", value: "ruby" },
  { label: "PHP", value: "php" },
  { label: "Shell", value: "bash" },
  { label: "SQL", value: "sql" },
  { label: "GraphQL", value: "graphql" },
  { label: "YAML", value: "yaml" },
  { label: "XML", value: "xml" },
]

type CodeLanguageSelectProps = {
  language: string
  onLanguageChange: (language: string | null) => void
}

// 语言选择器嵌在代码块自身，输入围栏语言后会立即显示，也允许随时手动覆盖。
function CodeLanguageSelect({ language, onLanguageChange }: CodeLanguageSelectProps) {
  const t = useT()

  return (
    <Select
      value={language || "auto"}
      onValueChange={(nextLanguage) => onLanguageChange(nextLanguage === "auto" ? null : nextLanguage)}
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-auto min-w-28 border-transparent bg-transparent px-2 font-mono text-[11px] shadow-none hover:bg-muted focus-visible:border-ring"
        aria-label={t("editorCodeLanguage")}
      >
        <SelectValue placeholder={t("editorCodeAuto")} />
      </SelectTrigger>
      <SelectContent align="start">
        <SelectGroup>
          {CODE_BLOCK_LANGUAGE_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.value === "auto" ? t("editorCodeAuto") : option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

// 缓存最近渲染结果，切换文件或写作/预览模式时不重复解析相同图表。
function rememberMermaidSvg(cacheKey: string, svg: string) {
  if (mermaidRenderCache.size >= MERMAID_RENDER_CACHE_LIMIT) {
    const oldestKey = mermaidRenderCache.keys().next().value
    if (oldestKey) mermaidRenderCache.delete(oldestKey)
  }
  mermaidRenderCache.set(cacheKey, svg)
}

// Mermaid 的 initialize/render 依赖共享模块状态，因此每次任务都在队列内配置对应主题。
function enqueueMermaidRender(source: string, theme: MermaidTheme) {
  const cacheKey = `${theme}\u0000${source}`
  const cachedSvg = mermaidRenderCache.get(cacheKey)
  if (cachedSvg) return Promise.resolve(cachedSvg)

  const renderTask = mermaidRenderQueue
    .catch(() => undefined)
    .then(async () => {
      const mermaid = (await import("mermaid")).default
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme,
      })
      mermaidRenderSequence += 1
      const renderId = `hora-rich-mermaid-${mermaidRenderSequence}`
      const rendered = await mermaid.render(renderId, source)
      rememberMermaidSvg(cacheKey, rendered.svg)
      return rendered.svg
    })
  // 无论当前任务成功还是失败，队列都恢复为可继续执行的 void Promise。
  mermaidRenderQueue = renderTask.then(() => undefined, () => undefined)

  return renderTask
}

// 普通代码块使用标准 contentDOM，高亮由 Lowlight 负责，顶部只承载当前语言信息。
function StandardCodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = String(node.attrs.language || "").toLowerCase()

  return (
    <NodeViewWrapper className="hora-code-block-node" data-language={language || "auto"}>
      <div className="hora-code-block-toolbar" contentEditable={false}>
        <CodeLanguageSelect
          language={language}
          onLanguageChange={(nextLanguage) => {
            // 只改 codeBlock 的 language 属性，代码正文和当前光标位置保持不变。
            updateAttributes({ language: nextLanguage })
          }}
        />
      </div>
      <pre>
        <NodeViewContent<"code"> as="code" spellCheck={false} />
      </pre>
    </NodeViewWrapper>
  )
}

// Mermaid 节点在失焦时只显示图形，点击图形后把光标放回源码，贴近 Typora 的编辑方式。
function MermaidCodeBlockView({ editor, getPos, node, selected, updateAttributes }: NodeViewProps) {
  const t = useT()
  const { resolvedTheme } = useTheme()
  const source = node.textContent
  const mermaidTheme: MermaidTheme = resolvedTheme === "dark" ? "dark" : "default"
  const renderKey = `${mermaidTheme}\u0000${source}`
  const [renderState, setRenderState] = useState<MermaidRenderState>({ error: "", key: "", svg: "" })
  // 当前状态的 key 与源码不一致时表示新图仍在排队，旧 SVG 不继续冒充最新结果。
  const isCurrentRender = renderState.key === renderKey
  const svg = isCurrentRender ? renderState.svg : ""
  const renderError = isCurrentRender ? renderState.error : ""
  const isRendering = Boolean(source.trim()) && !isCurrentRender

  useEffect(() => {
    let cancelled = false
    if (!source.trim()) {
      // 空 Mermaid 块保持源码可编辑，不尝试调用解析器。
      return
    }

    // 输入停止后再解析，避免每个按键都触发一次较重的 Mermaid 布局计算。
    const timerId = window.setTimeout(() => {
      void enqueueMermaidRender(source, mermaidTheme)
        .then((nextSvg) => {
          if (cancelled) return
          setRenderState({ error: "", key: renderKey, svg: nextSvg })
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setRenderState({
            error: error instanceof Error ? error.message : t("editorMermaidError"),
            key: renderKey,
            svg: "",
          })
        })
    }, 180)

    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [mermaidTheme, renderKey, source, t])

  const focusSource = () => {
    const position = getPos()
    if (typeof position !== "number") return
    // codeBlock 的文本内容从节点位置 + 1 开始，点击预览即可单次进入源码编辑。
    editor.chain().focus().setTextSelection(position + 1).run()
  }

  const showSource = selected || Boolean(renderError) || !source.trim()

  return (
    <NodeViewWrapper
      className={cn("hora-mermaid-node", selected && "hora-mermaid-node-selected")}
      data-language="mermaid"
    >
      <div className="hora-mermaid-toolbar" contentEditable={false}>
        <CodeLanguageSelect
          language="mermaid"
          onLanguageChange={(nextLanguage) => {
            // 切出 Mermaid 后节点会自动回到普通代码块视图，源码内容不会被重建。
            updateAttributes({ language: nextLanguage })
          }}
        />
        <Button type="button" size="xs" variant="ghost" onClick={focusSource}>
          <Code2Icon data-icon="inline-start" />
          {showSource ? t("editorMermaidEditing") : t("editorMermaidEdit")}
        </Button>
      </div>

      <button
        type="button"
        className="hora-mermaid-preview"
        aria-label={t("editorMermaidEdit")}
        contentEditable={false}
        onClick={focusSource}
      >
        {isRendering ? (
          <span className="hora-mermaid-status">
            <RefreshCwIcon aria-hidden="true" />
            {t("editorMermaidRendering")}
          </span>
        ) : renderError ? (
          <span className="hora-mermaid-error" role="alert">
            <strong>{t("editorMermaidError")}</strong>
            <span>{renderError}</span>
          </span>
        ) : svg ? (
          // Mermaid strict 模式生成受约束的 SVG；这里插入结果以保留缩放清晰度和图内样式。
          <span className="hora-mermaid-svg" dangerouslySetInnerHTML={{ __html: svg }} />
        ) : (
          <span className="hora-mermaid-status">{t("editorMermaidEmpty")}</span>
        )}
      </button>

      <pre className={cn("hora-mermaid-source", !showSource && "hora-mermaid-source-hidden")}>
        <NodeViewContent<"code"> as="code" spellCheck={false} />
      </pre>
    </NodeViewWrapper>
  )
}

// 节点视图入口根据 language 属性切换展示，但底层仍是同一个 codeBlock schema。
export function CodeBlockNodeView(props: NodeViewProps) {
  const language = String(props.node.attrs.language || "").toLowerCase()
  return language === "mermaid" ? <MermaidCodeBlockView {...props} /> : <StandardCodeBlockView {...props} />
}
