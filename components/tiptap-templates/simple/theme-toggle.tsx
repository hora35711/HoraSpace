"use client"

// --- UI Primitives ---
import { Button } from "@/components/tiptap-ui-primitive/button"

// --- Icons ---
import { MoonStarIcon } from "@/components/tiptap-icons/moon-star-icon"
import { SunIcon } from "@/components/tiptap-icons/sun-icon"

// --- Theme ---
import { useTheme } from "next-themes"

export function ThemeToggle() {
  // 读取全局主题：由 next-themes 统一管理，默认跟随系统。
  const { resolvedTheme, setTheme } = useTheme()

  const isDarkMode = resolvedTheme === "dark"

  const toggleDarkMode = () => {
    // 手动切换时写入全局主题：light <-> dark。
    setTheme(isDarkMode ? "light" : "dark")
  }

  return (
    <Button
      onClick={toggleDarkMode}
      aria-label={`Switch to ${isDarkMode ? "light" : "dark"} mode`}
      variant="ghost"
    >
      {isDarkMode ? (
        <MoonStarIcon className="tiptap-button-icon" />
      ) : (
        <SunIcon className="tiptap-button-icon" />
      )}
    </Button>
  )
}
