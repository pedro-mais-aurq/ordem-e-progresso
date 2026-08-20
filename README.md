# Ordem — Plataforma de Progresso

Implementação consolidada da **P3 — Integration + Deployment + Final Hardening** sobre a foundation institucional da P1 e o Academic Core da P2.

A aplicação mantém dois contextos separados:

- site institucional em `/`;
- plataforma acadêmica demonstrativa em `/plataforma`.

Todos os estudantes, matrículas, avaliações e notas são fictícios. A persistência continua exclusivamente local, via IndexedDB.

## Stack preservada

- Next.js 16;
- React 19;
- TypeScript estrito;
- IndexedDB `DB_VERSION = 2`;
- migrations versionadas;
- Services;
- Repository Pattern;
- LocalRepositories;
- CSS e tokens existentes;
- Node Test Runner + `tsx` + `fake-indexeddb`.

A P3 adiciona importação CSV de notas e uma saída estática para GitHub Pages. Continua sem banco remoto, autenticação real, Supabase, DED, PWA, chat ou notificações.

## Execução

Requisito: Node.js 22.13 ou superior.

```bash
npm ci
npm run dev
```

Validação:

```bash
npm run typecheck
npm run lint
npm run test:domain
npm run build
npm run test:rendered
npm run build:pages
npm run test:pages
npm run test:pages:smoke
npm test
npm run audit:security
npm audit --omit=dev
```

## Fluxo arquitetural

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

A UI não acessa IndexedDB nem LocalRepositories diretamente.

## Academic Core da P2

### Professor

O perfil demonstrativo de Matemática deriva suas opções exclusivamente de `TeachingAssignment`.

Fluxos funcionais:

- consultar turmas atribuídas;
- consultar avaliações;
- criar avaliação;
- editar avaliação permitida;
- usar os estados `draft`, `reviewed` e `closed`;
- abrir o Painel Dinâmico;
- lançar e editar notas inline;
- usar Enter, Tab e Shift+Tab no desktop;
- lançar por avaliação em experiência mobile própria;
- filtrar por situação;
- buscar por nome ou matrícula;
- abrir visão individual do aluno;
- consultar histórico local de alterações.

Edições estruturais de Assessment com Grades preservam turma, disciplina e
período; alterações de `maxScore` não podem invalidar notas já lançadas.
Uma avaliação só pode transicionar para `closed` quando todos os estudantes
ativos da turma possuem Grade registrada. Estudantes inativos são ignorados e
`score = 0` é um lançamento válido.

Toda edição manual de nota passa por `GradeService.saveManualGrade()`, que valida contexto, status e limite e então utiliza a operação atômica `saveGradeWithAudit()`.

### Importação CSV da P3

O professor pode importar uma única avaliação por arquivo no formato UTF-8
`matricula;nota`. O fluxo oferece prévia, validação de turma/estudante/nota,
resolução explícita de conflitos e modelo para download. O parser aceita BOM e
decimais com vírgula ou ponto, limita o arquivo a 5 MB e 5.000 linhas e não
persiste seu conteúdo.

`GradeImportService` repete a autorização por `TeachingAssignment` e bloqueia
avaliações fechadas. O preview carrega estudantes da turma e Grades da avaliação
por índices, constrói mapas em memória e não consulta o IndexedDB por linha. O
Service também rejeita matrícula inválida/duplicada e score não finito mesmo
quando chamado sem o parser. Somente Grades novas ou substituídas geram `AuditEntry`
com `source = "csv"`. O lote confirmado usa uma única transação
`grades + auditEntries`; qualquer falha reverte o lote inteiro. Grades iguais ou
conflitos mantidos não são regravados nem auditados. Após o commit, somente as
Grades afetadas atualizam o snapshot compartilhado. Enquanto o batch está em
`applying`, a edição manual e novas confirmações ficam bloqueadas; a confirmação
recarrega o contexto atual em lote para não reutilizar `previousValue` da prévia.

### Coordenação

A coordenação consulta o mesmo dataset:

- dashboard com turmas, avaliações, pendências e alunos em atenção;
- médias calculadas por disciplina;
- visão de turmas e disciplinas;
- avaliações em read-only;
- mesmo Painel Dinâmico em read-only.

### Aluno

O aluno demonstrativo consulta:

- avaliações da própria turma;
- notas por disciplina;
- média parcial/final;
- situação acadêmica;
- pendências.

Todos os indicadores e médias são contextualizados por período. O dashboard do
aluno não cria uma média geral interdisciplinar.

`/plataforma/aluno/turmas` continua proibido. `Comunicados` continua placeholder.

## Cálculo acadêmico

A P2 utiliza média ponderada normalizada:

```text
normalizedScore = score / maxScore × 10

média =
Σ(normalizedScore × weight)
──────────────────────────
Σ(weight)
```

Ausência de Grade não equivale a zero.

Estados demonstrativos:

- `Pendente`: existe pelo menos uma avaliação sem Grade;
- `Regular`: lançamento completo e média maior ou igual ao limite;
- `Atenção`: lançamento completo e média abaixo do limite.

O limite está centralizado em `src/config/academic-demo.ts`:

```text
passingAverage = 6
```

Ele é explicitamente uma **regra demonstrativa do MVP**, não uma política oficial da instituição.

