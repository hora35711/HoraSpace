import fs from "node:fs"
import path from "node:path"
import process from "node:process"

// 打包前准备 Next standalone 目录：把 static/public 摆到 server.js 预期的位置。
const rootDir = process.cwd()
const standaloneDir = path.join(rootDir, ".next", "standalone")
const nextStaticSource = path.join(rootDir, ".next", "static")
const nextStaticTarget = path.join(standaloneDir, ".next", "static")
const publicSource = path.join(rootDir, "public")
const publicTarget = path.join(standaloneDir, "public")

function copyDir(source, target) {
  if (!fs.existsSync(source)) return
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
}

if (!fs.existsSync(standaloneDir)) {
  throw new Error("未找到 .next/standalone，请先执行 next build")
}

copyDir(nextStaticSource, nextStaticTarget)
copyDir(publicSource, publicTarget)

console.log(`prepared electron bundle assets in ${standaloneDir}`)
