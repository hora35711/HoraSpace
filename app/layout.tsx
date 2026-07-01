// app/layout.tsx
// 根布局：注入全局样式、全局主题，并挂载应用主壳。
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { AppShell } from "@/app/app-shell"

// RootLayout：Next.js App Router 的全局布局组件。
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html suppressHydrationWarning>
      <body>
        {/* ThemeProvider：全局主题管理，默认跟随系统，可被手动切换覆盖。 */}
        <ThemeProvider>
          {/* AppShell：左侧导航 + 可拖拽分栏 + 右侧页面内容。 */}
          <AppShell>{children}</AppShell>
        </ThemeProvider>
      </body>
    </html>
  )
}
