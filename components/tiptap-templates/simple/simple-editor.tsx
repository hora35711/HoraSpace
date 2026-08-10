"use client"

// SimpleEditor：基于 Tiptap 官方 simple template，支持外部内容接入与保存回调。

import { useCallback, useEffect, useRef, useState } from "react"
import {
  EditorContent,
  EditorContext,
  ReactNodeViewRenderer,
  useCurrentEditor,
  useEditor,
} from "@tiptap/react"
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight"
import { Mathematics } from "@tiptap/extension-mathematics"
import { Markdown } from "@tiptap/markdown"

// --- Tiptap Core Extensions ---
import { StarterKit } from "@tiptap/starter-kit"
import { Image } from "@tiptap/extension-image"
import { TaskItem, TaskList } from "@tiptap/extension-list"
import { TextAlign } from "@tiptap/extension-text-align"
import { Typography } from "@tiptap/extension-typography"
import { Highlight } from "@tiptap/extension-highlight"
import { Subscript } from "@tiptap/extension-subscript"
import { Superscript } from "@tiptap/extension-superscript"
import { Table } from "@tiptap/extension-table"
import { TableCell } from "@tiptap/extension-table-cell"
import { TableHeader } from "@tiptap/extension-table-header"
import { TableRow } from "@tiptap/extension-table-row"
import { CharacterCount, Placeholder, Selection } from "@tiptap/extensions"
import { common, createLowlight } from "lowlight"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Spacer } from "@/components/tiptap-ui-primitive/spacer"
import {
  Toolbar,
  ToolbarGroup,
  ToolbarSeparator,
} from "@/components/tiptap-ui-primitive/toolbar"

// --- Tiptap Node ---
import { ImageUploadNode } from "@/components/tiptap-node/image-upload-node/image-upload-node-extension"
import { HorizontalRule } from "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node-extension"
import { CodeBlockNodeView } from "@/components/tiptap-node/code-block-node/code-block-node-view"
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss"
import "@/components/tiptap-node/code-block-node/code-block-node.scss"
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss"
import "@/components/tiptap-node/list-node/list-node.scss"
import "@/components/tiptap-node/image-node/image-node.scss"
import "@/components/tiptap-node/heading-node/heading-node.scss"
import "@/components/tiptap-node/paragraph-node/paragraph-node.scss"

// --- Tiptap UI ---
import { HeadingDropdownMenu } from "@/components/tiptap-ui/heading-dropdown-menu"
import { ImageUploadButton } from "@/components/tiptap-ui/image-upload-button"
import { ListDropdownMenu } from "@/components/tiptap-ui/list-dropdown-menu"
import { BlockquoteButton } from "@/components/tiptap-ui/blockquote-button"
import { CodeBlockButton } from "@/components/tiptap-ui/code-block-button"
import {
  ColorHighlightPopover,
  ColorHighlightPopoverContent,
  ColorHighlightPopoverButton,
} from "@/components/tiptap-ui/color-highlight-popover"
import {
  LinkPopover,
  LinkContent,
  LinkButton,
} from "@/components/tiptap-ui/link-popover"
import { MarkButton } from "@/components/tiptap-ui/mark-button"
import { TextAlignButton } from "@/components/tiptap-ui/text-align-button"
import { UndoRedoButton } from "@/components/tiptap-ui/undo-redo-button"

// --- Icons ---
import { ArrowLeftIcon } from "@/components/tiptap-icons/arrow-left-icon"
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"
import { LinkIcon } from "@/components/tiptap-icons/link-icon"
import { ListIcon } from "@/components/tiptap-icons/list-icon"
import { TrashIcon } from "@/components/tiptap-icons/trash-icon"

// --- Hooks ---
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"
import { useWindowSize } from "@/hooks/use-window-size"
import { useCursorVisibility } from "@/hooks/use-cursor-visibility"

// --- Components ---
import { ThemeToggle } from "@/components/tiptap-templates/simple/theme-toggle"

