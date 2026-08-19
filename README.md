# Ordem — Plataforma de Progresso

Implementação da **P2 — Academic Core + Painel Dinâmico de Notas** sobre a foundation consolidada da P1.

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

A P2 não introduz banco remoto, autenticação real, Supabase, CSV, DED, PWA, chat, notificações ou integrações futuras.

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
npm test
npm run audit:security
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

Toda edição manual de nota passa por `GradeService.saveManualGrade()`, que valida contexto, status e limite e então utiliza a operação atômica `saveGradeWithAudit()`.

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

## Responsividade

Desktop prioriza grade tabular e navegação por teclado.

Em telas pequenas, o lançamento muda para uma estrutura por avaliação com:

- contexto visível;
- lista vertical de estudantes;
- `inputMode="decimal"`;
- feedback de edição/salvamento/erro;
- mesmo pipeline de Service e persistência do desktop.

## Documentação

- [Arquitetura P1](docs/ARCHITECTURE_P1.md)
- [Arquitetura P2](docs/ARCHITECTURE_P2.md)
