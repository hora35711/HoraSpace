"use client"

// 任务只读详情弹窗：统一给 project / tasks / dashboard 使用，避免每个页面重复拼详情卡片。

import type { TaskRecord } from "@/lib/hora-db"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { getPriorityToneClassName, getStatusToneClassName, PRIORITY_LABEL, TASK_STATUS_LABEL } from "@/lib/project-style"

type TaskDetailDialogProps = {
  task: TaskRecord | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit: (task: TaskRecord) => void
  projectTitle?: string | null
  requirementTitle?: string | null
}

export function TaskDetailDialog(props: TaskDetailDialogProps) {
  const task = props.task
  const title = task?.title || "任务详情"
  const projectTitle = props.projectTitle ?? task?.projectTitle ?? "未命名项目"
  const requirementTitle = props.requirementTitle ?? task?.requirementTitle ?? "无需求"
  const done = task ? task.isCompleted === 1 || task.status === "done" : false

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>这里是任务的只读详情，编辑请使用下方按钮或原来的编辑入口。</DialogDescription>
        </DialogHeader>

        {task ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">描述</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                {task.description || "暂无描述"}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailItem label="状态" value={done ? "已完成" : TASK_STATUS_LABEL[task.status]} />
              <DetailItem label="优先级" value={PRIORITY_LABEL[task.priority]} />
              <DetailItem label="所属项目" value={projectTitle} />
              <DetailItem label="所属需求" value={requirementTitle || "无需求"} />
              <DetailItem label="开始日期" value={task.startedAt || "未设置"} />
              <DetailItem label="计划结束" value={task.dueAt || "未设置"} />
              <DetailItem label="最终结束" value={task.completedAt || "未设置"} />
              <DetailItem label="更新时间" value={task.updatedAt?.slice(0, 19).replace("T", " ") || "未知"} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className={cn("border", getStatusToneClassName(task.status))}>
                {done ? "已完成" : TASK_STATUS_LABEL[task.status]}
              </Badge>
              <Badge variant="outline" className={cn("border", getPriorityToneClassName(task.priority))}>
                {PRIORITY_LABEL[task.priority]}
              </Badge>
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (task) {
                // 详情弹窗里的编辑按钮直接复用原有编辑流程，不改变页面既有行为。
                props.onOpenChange(false)
                props.onEdit(task)
              }
            }}
          >
            编辑
          </Button>
          <Button type="button" onClick={() => props.onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailItem(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 p-3">
      <p className="text-[11px] text-muted-foreground">{props.label}</p>
      <p className="mt-1 break-words text-sm text-foreground">{props.value}</p>
    </div>
  )
}
