import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const args = process.argv.slice(2);
const valueAfter = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};
const host = valueAfter("--host", "0.0.0.0");
const port = Number(valueAfter("--port", "4173"));
const root = process.cwd();
const contentTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".png": "image/png" };

http.createServer((request, response) => {
  const requestPath = decodeURIComponent((request.url ?? "/").split("?")[0]);
  const relative = requestPath === "/" ? "index.html" : requestPath.replace(/^\//, "");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": contentTypes[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(response);
}).listen(port, host, () => console.log(`Premium brochure preview: http://${host}:${port}`));
