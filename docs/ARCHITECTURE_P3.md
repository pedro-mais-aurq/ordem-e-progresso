# Arquitetura da P3 — Integration + Deployment + Final Hardening

## 1. Escopo preservado

A P3 mantém o fluxo aprovado:

```text
React UI
   ↓
Application Services
   ↓
Repository Interfaces
   ↓
Local Repositories
   ↓
IndexedDB
```

Não foram adicionados backend, autenticação, RLS, Supabase, DED, PWA ou novas
regras acadêmicas. `DB_VERSION` permanece em 2 porque CSV e deploy não alteram o
schema.

## 2. Importação CSV

O parser local em `src/modules/grades/csv-import.ts` aceita somente arquivos
`.csv` UTF-8 no formato `matricula;nota`, com delimitador `;`. Ele reutiliza
`parsePtBrScore`, aceita BOM, vírgula/ponto decimal e nota zero, e impõe limites
de 5 MB e 5.000 linhas.

O fluxo de aplicação é:

```text
GradeCsvImport
   ↓
GradeImportService
   ↓
GradeRepository.saveGradesWithAudit
   ↓
transação grades + auditEntries
```

O Service resolve a Assessment, bloqueia `closed`, verifica o
`TeachingAssignment` ativo e valida existência, atividade e turma do Student.
Antes de classificar as linhas, carrega `students.classId` e
`grades.assessmentId` por índices e constrói mapas por matrícula e estudante. A
quantidade de consultas não cresce com o número de linhas do CSV. A validação do
Service rejeita score não finito, matrícula fora do padrão e duplicatas mesmo
quando o chamador não passou pelo parser.
Uma Grade existente com outro valor é conflito; o usuário escolhe manter ou
substituir. Valores iguais não produzem write nem auditoria.

O batch preserva a identidade lógica `studentId + assessmentId`, normaliza cada
`AuditEntry.entityId` para o ID técnico efetivamente persistido e confirma todas
as Grades e auditorias ou nenhuma. Após commit, `upsertGradesInSnapshot()` aplica
somente os registros afetados ao snapshot.

Na confirmação, o Service recarrega o contexto em lote para reduzir a janela
entre preview e persistência e formar `previousValue` com o estado mais recente.
Durante `applying`, as células manuais, outra importação e nova confirmação ficam
bloqueadas localmente. Isso evita concorrência no mesmo fluxo sem introduzir
mutex ou estado global.

## 3. Export estático

`npm run build` continua sendo o build Vinext/Cloudflare. `npm run build:pages`
ativa condicionalmente no Next:

- `output: "export"`;
- `trailingSlash: true`;
- `images.unoptimized: true`;
- `basePath` derivado de `GITHUB_REPOSITORY` ou override explícito;
- output em `out/`.

Project sites recebem `/{repository}`. Repositórios `owner.github.io` recebem
caminho vazio. `withBasePath()` é usado nos assets públicos; `next/link` continua
responsável pelos links internos.

`generateStaticParams()` consome `getStaticAcademicRouteParams()`, que deriva as
combinações de `PROFILE_CAPABILITIES`. Isso gera nove módulos permitidos e não
gera `/plataforma/aluno/turmas`.

O uso de query string do Gradebook foi movido para um componente client-side sob
`Suspense`, evitando renderização dinâmica incompatível com static export.

`test:pages:smoke` serve `out/` por HTTP sob um project-site base path realista e
valida 200 das rotas permitidas e assets essenciais, 404 das rotas proibidas e
acesso direto/refresh das páginas pré-geradas.

## 4. Workflow

`.github/workflows/deploy-pages.yml` roda em push para `main` e por
`workflow_dispatch`, com Node 22, permissões mínimas e concorrência serializada.
O job `build` não usa o environment protegido e executa:

1. `npm ci`;
2. `npm audit --omit=dev`;
3. typecheck, lint e testes de domínio;
4. build Vinext e testes renderizados;
5. build Pages, teste estrutural e smoke HTTP do artifact;
6. actions oficiais de configure e upload.

O job `deploy` depende de `build`, usa sozinho o environment `github-pages` e
executa `deploy-pages`. Assim, eventual aprovação manual protege a publicação,
não a CI. Falhas nos quality gates interrompem o build. Nenhum secret da
aplicação é usado.

## 5. Manifesto Sites e hero institucional

`.openai/hosting.json` é um manifesto real, versionado e não secreto do runtime
Sites. `vite.config.ts` usa seus bindings opcionais e `build-verified.sh` o inclui
no artifact Vinext antes da validação. Ele não pode ser removido do ZIP.

O hero usa o asset existente `public/assets/escola-campus.webp` em todo o fundo,
resolvido por `withBasePath()`. Gradientes azuis translúcidos preservam contraste
sem ocultar a fotografia; os breakpoints ajustam a posição para manter a fachada
visível em telas menores.

## 6. Segurança

Upgrades foram divididos em grupos e regressados após cada grupo:

- Next `16.2.6 → 16.3.1`;
- React/React DOM/RSC `19.2.6 → 19.2.8` e ESLint config alinhado em `16.3.1`;
- Vite `8.0.13 → 8.2.1`;
- Cloudflare Vite Plugin `1.37.1 → 1.53.0`, Wrangler `4.92.0 → 4.124.0` e Workers Types `4.x → 5.20260819.1`.

`npm audit --omit=dev` retorna zero vulnerabilidades. As correções transitivas
compatíveis de Babel, `brace-expansion`, `fast-uri` e `js-yaml` foram aplicadas
sem `--force` e regressadas. O audit completo retorna somente duas ocorrências
high no mesmo caminho de tooling: `vinext → image-size`, relativas a DoS nos
parsers ICNS/JXL/HEIF. Elas não integram o bundle de dependências de produção.
O npm só oferece correção pela troca para `vinext@1.0.0-beta.7`, classificada
como breaking change; migrar a foundation de hosting sem compatibilidade
demonstrada foi rejeitado. Não foram aplicados overrides nem `--force`.

## 7. Portabilidade

`scripts/build-verified.sh` procura `timeout` e depois `gtimeout`. Na ausência de
ambos, termina com mensagem explícita e código 69. Não exige alteração global de
`PATH`.

## 8. Persistência e limites de segurança

O IndexedDB continua local por origem. Trocas de perfil no mesmo deploy observam
o mesmo banco e o refresh não executa reset. O controle de navegação por perfil
continua demonstrativo e não substitui autenticação/RLS.

O artifact foi servido localmente sob subpath e validou home, assets, dashboards,
refresh de rotas pré-geradas e 404 de rotas proibidas. Persistência real no
domínio público, smoke pós-deploy e Safari/iPhone permanecem verificações externas.
