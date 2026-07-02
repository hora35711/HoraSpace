const fs = require("node:fs")
const path = require("node:path")

// Electron Builder 钩子：在 dmg/nsis 生成前补齐 Next standalone 运行依赖。
exports.default = async function afterPack(context) {
  const rootDir = context.packager.projectDir
  const sourceStandaloneDir = path.join(rootDir, ".next", "standalone")
  const sourceNodeModules = findStandaloneNodeModules(sourceStandaloneDir)

  if (!sourceNodeModules) {
    console.warn(`[hora] 未找到 Next standalone 依赖目录，跳过补拷贝：${sourceStandaloneDir}`)
    return
  }

  const standaloneTargets = getStandaloneTargets(context)
  for (const targetStandaloneDir of standaloneTargets) {
    const targetNodeModules = path.join(targetStandaloneDir, "node_modules")
    fs.mkdirSync(targetStandaloneDir, { recursive: true })
    fs.cpSync(sourceNodeModules, targetNodeModules, {
      recursive: true,
      force: true,
      dereference: true,
    })
  }
}

// 兼容 Next 在不同工作区根目录下生成的 standalone 结构：node_modules 可能在根部，也可能在嵌套项目目录里。
function findStandaloneNodeModules(standaloneDir) {
  if (!fs.existsSync(standaloneDir)) {
    return null
  }

  const directNodeModules = path.join(standaloneDir, "node_modules")
  if (fs.existsSync(directNodeModules)) {
    return directNodeModules
  }

  const queue = [{ dir: standaloneDir, depth: 0 }]
  while (queue.length > 0) {
    const current = queue.shift()
    if (current.depth > 4) continue

    for (const entry of fs.readdirSync(current.dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue

      const candidate = path.join(current.dir, entry.name)
      if (entry.name === "node_modules") {
        return candidate
      }

      queue.push({ dir: candidate, depth: current.depth + 1 })
    }
  }

  return null
}

// 根据平台找到 app 包内的 standalone 目录，确保安装包内也带完整依赖。
function getStandaloneTargets(context) {
  const platformName = context.electronPlatformName
  const productFilename = context.packager.appInfo.productFilename

  if (platformName === "darwin") {
    return [
      path.join(context.appOutDir, `${productFilename}.app`, "Contents", "Resources", "standalone"),
    ]
  }

  return [
    path.join(context.appOutDir, "resources", "standalone"),
  ]
}
