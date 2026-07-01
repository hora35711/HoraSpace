"use client"

import * as React from "react"
import { CalendarDays, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type DatePickerFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

// 统一日期选择器：业务页面只需要传字符串日期，这里负责 Calendar 弹层和字符串互转。
export function DatePickerField(props: DatePickerFieldProps) {
  const selectedDate = React.useMemo(() => parseDateValue(props.value), [props.value])

  return (
    <div className="space-y-2">
      <label htmlFor={props.id} className="text-xs text-neutral-500">
        {props.label}
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id={props.id}
            type="button"
            variant="outline"
            className="h-9 w-full justify-between px-3 text-sm font-normal"
          >
            <span className="truncate">{props.value || props.placeholder || "请选择日期"}</span>
            <CalendarDays className="size-4 text-neutral-500" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <div className="space-y-2 p-3">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => props.onChange(date ? formatDateValue(date) : "")}
              className="rounded-lg border"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => props.onChange("")}
                disabled={!props.value}
              >
                <X className="size-4" />
                清除
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function parseDateValue(value: string) {
  if (!value) return undefined
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function formatDateValue(date: Date) {
  return date.toISOString().slice(0, 10)
}

