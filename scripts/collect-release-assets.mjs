import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

// 发行后处理：把品牌图标同步到安装包同级目录，方便分发和归档。
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, "..")
const outputDir = path.join(rootDir, "dist-electron", "releases")
const iconDir = path.join(rootDir, "icon")
const releaseIconDir = path.join(outputDir, "icon")
const sourceStandaloneNodeModules = path.join(rootDir, ".next", "standalone", "node_modules")

if (!fs.existsSync(outputDir)) {
  throw new Error(`未找到发行目录：${outputDir}`)
}

if (!fs.existsSync(iconDir)) {
  throw new Error(`未找到图标目录：${iconDir}`)
}

fs.mkdirSync(releaseIconDir, { recursive: true })

// Next standalone 在运行时仍需要它自己的 node_modules，打包器有时会漏掉这一层，所以这里补拷贝一次。
function syncStandaloneNodeModules(targetStandaloneDir) {
  if (!fs.existsSync(sourceStandaloneNodeModules)) {
    return
  }

  const targetNodeModulesDir = path.join(targetStandaloneDir, "node_modules")
  fs.mkdirSync(targetStandaloneDir, { recursive: true })
  fs.cpSync(sourceStandaloneNodeModules, targetNodeModulesDir, {
    recursive: true,
    force: true,
    dereference: true,
  })
}

for (const entry of fs.readdirSync(iconDir, { withFileTypes: true })) {
  if (!entry.isFile()) continue
  const sourcePath = path.join(iconDir, entry.name)
  const targetPath = path.join(releaseIconDir, entry.name)
  fs.copyFileSync(sourcePath, targetPath)
}

// 额外复制一个简洁的图标索引，方便手动分发时快速找到主图标。
fs.copyFileSync(path.join(rootDir, "app", "favicon.ico"), path.join(outputDir, "favicon.ico"))

// 把 standalone 的 node_modules 同步到所有已生成的发行包里。
for (const entry of fs.readdirSync(outputDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue

  const candidateRoot = path.join(outputDir, entry.name)
  const standaloneTargets = []

  // macOS .app：Contents/Resources/standalone
  const macStandalone = path.join(candidateRoot, "Hora Space.app", "Contents", "Resources", "standalone")
  if (fs.existsSync(macStandalone)) {
    standaloneTargets.push(macStandalone)
  }

  // Windows unpacked：resources/standalone
  const windowsUnpackedStandalone = path.join(candidateRoot, "resources", "standalone")
  if (fs.existsSync(windowsUnpackedStandalone)) {
    standaloneTargets.push(windowsUnpackedStandalone)
  }

  for (const targetStandaloneDir of standaloneTargets) {
    syncStandaloneNodeModules(targetStandaloneDir)
  }
}

console.log(`prepared release assets in ${outputDir}`)
