"use client"

import { cn } from "@/lib/utils"

type ShimmerProps = React.ComponentPropsWithoutRef<"p">

// 文字型 shimmer：适合加载提示、占位文案和状态说明。
export function ShimmerDemo({ className, children = "Generating response…", ...props }: ShimmerProps) {
  return (
    <p
      data-slot="shimmer"
      className={cn("shimmer text-sm text-muted-foreground", className)}
      {...props}
    >
      {children}
    </p>
  )
}

type ShimmerBlockProps = React.ComponentPropsWithoutRef<"div">

// 块状 shimmer：适合卡片、列表行和面板骨架。
export function ShimmerBlock({ className, ...props }: ShimmerBlockProps) {
  return <div data-slot="shimmer-block" className={cn("shimmer rounded-lg bg-muted/60", className)} {...props} />
}
