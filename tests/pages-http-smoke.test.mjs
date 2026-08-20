import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { deriveGitHubPagesBasePath } from "../src/config/base-path.ts";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const basePath = deriveGitHubPagesBasePath();

function startPagesServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/serve-pages.mjs"], {
      cwd: projectRoot,
      env: { ...process.env, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`O servidor Pages não iniciou a tempo. ${stderr}`));
    }, 10_000);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      const match = chunk.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (!match) return;
      clearTimeout(timeout);
      resolve({ child, origin: `http://127.0.0.1:${match[1]}` });
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code !== null && code !== 0) {
        reject(new Error(`O servidor Pages encerrou com código ${code}. ${stderr}`));
      }
    });
  });
}

async function expectStatus(origin, pathname, expectedStatus) {
  const response = await fetch(`${origin}${pathname}`, { redirect: "manual" });
  assert.equal(
    response.status,
    expectedStatus,
    `${pathname} retornou ${response.status}; esperado ${expectedStatus}`,
  );
  return response;
}

test("artifact Pages responde via HTTP sob basePath realista", async (context) => {
  assert.notEqual(basePath, "", "O smoke deve executar com um basePath de project site.");
  const { child, origin } = await startPagesServer();
  context.after(() => {
    if (!child.killed) child.kill("SIGTERM");
  });

  const validRoutes = [
    "/",
    "/plataforma/",
    "/plataforma/professor/",
    "/plataforma/professor/notas/",
    "/plataforma/coordenacao/",
    "/plataforma/coordenacao/turmas/",
    "/plataforma/aluno/",
    "/plataforma/aluno/notas/",
  ];
  for (const route of validRoutes) {
    await expectStatus(origin, `${basePath}${route}`, 200);
  }

  await expectStatus(origin, `${basePath}/plataforma/aluno/turmas/`, 404);
  await expectStatus(origin, `${basePath}/plataforma/foo/`, 404);
  await expectStatus(origin, `${basePath}/plataforma/professor/foo/`, 404);
  await expectStatus(origin, "/plataforma/", 404);

  const home = await expectStatus(origin, `${basePath}/`, 200);
  const html = await home.text();
  const staticAssets = [...html.matchAll(
    /(?:href|src)=["']([^"']+\/_next\/static\/[^"']+\.(?:css|js))["']/g,
  )].map((match) => match[1]);
  const cssAsset = staticAssets.find((asset) => asset.endsWith(".css"));
  const jsAsset = staticAssets.find((asset) => asset.endsWith(".js"));

  assert.ok(cssAsset?.startsWith(`${basePath}/`), "CSS principal sem basePath.");
  assert.ok(jsAsset?.startsWith(`${basePath}/`), "Chunk JS principal sem basePath.");
  await expectStatus(origin, cssAsset, 200);
  await expectStatus(origin, jsAsset, 200);
  await expectStatus(origin, `${basePath}/branding/logo_ordem_e_progresso.png`, 200);
  await expectStatus(origin, `${basePath}/assets/escola-campus.webp`, 200);
});
