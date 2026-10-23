import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.argv[2] ?? 5173);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Specify a port between 1 and 65535: node serve.mjs [port]");
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = createServer(async (request, response) => {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Invalid URL.");
    return;
  }
  if (pathname.includes("\0")) {
    response.writeHead(400).end("Invalid URL.");
    return;
  }
  const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  const local = relative(root, path);
  if (local === ".." || local.startsWith(`..${sep}`) || isAbsolute(local)) {
    response.writeHead(403).end("Outside preview directory.");
    return;
  }
  const contentType = types[extname(path)];
  if (!contentType) {
    response.writeHead(404).end("Not found.");
    return;
  }
  try {
    const body = await readFile(path);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": body.length,
      "Cache-Control": "no-store",
    }).end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR" || error.code === "EISDIR") {
      response.writeHead(404).end("Not found.");
    } else {
      console.error("Preview file read failed:", error);
      response.writeHead(500).end("Could not read preview file.");
    }
  }
});
server.on("error", error => {
  console.error(`Could not start stairs preview on port ${port}:`, error.message);
  process.exitCode = 1;
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Stairs preview: http://127.0.0.1:${port}/`);
});
