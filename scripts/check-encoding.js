#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const ROOT = process.cwd()
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])
const decoder = new TextDecoder("utf-8", { fatal: true })

const EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".scss",
  ".md",
  ".sql",
  ".prisma",
  ".yml",
  ".yaml",
  ".env",
  ".txt",
])

const IGNORE_DIRS = new Set([".git", ".next", "node_modules", "dist", "build", "coverage"])
const IGNORE_FILES = new Set(["package-lock.json"])

// Common UTF-8->CP1251 mojibake signatures.
const MOJIBAKE_RE = /(?:[\u0420\u0421][\u0080-\u04ff]){2,}|(?:\u0432\u201a|\u0432\u201e|\u0432\u0402|\u0440\u045f)/u

const bomIssues = []
const utf8Issues = []
const mojibakeIssues = []

walk(ROOT)

if (bomIssues.length || utf8Issues.length || mojibakeIssues.length) {
  if (utf8Issues.length) {
    console.error("Invalid UTF-8:")
    for (const file of utf8Issues) console.error(`  - ${file}`)
  }

  if (bomIssues.length) {
    console.error("UTF-8 BOM detected:")
    for (const file of bomIssues) console.error(`  - ${file}`)
  }

  if (mojibakeIssues.length) {
    console.error("Mojibake-like text detected:")
    for (const issue of mojibakeIssues) {
      console.error(`  - ${issue.file}:${issue.line}`)
    }
  }

  process.exit(1)
}

console.log("Encoding check passed: UTF-8 (no BOM), no mojibake signatures.")

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      walk(fullPath)
      continue
    }

    if (!entry.isFile()) continue
    if (IGNORE_FILES.has(entry.name)) continue

    const ext = path.extname(entry.name)
    if (!EXTENSIONS.has(ext) && !entry.name.startsWith(".env")) continue

    scanFile(fullPath)
  }
}

function scanFile(filePath) {
  const bytes = fs.readFileSync(filePath)
  const rel = path.relative(ROOT, filePath).replaceAll("\\", "/")

  if (bytes.length >= 3 && bytes.subarray(0, 3).equals(UTF8_BOM)) {
    bomIssues.push(rel)
  }

  let text
  try {
    text = decoder.decode(bytes)
  } catch {
    utf8Issues.push(rel)
    return
  }

  const match = text.match(MOJIBAKE_RE)
  if (!match || typeof match.index !== "number") return

  const line = text.slice(0, match.index).split(/\r?\n/).length
  mojibakeIssues.push({ file: rel, line })
}
