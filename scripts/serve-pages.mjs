import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve("out");
const port = Number(process.env.PORT ?? 4173);
const repositoryParts = (process.env.GITHUB_REPOSITORY ?? "").split("/");
const repositoryBasePath =
  repositoryParts.length === 2 && repositoryParts[1] !== `${repositoryParts[0]}.github.io`
    ? `/${repositoryParts[1]}`
    : "";
const configuredBasePath = (process.env.GITHUB_PAGES_BASE_PATH ?? repositoryBasePath)
  .replace(/^\/+|\/+$/g, "");
const basePath = configuredBasePath ? `/${configuredBasePath}` : "";
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = createServer((request, response) => {
  const requestedPath = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
  if (
    basePath &&
    requestedPath !== basePath &&
    !requestedPath.startsWith(`${basePath}/`)
  ) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const pathname = basePath
    ? requestedPath.slice(basePath.length) || "/"
    : requestedPath;
  const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
  let filePath = join(root, safePath);
  if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = join(filePath, "index.html");
  if (!existsSync(filePath) && !extname(filePath)) filePath = join(filePath, "index.html");
  if (!filePath.startsWith(root) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "content-type": types[extname(filePath)] ?? "application/octet-stream" });
  createReadStream(filePath).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const listeningPort = typeof address === "object" && address ? address.port : port;
  console.log(`Static Pages artifact available at http://127.0.0.1:${listeningPort}`);
});

process.on("SIGTERM", () => {
  server.closeAllConnections();
  server.close(() => process.exit(0));
});
