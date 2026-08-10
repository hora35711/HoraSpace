"use client"

import type { Editor } from "@tiptap/react"
import { useCurrentEditor, useEditorState } from "@tiptap/react"
import { useEffect, useState } from "react"

function getActivePageEditor(editor: Editor): Editor | null {
  const storage = editor.storage as unknown as Record<string, unknown>
  const pages = storage.pages as { activeEditor?: Editor | null } | undefined
  if (!pages || !("activeEditor" in pages)) return null
  return pages.activeEditor ?? null
}

export function useTiptapEditor(providedEditor?: Editor | null): {
  editor: Editor | null
  editorState?: Editor["state"]
  canCommand?: Editor["can"]
} {
  const { editor: coreEditor } = useCurrentEditor()
  const mainEditor = providedEditor ?? coreEditor

  const [storageEditor, setStorageEditor] = useState<Editor | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!mainEditor) {
      // 编辑器卸载后异步清空派生实例，避免 effect 内同步更新造成级联渲染。
      queueMicrotask(() => {
        if (!cancelled) setStorageEditor(null)
      })
      return () => {
        cancelled = true
      }
    }

    const updateHandler = () => {
      if (!cancelled) setStorageEditor(getActivePageEditor(mainEditor))
    }

    // 首次派生值放入微任务，事件订阅仍保持同步响应。
    queueMicrotask(updateHandler)

    mainEditor.on("update", updateHandler)
    mainEditor.on("selectionUpdate", updateHandler)

    return () => {
      cancelled = true
      mainEditor.off("update", updateHandler)
      mainEditor.off("selectionUpdate", updateHandler)
    }
  }, [mainEditor])

  useEffect(() => {
    if (!storageEditor) return

    const handleDestroy = () => setStorageEditor(null)

    storageEditor.on("destroy", handleDestroy)
    return () => {
      storageEditor.off("destroy", handleDestroy)
    }
  }, [storageEditor])

  const editorState = useEditorState({
    editor: storageEditor ?? mainEditor,
    selector(context) {
      if (!context.editor) {
        return { editor: null, editorState: undefined, canCommand: undefined }
      }

      return {
        editor: context.editor,
        editorState: context.editor.state,
        canCommand: context.editor.can,
      }
    },
  })

  return editorState ?? { editor: null }
}
