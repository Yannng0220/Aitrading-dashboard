import { copyFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");

// 產生 Cloudflare 與其他前端平台都能直接部署的 dist 輸出目錄。
await rm(distDir, { recursive: true, force: true });
await mkdir(path.join(distDir, "web"), { recursive: true });

const filesToCopy = [
  ["index.html", "index.html"],
  ["styles.css", "styles.css"],
  ["web-app.js", "web-app.js"],
  ["web/model-config.json", "web/model-config.json"],
  ["web/pokemon-role-classifier.onnx", "web/pokemon-role-classifier.onnx"],
];

for (const [source, target] of filesToCopy) {
  await copyFile(path.join(root, source), path.join(distDir, target));
}

console.log("Built static site to dist/");
