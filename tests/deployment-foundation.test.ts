import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  deriveGitHubPagesBasePath,
  withBasePath,
} from "../src/config/base-path";
import {
  getStaticAcademicRouteParams,
  PROFILE_CAPABILITIES,
} from "../src/config/profile-capabilities";

const readProjectFile = (relativePath: string) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
);

test("Pages deriva basePath de project site sem hardcode", () => {
  assert.equal(deriveGitHubPagesBasePath("escola/ordem-app", ""), "/ordem-app");
  assert.equal(deriveGitHubPagesBasePath("escola/escola.github.io", ""), "");
  assert.equal(deriveGitHubPagesBasePath("qualquer/repositorio", "/preview/"), "/preview");
  assert.equal(withBasePath("/branding/logo.png", "/ordem-app"), "/ordem-app/branding/logo.png");
  assert.equal(withBasePath("/ordem-app/plataforma", "/ordem-app"), "/ordem-app/plataforma");
  assert.equal(withBasePath("https://example.com/a", "/ordem-app"), "https://example.com/a");
});

test("geração estática deriva somente rotas autorizadas das capabilities", () => {
  const params = getStaticAcademicRouteParams();
  const routeKeys = new Set(params.map(({ profile, section }) => `${profile}/${section}`));
  const expectedCount = Object.values(PROFILE_CAPABILITIES).reduce(
    (total, sections) => total + sections.length,
    0,
  );
  assert.equal(params.length, expectedCount);
  assert.equal(routeKeys.has("professor/turmas"), true);
  assert.equal(routeKeys.has("coordenacao/notas"), true);
  assert.equal(routeKeys.has("aluno/comunicados"), true);
  assert.equal(routeKeys.has("aluno/turmas"), false);
  assert.equal(routeKeys.has("professor/foo"), false);
});

test("batch CSV em applying bloqueia edição manual e nova confirmação", () => {
  const gradebookSource = readProjectFile(
    "src/components/academic/GradebookPage.tsx",
  );
  const importSource = readProjectFile(
    "src/components/academic/GradeCsvImport.tsx",
  );

  assert.match(importSource, /setImportState\("applying"\)/);
  assert.match(importSource, /onApplyingChange\?\.\(true\)/);
  assert.match(importSource, /disabled=\{[\s\S]*?busy/);
  assert.match(gradebookSource, /disabled=\{csvApplying\}/);
  assert.match(gradebookSource, /if \(csvApplyingRef\.current\)/);
  assert.match(gradebookSource, /disabled=\{manualSaveCount > 0\}/);
});

test("manifesto Sites real está presente e participa do build verificado", () => {
  const manifest = JSON.parse(readProjectFile(".openai/hosting.json")) as {
    project_id?: unknown;
    d1?: unknown;
    r2?: unknown;
  };
  const viteConfig = readProjectFile("vite.config.ts");
  const buildScript = readProjectFile("scripts/build-verified.sh");

  assert.equal(typeof manifest.project_id, "string");
  assert.equal(manifest.d1, null);
  assert.equal(manifest.r2, null);
  assert.match(viteConfig, /\.\/\.openai\/hosting\.json/);
  assert.match(buildScript, /dist\/\.openai\/hosting\.json/);
  assert.doesNotMatch(buildScript, /cp[\s\S]*hosting\.json[\s\S]*\|\| true/);
});

test("workflow Pages separa build e deploy com gates obrigatórios", () => {
  const workflow = readProjectFile(".github/workflows/deploy-pages.yml");

  assert.match(workflow, /\n  build:\n/);
  assert.match(workflow, /\n  deploy:\n[\s\S]*?needs: build/);
  assert.match(workflow, /actions\/checkout@v7/);
  assert.match(workflow, /actions\/setup-node@v7/);
  assert.match(workflow, /actions\/configure-pages@v6/);
  assert.match(workflow, /actions\/upload-pages-artifact@v5/);
  assert.match(workflow, /actions\/deploy-pages@v5/);
  assert.match(workflow, /npm audit --omit=dev/);
  assert.match(workflow, /npm run test:pages:smoke/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
});

test("hero institucional usa o campus como background responsivo com basePath", () => {
  const home = readProjectFile("app/page.tsx");
  const styles = readProjectFile("app/globals.css");

  assert.match(home, /institutional-hero[\s\S]*?--campus-image/);
  assert.match(home, /withBasePath\("\/assets\/escola-campus\.webp"\)/);
  assert.match(
    styles,
    /\.institutional-hero \{[\s\S]*?var\(--campus-image\)[\s\S]*?cover no-repeat/,
  );
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?background-position:/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?background-position:/);
});