// --- Lib ---
import { handleImageUpload, MAX_FILE_SIZE } from "@/lib/tiptap-utils"
import { useT } from "@/lib/app-language"
import { cn } from "@/lib/utils"
import { Button as UiButton } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

// --- Styles ---
import "@/components/tiptap-templates/simple/simple-editor.scss"
import "katex/dist/katex.min.css"

// SimpleEditor 入参：支持外部注入内容、监听变化、触发保存。
type SimpleEditorProps = {
  contentKey?: string
  initialMarkdown?: string
  onMarkdownChange?: (markdown: string) => void
  onSave?: () => void
  typewriterMode?: boolean
  focusMode?: boolean
}

type EditorStats = {
  characters: number
  words: number
}

type MathEditorTarget = {
  latex: string
  pos: number
  type: "inline" | "block"
}

const lowlight = createLowlight(common)

// 扩展 Lowlight 代码块：普通代码继续高亮，Mermaid 使用 React 节点视图渲染图形。
const HoraCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView, {
      // 光标进入代码内容时同步 selected，Mermaid 才展开其源码编辑区。
      selectedOnTextSelection: true,
    })
  },
})

// 统计信息集中读取，后续如果加阅读时间也只需要改这里。
function getEditorStats(editor: ReturnType<typeof useEditor>): EditorStats {
  return {
    characters: editor?.storage.characterCount.characters() ?? 0,
    words: editor?.storage.characterCount.words() ?? 0,
  }
}

// Tiptap 暂未内建脚注节点，会把普通文本中的 [^id] 转义；仅在代码围栏外恢复其 Markdown 语义。
function normalizeSerializedMarkdown(markdown: string) {
  let activeFence: "```" | "~~~" | null = null

  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const fenceMatch = /^\s*(```|~~~)/.exec(line)
      if (fenceMatch) {
        const fence = fenceMatch[1] as "```" | "~~~"
        activeFence = activeFence === fence ? null : activeFence ?? fence
        return line
      }
      if (activeFence) return line

      return line.replace(/\\\[\^([^\]\r\n]+)\\\]/g, "[^$1]")
    })
    .join("\n")
}

// 打字机模式：把当前光标滚动到编辑器中线附近，减少长文档写作时的视线跳动。
function scrollEditorCursorToCenter(editor: ReturnType<typeof useEditor> | null) {
  if (!editor) return

  const { from } = editor.state.selection
  const cursorCoords = editor.view.coordsAtPos(from)
  const editorScroller = editor.view.dom.closest(".simple-editor-wrapper")
  if (!(editorScroller instanceof HTMLElement)) return

  const scrollerRect = editorScroller.getBoundingClientRect()
  const targetTop = cursorCoords.top - scrollerRect.top + editorScroller.scrollTop - scrollerRect.height / 2
  editorScroller.scrollTo({
    top: Math.max(0, targetTop),
    behavior: "smooth",
  })
}

const TableToolbarContent = () => {
  const { editor } = useCurrentEditor()
  const t = useT()
  const isInTable = Boolean(editor?.isActive("table"))

  return (
    <ToolbarGroup>
      <Button
        tooltip={t("editorInsertTable")}
        onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
      >
        {/* 表格入口仅显示图标，按钮名称由 tooltip 提供。 */}
        <ListIcon className="tiptap-button-icon" />
      </Button>
      <Button
        tooltip={t("editorAddRow")}
        disabled={!isInTable}
        onClick={() => editor?.chain().focus().addRowAfter().run()}
      >
        <span className="tiptap-button-text">{t("editorRow")}</span>
      </Button>
      <Button
        tooltip={t("editorAddColumn")}
        disabled={!isInTable}
        onClick={() => editor?.chain().focus().addColumnAfter().run()}
      >
        <span className="tiptap-button-text">{t("editorColumn")}</span>
      </Button>
      <Button
        tooltip={t("editorDeleteTable")}
        disabled={!isInTable}
        onClick={() => editor?.chain().focus().deleteTable().run()}
      >
        <TrashIcon className="tiptap-button-icon" />
      </Button>
    </ToolbarGroup>
  )
}

