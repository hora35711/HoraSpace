import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // 打包时输出可独立运行的服务端产物，Electron 生产态可以直接拉起它。
  output: "standalone",
  // 固定 tracing / Turbopack 根目录，避免 Windows 用户目录里的 package-lock.json 影响 standalone 输出结构。
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
}

export default nextConfig
