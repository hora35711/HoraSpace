"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FolderUp } from "lucide-react"
import { useT } from "@/lib/app-language"

type SpaceDialogMode = "create" | "migrate"

type SpaceDialogProps = {
  open: boolean
  mode: SpaceDialogMode
  title: string
  description: string
  submitLabel: string
  defaultName?: string
  defaultPath?: string
  lockName?: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (input: { name: string; rootPath: string }) => Promise<void> | void
}

// 通用空间弹窗：创建空间和迁移当前空间路径共用一套表单，避免重复和样式分叉。
export function SpaceDialog({
  open,
  mode,
  title,
  description,
  submitLabel,
  defaultName = "",
  defaultPath = "",
  lockName = false,
  onOpenChange,
  onSubmit,
}: SpaceDialogProps) {
  const t = useT()
  const [name, setName] = React.useState(defaultName)
  const [rootPath, setRootPath] = React.useState(defaultPath)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")

  React.useEffect(() => {
    if (!open) return
    setName(defaultName)
    setRootPath(defaultPath)
    setError("")
    setSaving(false)
  }, [open, defaultName, defaultPath])

  async function handlePickFolder() {
    const result = await window.horaDB?.pickSpaceDirectory?.({
      defaultPath: rootPath || defaultPath,
    })

    if (!result || result.canceled || !result.filePath) return
    setRootPath(result.filePath)
  }

  async function handleSubmit() {
    const trimmedName = name.trim()
    const trimmedRootPath = rootPath.trim()

    if (!lockName && !trimmedName) {
      setError(`${t("spaceName")} 不能为空`)
      return
    }
    if (!trimmedRootPath) {
      setError(`${t("spacePath")} 不能为空`)
      return
    }

    setSaving(true)
    setError("")
    try {
      await onSubmit({
        name: lockName ? trimmedName || defaultName : trimmedName,
        rootPath: trimmedRootPath,
      })
      onOpenChange(false)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-2">
            <Label htmlFor="space-name">空间名称</Label>
            <Input
              id="space-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("spaceName")}
              disabled={lockName}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="space-root">{t("spacePath")}</Label>
            <div className="flex gap-2">
              <Input
                id="space-root"
                value={rootPath}
                onChange={(event) => setRootPath(event.target.value)}
                placeholder={t("selectSpaceDirectory")}
              />
              <Button type="button" variant="outline" onClick={() => void handlePickFolder()}>
                <FolderUp className="mr-2 size-4" />
                {t("choose")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === "create"
                ? t("selectSpaceDirectoryDescription")
                : "选择新的文件夹后只会移动 hora.db、vault 和 plugins，并更新数据库路径。"}
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {t("cancel")}
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={saving}>
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
