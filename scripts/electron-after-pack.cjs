const fs = require("node:fs")
const path = require("node:path")

// Electron Builder 钩子：在 dmg/nsis 生成前补齐 Next standalone 运行依赖。
exports.default = async function afterPack(context) {
  const rootDir = context.packager.projectDir
  const sourceNodeModules = path.join(rootDir, ".next", "standalone", "node_modules")

  if (!fs.existsSync(sourceNodeModules)) {
    throw new Error(`未找到 Next standalone 依赖目录：${sourceNodeModules}`)
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
