import assert from "node:assert/strict";
import test from "node:test";

const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function renderPath(pathname) {
  return worker.fetch(
    new Request(`http://localhost${pathname}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

function linkPattern(href) {
  return new RegExp(`href=["']${href.replaceAll("/", "\\/")}["']`);
}

test("home institucional responde com conteúdo, branding e CTA", async () => {
  const response = await renderPath("/");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.match(html, /Escola Estadual/);
  assert.match(html, /Ordem e Progresso/);
  assert.match(html, /branding\/logo_ordem_e_progresso\.png/);
  assert.match(html, linkPattern("/plataforma"));
});

test("home renderiza a Prova de Valor com os indicadores fornecidos", async () => {
  const response = await renderPath("/");
  const html = await response.text();

  assert.equal(response.status, 200);
  for (const content of [
    "Resultados que refletem nossa comunidade",
    "4º lugar",
    "4,4",
    "Melhor Escola",
    "17 avaliações",
    "4,3 / 5",
    "10º lugar",
    "561,99",
    "674",
    "ENEM 2024",
    "BHAZ / SAS Educação",
  ]) {
    assert.match(html, new RegExp(content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("Prova de Valor preserva contexto comunitário e fica fora da plataforma", async () => {
  const homeResponse = await renderPath("/");
  const homeHtml = await homeResponse.text();
  const platformResponse = await renderPath("/plataforma");
  const platformHtml = await platformResponse.text();

  assert.match(homeHtml, /avaliações da comunidade/i);
  assert.match(homeHtml, /pais, alunos e professores/i);
  assert.match(homeHtml, /não constitui ranking acadêmico oficial/i);
  assert.match(homeHtml, /escolas públicas de Belo Horizonte/i);
  assert.match(homeHtml, /microdados do ENEM 2024/i);
  assert.doesNotMatch(platformHtml, /Resultados que refletem nossa comunidade/);
});

test("contato institucional expõe os dados demonstrativos definidos", async () => {
  const response = await renderPath("/");
  const html = await response.text();

  assert.equal(response.status, 200);
  for (const content of [
    "Contato institucional",
    "Dados demonstrativos",
    "Telefone",
    "(31) 0000-0000",
    "E-mail",
    "atendimento@ordemeprogresso.example",
    "Endereço",
    "Rua Demonstrativa, 100",
    "Belo Horizonte — MG",
    "Atendimento",
    "Segunda a sexta",
    "7h às 17h",
  ]) {
    assert.match(html, new RegExp(content.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("seletor de perfil expõe professor, coordenação e aluno", async () => {
  const response = await renderPath("/plataforma");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, linkPattern("/plataforma/professor"));
  assert.match(html, linkPattern("/plataforma/coordenacao"));
  assert.match(html, linkPattern("/plataforma/aluno"));
});

test("dashboards respondem e oferecem Trocar perfil para todos os perfis", async () => {
  for (const pathname of [
    "/plataforma/professor",
    "/plataforma/coordenacao",
    "/plataforma/aluno",
  ]) {
    const response = await renderPath(pathname);
    const html = await response.text();
    assert.equal(response.status, 200, `Falha na rota ${pathname}`);
    assert.match(html, /Trocar perfil/, `Ação ausente em ${pathname}`);
    assert.match(html, linkPattern("/plataforma"), `Destino incorreto em ${pathname}`);
  }
});

test("rotas permitidas por perfil respondem 200", async () => {
  const routes = [
    "/plataforma/professor/turmas",
    "/plataforma/professor/avaliacoes",
    "/plataforma/professor/notas",
    "/plataforma/coordenacao/turmas",
    "/plataforma/coordenacao/avaliacoes",
    "/plataforma/coordenacao/notas",
    "/plataforma/aluno/avaliacoes",
    "/plataforma/aluno/notas",
    "/plataforma/aluno/comunicados",
  ];

  for (const pathname of routes) {
    const response = await renderPath(pathname);
    assert.equal(response.status, 200, `Permissão válida falhou em ${pathname}`);
  }
});

test("acesso direto do aluno a Turmas retorna 404", async () => {
  const response = await renderPath("/plataforma/aluno/turmas");
  assert.equal(response.status, 404);
});

test("navegação do aluno contém somente Avaliações, Notas e Comunicados", async () => {
  const response = await renderPath("/plataforma/aluno");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.doesNotMatch(html, linkPattern("/plataforma/aluno/turmas"));
  assert.match(html, linkPattern("/plataforma/aluno/avaliacoes"));
  assert.match(html, linkPattern("/plataforma/aluno/notas"));
  assert.match(html, linkPattern("/plataforma/aluno/comunicados"));
});

test("Comunicados do aluno permanece um placeholder planejado", async () => {
  const response = await renderPath("/plataforma/aluno/comunicados");
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(html, /Comunicados/);
  assert.match(html, /avisos institucionais destinados ao estudante/);
  assert.match(html, /Em desenvolvimento planejado/);
});
