"use client"

// Excalidraw 客户端边界：集中承载依赖浏览器 API 的画布和定制主菜单，避免服务端执行其模块。

import { Excalidraw, MainMenu } from "@excalidraw/excalidraw"
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types"

// Hora 只保留本地绘图需要的菜单项，不显示 Library、社交入口和 Excalidraw 外部链接。
export function HoraExcalidraw(props: ExcalidrawProps) {
  return (
    <Excalidraw {...props}>
      <MainMenu>
        <MainMenu.DefaultItems.LoadScene />
        <MainMenu.DefaultItems.SaveToActiveFile />
        <MainMenu.DefaultItems.Export />
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.SearchMenu />
        <MainMenu.DefaultItems.CommandPalette />
        <MainMenu.DefaultItems.ClearCanvas />
        <MainMenu.Separator />
        <MainMenu.DefaultItems.ToggleTheme />
        <MainMenu.DefaultItems.ChangeCanvasBackground />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    </Excalidraw>
  )
}