// 数学工具栏直接插入官方 Mathematics 节点，节点会按 Markdown 的 $...$ / $$...$$ 往返保存。
const MathToolbarContent = () => {
  const { editor } = useCurrentEditor()
  const t = useT()

  return (
    <ToolbarGroup>
      <Button
        tooltip={t("editorInsertInlineMath")}
        onClick={() => editor?.chain().focus().insertInlineMath({ latex: "x" }).run()}
      >
        <span className="tiptap-button-text">∑</span>
      </Button>
      <Button
        tooltip={t("editorInsertBlockMath")}
        onClick={() => editor?.chain().focus().insertBlockMath({ latex: "x^2" }).run()}
      >
        <span className="tiptap-button-text">∫</span>
      </Button>
    </ToolbarGroup>
  )
}

const MainToolbarContent = ({
  onHighlighterClick,
  onLinkClick,
  isMobile,
}: {
  onHighlighterClick: () => void
  onLinkClick: () => void
  isMobile: boolean
}) => {
  return (
    <>
      <Spacer />

      <ToolbarGroup>
        <UndoRedoButton action="undo" />
        <UndoRedoButton action="redo" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <HeadingDropdownMenu modal={false} levels={[1, 2, 3, 4]} />
        <ListDropdownMenu
          modal={false}
          types={["bulletList", "orderedList", "taskList"]}
        />
        <BlockquoteButton />
        <CodeBlockButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="bold" />
        <MarkButton type="italic" />
        <MarkButton type="strike" />
        <MarkButton type="code" />
        <MarkButton type="underline" />
        {!isMobile ? (
          <ColorHighlightPopover />
        ) : (
          <ColorHighlightPopoverButton onClick={onHighlighterClick} />
        )}
        {!isMobile ? <LinkPopover /> : <LinkButton onClick={onLinkClick} />}
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <MarkButton type="superscript" />
        <MarkButton type="subscript" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <TextAlignButton align="left" />
        <TextAlignButton align="center" />
        <TextAlignButton align="right" />
        <TextAlignButton align="justify" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <MathToolbarContent />

      <ToolbarSeparator />

      <ToolbarGroup>
        {/* 图片按钮仅保留图标，完整名称继续通过 tooltip 和 aria-label 提供。 */}
        <ImageUploadButton />
      </ToolbarGroup>

      <ToolbarSeparator />

      <TableToolbarContent />

      <Spacer />

      {isMobile && <ToolbarSeparator />}

      <ToolbarGroup>
        <ThemeToggle />
      </ToolbarGroup>
    </>
  )
}

const MobileToolbarContent = ({
  type,
  onBack,
}: {
  type: "highlighter" | "link"
  onBack: () => void
}) => (
  <>
    <ToolbarGroup>
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeftIcon className="tiptap-button-icon" />
        {type === "highlighter" ? (
          <HighlighterIcon className="tiptap-button-icon" />
        ) : (
          <LinkIcon className="tiptap-button-icon" />
        )}
      </Button>
    </ToolbarGroup>

    <ToolbarSeparator />

    {type === "highlighter" ? (
      <ColorHighlightPopoverContent />
    ) : (
      <LinkContent />
    )}
  </>
)

