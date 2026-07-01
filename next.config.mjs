/** @type {import('next').NextConfig} */
const nextConfig = {
  // 打包时输出可独立运行的服务端产物，Electron 生产态可以直接拉起它。
  output: "standalone",
}

export default nextConfig
