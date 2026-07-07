import fs from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import process from "node:process"

// 发布版本脚本：同步根包和 Electron 子包版本，创建提交与 vX.Y.Z tag。
const rootDir = process.cwd()
const releaseType = process.argv[2]
const allowedTypes = new Set(["patch", "minor", "major"])

if (!allowedTypes.has(releaseType)) {
  console.error("[hora] 用法：node scripts/create-release-version.mjs patch|minor|major")
  process.exit(1)
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: false,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`)
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"))
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8")
}

function nextVersion(version, type) {
  const parts = String(version).split(".").map((part) => Number.parseInt(part, 10) || 0)
  const [major, minor, patch] = [parts[0] || 0, parts[1] || 0, parts[2] || 0]

  if (type === "major") return `${major + 1}.0.0`
  if (type === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

const status = spawnSync("git", ["status", "--porcelain"], {
  cwd: rootDir,
  encoding: "utf8",
  shell: false,
})

if (status.stdout.trim()) {
  console.error("[hora] 当前工作区有未提交改动，请先提交或暂存后再发布版本。")
  process.exit(1)
}

const rootPackagePath = path.join(rootDir, "package.json")
const rootLockPath = path.join(rootDir, "package-lock.json")
const electronPackagePath = path.join(rootDir, "electron", "package.json")
const electronLockPath = path.join(rootDir, "electron", "package-lock.json")
const rootPackage = readJson(rootPackagePath)
const rootLock = readJson(rootLockPath)
const electronPackage = readJson(electronPackagePath)
const electronLock = readJson(electronLockPath)
const version = nextVersion(rootPackage.version, releaseType)
const tagName = `v${version}`

rootPackage.version = version
rootLock.version = version
if (rootLock.packages?.[""]) {
  rootLock.packages[""].version = version
}
electronPackage.version = version
electronLock.version = version
if (electronLock.packages?.[""]) {
  electronLock.packages[""].version = version
}

writeJson(rootPackagePath, rootPackage)
writeJson(rootLockPath, rootLock)
writeJson(electronPackagePath, electronPackage)
writeJson(electronLockPath, electronLock)

run("git", ["add", "package.json", "package-lock.json", "electron/package.json", "electron/package-lock.json"])
run("git", ["commit", "-m", `Release ${tagName}`])
run("git", ["tag", tagName])

console.log(`[hora] 已创建发布版本 ${tagName}。推送命令：git push origin main ${tagName}`)