export function SimpleEditor({
  contentKey,
  initialMarkdown,
  onMarkdownChange,
  onSave,
  typewriterMode = false,
  focusMode = false,
}: SimpleEditorProps) {
  const isMobile = useIsBreakpoint()
  const t = useT()
  const { height } = useWindowSize()
  const [mobileView, setMobileView] = useState<"main" | "highlighter" | "link">(
    "main"
  )
  const [editorStats, setEditorStats] = useState<EditorStats>({ characters: 0, words: 0 })
  const [mathEditorTarget, setMathEditorTarget] = useState<MathEditorTarget | null>(null)
  const [mathDraft, setMathDraft] = useState("")
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const typewriterModeRef = useRef(typewriterMode)
  // useEditor 已使用首次内容创建文档，先记录它可避免挂载 effect 再 setContent 并触发 React flushSync 警告。
  const lastAppliedContentRef = useRef<{ key?: string; content?: string }>({
    key: contentKey,
    content: initialMarkdown,
  })

  const setToolbarNode = useCallback((node: HTMLDivElement | null) => {
    // 工具栏高度只在挂载后读取，避免渲染阶段直接访问 ref 影响 React Compiler。
    toolbarRef.current = node
    setToolbarHeight(node?.getBoundingClientRect().height ?? 0)
  }, [])

  const editor = useEditor({
    immediatelyRender: false,
    editorProps: {
      attributes: {
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        "aria-label": t("editorAriaLabel"),
        class: "simple-editor",
      },
      handleKeyDown: (_view, event) => {
        // 保留保存快捷键：Cmd/Ctrl + S。
        const isCommand = event.metaKey || event.ctrlKey
        if (isCommand && event.key.toLowerCase() === "s") {
          event.preventDefault()
          onSave?.()
          return true
        }
        if (typewriterModeRef.current) {
          // 等 Tiptap 完成当前按键事务后再滚动，保证使用最新光标坐标。
          window.requestAnimationFrame(() => scrollEditorCursorToCenter(editor))
        }
        return false
      },
    },
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      HoraCodeBlock.configure({
        // lowlight 负责根据 codeBlock 的 language 属性生成 hljs-* 标记，样式由 SCSS 统一接管。
        lowlight,
      }),
      Markdown.configure({
        // GFM 让任务列表、表格、删除线和围栏代码块直接通过 Tiptap JSON 往返。
        markedOptions: { gfm: true, breaks: true },
      }),
      Mathematics.configure({
        katexOptions: {
          throwOnError: false,
          strict: "ignore",
        },
        inlineOptions: {
          onClick: (node, pos) => {
            // 点击公式打开统一编辑弹窗，不使用浏览器 prompt，保持应用交互一致。
            const latex = String(node.attrs.latex || "")
            setMathDraft(latex)
            setMathEditorTarget({ latex, pos, type: "inline" })
          },
        },
        blockOptions: {
          onClick: (node, pos) => {
            // 块公式与行内公式共用同一编辑器，只在应用命令时区分节点类型。
            const latex = String(node.attrs.latex || "")
            setMathDraft(latex)
            setMathEditorTarget({ latex, pos, type: "block" })
          },
        },
      }),
      HorizontalRule,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: true }),
      Image,
      Typography,
      Superscript,
      Subscript,
      Selection,
      Placeholder.configure({
        // 只在整篇文档为空且位于第一段时提示，按回车进入后续空行不再重复显示。
        placeholder: ({ editor: currentEditor, pos }) => (
          currentEditor.isEmpty && pos === 0 ? t("editorPlaceholder") : ""
        ),
      }),
      CharacterCount,
      Table.configure({
        resizable: true,
        allowTableNodeSelection: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      ImageUploadNode.configure({
        accept: "image/*",
        maxSize: MAX_FILE_SIZE,
        limit: 3,
        upload: handleImageUpload,
        onError: (error) => console.error("Upload failed:", error),
      }),
    ],
    // 原生 Markdown 管线直接解析文件正文，避免 HTML/Turndown 往返破坏扩展语法。
    content: initialMarkdown ?? "",
    contentType: "markdown",
    onCreate: ({ editor: nextEditor }) => {
      // 初始化时同步一次统计，避免刚打开文件底部显示 0。
      setEditorStats(getEditorStats(nextEditor))
    },
    onUpdate: ({ editor: nextEditor }) => {
      // 原生序列化为 Markdown，页面保存时不再依赖 HTML -> Markdown 二次转换。
      onMarkdownChange?.(normalizeSerializedMarkdown(nextEditor.getMarkdown()))
      setEditorStats(getEditorStats(nextEditor))
    },
  })

  useEffect(() => {
    // Tiptap editorProps 不随 React props 自动重建，用 ref 持有最新打字机状态。
    typewriterModeRef.current = typewriterMode
  }, [typewriterMode])

  // 当外部切换笔记时，同步更新编辑器内容。
  useEffect(() => {
    if (!editor) return
    if (typeof initialMarkdown !== "string") return
    if (
      lastAppliedContentRef.current.key === contentKey &&
      lastAppliedContentRef.current.content === initialMarkdown
    ) {
      return
    }

    // 把外部内容同步安排到下一帧，避免 React effect 生命周期内创建 NodeView 时触发 flushSync 警告。
    const frameId = window.requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      // contentKey 让同内容的不同文件也能强制刷新到编辑器。
      editor.commands.setContent(initialMarkdown, { contentType: "markdown", emitUpdate: false })
      setEditorStats(getEditorStats(editor))
      lastAppliedContentRef.current = { key: contentKey, content: initialMarkdown }
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [contentKey, editor, initialMarkdown])

  const handleApplyMath = useCallback(() => {
    if (!editor || !mathEditorTarget || !mathDraft.trim()) return
    const chain = editor.chain().setNodeSelection(mathEditorTarget.pos)
    if (mathEditorTarget.type === "inline") {
      chain.updateInlineMath({ latex: mathDraft.trim() }).focus().run()
    } else {
      chain.updateBlockMath({ latex: mathDraft.trim() }).focus().run()
    }
    setMathEditorTarget(null)
  }, [editor, mathDraft, mathEditorTarget])

  const rect = useCursorVisibility({
    editor,
    overlayHeight: toolbarHeight,
  })

  // 桌面端始终展示完整工具栏，移动端才进入高亮/链接的二级工具栏。
  const activeMobileView = isMobile ? mobileView : "main"

  return (
    <div className={cn("simple-editor-wrapper", focusMode && "simple-editor-focus-mode")}>
      <EditorContext.Provider value={{ editor }}>
        <Toolbar
          ref={setToolbarNode}
          style={{
            ...(isMobile
              ? {
                  bottom: `calc(100% - ${height - rect.y}px)`,
                }
              : {}),
          }}
        >
          {activeMobileView === "main" ? (
            <MainToolbarContent
              onHighlighterClick={() => setMobileView("highlighter")}
              onLinkClick={() => setMobileView("link")}
              isMobile={isMobile}
            />
          ) : (
            <MobileToolbarContent
              type={activeMobileView === "highlighter" ? "highlighter" : "link"}
              onBack={() => setMobileView("main")}
            />
          )}
        </Toolbar>

        <EditorContent
          editor={editor}
          role="presentation"
          className="simple-editor-content"
        />
        <div className="simple-editor-status" aria-label={t("editorStatsLabel")}>
          <span>{editorStats.words} {t("editorWords")}</span>
          <span>{editorStats.characters} {t("editorCharacters")}</span>
        </div>

        <Dialog
          open={Boolean(mathEditorTarget)}
          onOpenChange={(open) => {
            if (!open) setMathEditorTarget(null)
          }}
        >
          <DialogContent className="sm:max-w-xl">
            <DialogHeader>
              <DialogTitle>{t("editorMathDialogTitle")}</DialogTitle>
              <DialogDescription>{t("editorMathDialogDescription")}</DialogDescription>
            </DialogHeader>
            <Textarea
              value={mathDraft}
              onChange={(event) => setMathDraft(event.target.value)}
              className="min-h-28 font-mono"
              aria-label={t("editorMathLatex")}
              spellCheck={false}
            />
            <DialogFooter>
              <UiButton type="button" variant="outline" onClick={() => setMathEditorTarget(null)}>
                {t("cancel")}
              </UiButton>
              <UiButton type="button" onClick={handleApplyMath} disabled={!mathDraft.trim()}>
                {t("save")}
              </UiButton>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </EditorContext.Provider>
    </div>
  )
}