## IndexedDB

`DB_VERSION` permanece em **2**.

Nenhuma migration V3 foi necessária porque os índices de que a P2 precisa já existiam:

- `students.classId`;
- `assessments.classId`;
- `assessments.subjectId`;
- `grades.studentId`;
- `grades.assessmentId`;
- `grades.studentAssessment` único;
- `auditEntries.entityId`;
- índices de `teachingAssignments`.

O status legado da P1 é normalizado na camada de Service para compatibilidade:

- `scheduled` → `draft`;
- `completed` → `reviewed`.

Isso não exige mudança de schema.

## Seed

A base vazia recebe o dataset canônico completo.

Em bases existentes, a P2 faz somente complementação segura de:

- `TeachingAssignments` canônicos ausentes;
- avaliações demonstrativas canônicas ausentes;
- Grades canônicas ausentes para pares `studentId + assessmentId` ainda vazios.

Grades já existentes nunca são sobrescritas automaticamente.

O dataset permite demonstrar aluno regular, aluno em atenção e aluno com pendência, além de múltiplas avaliações de Matemática e outra disciplina.

## Auditoria

Cada mudança real manual registra:

- `actorId`;
- `action`;
- `entityType`;
- `entityId`;
- `previousValue`;
- `newValue`;
- `source = "manual"`;
- `timestamp`.

Confirmar novamente o mesmo valor não cria nova auditoria.

Após o commit, a Grade é aplicada incrementalmente ao snapshot compartilhado.
O lançamento não executa seed nem recarga integral do dataset.

O snapshot global não carrega `auditEntries`. O histórico permanece append-only
no IndexedDB e é consultado sob demanda por `entityId` na visão individual.

## Integridade e recuperação local

Depois de seed e carga, a inicialização valida referências de estudantes,
avaliações e notas, compatibilidade de turma, limites de pontuação, `maxScore`,
`weight`, período, tipo e status. A validação não corrige nem apaga dados.

Quando encontra inconsistência, a plataforma preserva a base e informa:
`Os dados locais da demonstração estão inconsistentes.` A restauração do
dataset canônico é uma ação separada, com aviso e confirmação explícita de que
as alterações locais serão apagadas.

`Tentar novamente` executa novamente o fluxo completo `seed + load + validate`.
Isso ocorre somente na inicialização/retry; o hot path de Grade segue
incremental.

## Responsividade

Desktop prioriza grade tabular e navegação por teclado.

Em telas pequenas, o lançamento muda para uma estrutura por avaliação com:

- contexto visível;
- lista vertical de estudantes;
- `inputMode="decimal"`;
- feedback de edição/salvamento/erro;
- mesmo pipeline de Service e persistência do desktop.

A importação CSV também reorganiza campos e ações em uma coluna nas larguras
mobile; nenhum controle essencial depende de hover.

## GitHub Pages

O build Vinext/Cloudflare permanece em `npm run build`. A saída adicional usa:

```bash
npm run build:pages
npm run test:pages
npm run test:pages:smoke
npm run serve:pages
```

O alvo Pages ativa condicionalmente `output: "export"`, `trailingSlash`, imagens
sem otimização de servidor e um `basePath` derivado de `GITHUB_REPOSITORY`. O
caso `owner.github.io` usa caminho vazio. Rotas acadêmicas são pré-geradas a
partir de `PROFILE_CAPABILITIES`; `/plataforma/aluno/turmas` não é exportada.
Assets públicos usam o mesmo helper de base path. O artifact fica em `out/`.
Na execução local, os scripts Pages usam o project site demonstrativo
`/ordem-plataforma-progresso`; no Actions, o nome real continua derivado de
`GITHUB_REPOSITORY`. O smoke sobe `out/` por HTTP e valida rotas, refresh direto,
404 de rotas proibidas e os assets essenciais.

O workflow `.github/workflows/deploy-pages.yml` executa auditoria de produção,
typecheck, lint, testes, os dois builds e validação do artifact antes das actions
oficiais de publicação. O job `build` termina e envia o artifact antes do job
`deploy`, que sozinho utiliza o environment protegido `github-pages`. Nenhum
secret da aplicação é necessário.

O hero institucional usa `public/assets/escola-campus.webp` como background
responsivo, com overlay azul translúcido e caminho compatível com `basePath`.

## Segurança da P3

As dependências de runtime foram atualizadas de forma controlada. Em 19/08/2026,
`npm audit --omit=dev` retornou zero vulnerabilidades. O audit completo ainda
reporta dois advisories high exclusivamente no caminho de tooling
`vinext → image-size`; a classificação detalhada está em
`docs/ARCHITECTURE_P3.md`. Não foi
utilizado `npm audit fix --force`.

## Documentação

- [Arquitetura P1](docs/ARCHITECTURE_P1.md)
- [Arquitetura P2](docs/ARCHITECTURE_P2.md)
- [Arquitetura P3](docs/ARCHITECTURE_P3.md)
- [Escopo e estado da P3](docs/P3_SCOPE.md)

## Estado operacional

O código e o artifact local estão preparados para publicação. O deploy real no
repositório GitHub, o smoke test pós-deploy e a validação manual em Safari/iPhone
dependem de ambiente externo e não são executados automaticamente por este
repositório local.
