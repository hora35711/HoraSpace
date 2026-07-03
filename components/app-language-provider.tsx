"use client"

// 全局语言 provider：负责持久化当前界面语言，并让公共文案即时刷新。

import * as React from "react"

import { AppLanguageProvider } from "@/lib/app-language"

export function AppLanguageRoot({ children }: { children: React.ReactNode }) {
  return <AppLanguageProvider>{children}</AppLanguageProvider>
}

