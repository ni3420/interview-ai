#!/usr/bin/env node
/**
 * Builds the client and reports gzip JS payload overall and per route.
 *
 * Next 16.4 (Turbopack) does not print per-route First Load JS, and there is no
 * `.next/app-build-manifest.json`. Each route instead emits
 * `server/app/**\/*_client-reference-manifest.js`, which lists the client chunks
 * it needs. Per-route size here is root layout chunks (rootMainFiles) plus that
 * route's own chunks, gzipped — the same set First Load JS describes.
 *
 * Usage: node scripts/measure-client.mjs [--skip-build]
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const clientDir = join(root, "client");
const nextDir = join(clientDir, ".next");
const skipBuild = process.argv.includes("--skip-build");

const gzipCache = new Map();
function gzipSize(relativePath) {
  if (gzipCache.has(relativePath)) return gzipCache.get(relativePath);
  const file = join(nextDir, relativePath);
  const size = existsSync(file) ? gzipSync(readFileSync(file)).length : 0;
  gzipCache.set(relativePath, size);
  return size;
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

function walk(dir, filter) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, filter);
    return filter(entry.name) ? [full] : [];
  });
}

/** Reads `globalThis.__RSC_MANIFEST["<page>"] = {...}` and returns key + object. */
function readClientManifest(file) {
  const source = readFileSync(file, "utf8");
  const keyMatch = source.match(/__RSC_MANIFEST\["([^"]+)"\]/);
  if (!keyMatch || keyMatch.index === undefined) return null;
  const assignmentStart = source.indexOf(" = ", keyMatch.index);
  const start = source.indexOf("{", assignmentStart);
  if (start < 0) return null;
  let json = source.slice(start).trim();
  if (json.endsWith(";")) json = json.slice(0, -1);
  return { key: keyMatch[1], manifest: JSON.parse(json) };
}

function normalizeChunk(chunk) {
  return chunk.replace(/^\/_next\//, "").replace(/^\//, "");
}

if (!skipBuild) {
  console.log("Building client with `bun run build`...");
  execFileSync("bun", ["run", "build"], {
    cwd: clientDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

const buildManifestPath = join(nextDir, "build-manifest.json");
if (!existsSync(buildManifestPath)) {
  console.error(`Missing ${buildManifestPath}; run the build first.`);
  process.exit(1);
}
const buildManifest = JSON.parse(readFileSync(buildManifestPath, "utf8"));
const rootChunks = (buildManifest.rootMainFiles ?? []).map(normalizeChunk);

const appPathsPath = join(nextDir, "app-path-routes-manifest.json");
const appPaths = existsSync(appPathsPath)
  ? JSON.parse(readFileSync(appPathsPath, "utf8"))
  : {};

const manifestFiles = walk(join(nextDir, "server", "app"), (name) =>
  name.endsWith("_client-reference-manifest.js")
);

const routes = [];
for (const file of manifestFiles) {
  const parsed = readClientManifest(file);
  if (!parsed) continue;

  const route = appPaths[parsed.key];
  if (!route || route.startsWith("/api/")) continue;

  const chunks = new Set(rootChunks);
  for (const module of Object.values(parsed.manifest.clientModules ?? {})) {
    for (const chunk of module.chunks ?? []) chunks.add(normalizeChunk(chunk));
  }

  routes.push({
    route,
    gzip: [...chunks].reduce((sum, chunk) => sum + gzipSize(chunk), 0),
    files: chunks.size,
  });
}

routes.sort((a, b) => b.gzip - a.gzip);

console.log("\nPer-route JS (gzip, root layout + route chunks):");
console.log("| route | gzip | files |");
console.log("|---|---|---|");
for (const row of routes) {
  console.log(`| ${row.route} | ${kb(row.gzip)} | ${row.files} |`);
}

const staticFiles = walk(join(nextDir, "static"), (name) => name.endsWith(".js"));
const total = staticFiles.reduce(
  (sum, file) => sum + gzipSize(relative(nextDir, file).split("\\").join("/")),
  0
);
console.log(
  `\nRoutes: ${routes.length}; all static JS gzip: ${kb(total)} across ${staticFiles.length} files`
);

const largest = [...gzipCache.entries()]
  .filter(([file]) => file.endsWith(".js"))
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);
console.log("\nLargest JS files (gzip):");
for (const [file, size] of largest) console.log(`- ${file}: ${kb(size)}`);
