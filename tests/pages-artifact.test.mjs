import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { deriveGitHubPagesBasePath } from "../src/config/base-path.ts";

const out = new URL("../out/", import.meta.url).pathname;
const expectedRoutes = [
  "index.html",
  "plataforma/index.html",
  "plataforma/professor/index.html",
  "plataforma/professor/turmas/index.html",
  "plataforma/professor/avaliacoes/index.html",
  "plataforma/professor/notas/index.html",
  "plataforma/coordenacao/index.html",
  "plataforma/coordenacao/turmas/index.html",
  "plataforma/coordenacao/avaliacoes/index.html",
  "plataforma/coordenacao/notas/index.html",
  "plataforma/aluno/index.html",
  "plataforma/aluno/avaliacoes/index.html",
  "plataforma/aluno/notas/index.html",
  "plataforma/aluno/comunicados/index.html",
];

test("artifact Pages contém home, dashboards e todas as rotas acadêmicas permitidas", () => {
  for (const route of expectedRoutes) {
    assert.equal(existsSync(join(out, route)), true, `Arquivo estático ausente: ${route}`);
  }
});

test("artifact não gera a rota proibida aluno/turmas", () => {
  assert.equal(existsSync(join(out, "plataforma/aluno/turmas/index.html")), false);
});

test("artifact contém assets Next e assets públicos usados pela home", () => {
  assert.equal(existsSync(join(out, "_next/static")), true);
  assert.equal(existsSync(join(out, "branding/logo_ordem_e_progresso.png")), true);
  assert.equal(existsSync(join(out, "assets/escola-campus.webp")), true);
});

test("HTML usa o basePath configurado para links e assets", () => {
  const html = readFileSync(join(out, "index.html"), "utf8");
  const basePath = deriveGitHubPagesBasePath();
  if (basePath) {
    assert.match(html, new RegExp(`href=["']${basePath.replaceAll("/", "\\/")}\/plataforma\/`));
    assert.match(html, new RegExp(`${basePath.replaceAll("/", "\\/")}\/branding\/logo_ordem_e_progresso\\.png`));
    assert.match(html, new RegExp(`${basePath.replaceAll("/", "\\/")}\/assets\/escola-campus\\.webp`));
  } else {
    assert.match(html, /href=["']\/plataforma\//);
    assert.match(html, /\/branding\/logo_ordem_e_progresso\.png/);
    assert.match(html, /\/assets\/escola-campus\.webp/);
  }
});
