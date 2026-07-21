#!/usr/bin/env node
// Quick dev server for the renderer (serves scripts/ + node_modules)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const PORT = 8888;
const ROOT = process.cwd();

const MIME = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".mov": "video/quicktime",
};

const server = http.createServer((req, res) => {
  let filePath = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));

  // Resolve node_modules imports
  if (filePath.includes("node_modules")) {
    filePath = path.join(ROOT, "node_modules", filePath.split("node_modules/")[1]);
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Access-Control-Allow-Origin": "*",
  });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  🎬 Jalebi Dev Server\n  http://localhost:${PORT}/scripts/renderer.html\n`);
});
