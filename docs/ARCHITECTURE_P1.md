# Arquitetura da P1

## 1. Objetivo e limite

A P1 estabelece a foundation técnica, estrutural e visual da **Ordem — Plataforma de Progresso**. O hardening pré-P2 corrige evolução do banco, integridade de notas, permissões demonstrativas, seed, modelagem docente, build e navegação sem antecipar o Painel Dinâmico de Notas.

O sistema permanece um monólito modular com persistência client-side em IndexedDB.

## 2. Contextos do produto

### Site institucional

Rota `/`:

- apresenta escola, princípios e Plataforma Ordem;
- utiliza a identidade centralizada;
- publica somente contatos demonstrativos identificados como não oficiais;
- direciona para `/plataforma`.

### Plataforma acadêmica

Rota `/plataforma`:

- seleciona Professor, Coordenação ou Aluno;
- não autentica, cria sessão ou limpa a base;
- permite retornar por `Trocar perfil` em desktop e mobile.

`/plataforma/{profile}` é o dashboard inicial. Os módulos ficam em `/plataforma/{profile}/{section}`.

## 3. Fluxo de dependências

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

Regras preservadas:

1. componentes consomem o `AcademicDataProvider` e Services;
2. Services dependem somente de contratos de Repository;
3. `Local*Repository` encapsula as APIs específicas do IndexedDB;
4. `src/database` concentra abertura, versão, migrations e seed;
5. regras acadêmicas não vivem em componentes React.

Não há chamada a `indexedDB.open()` nem dependência de `LocalRepository` na UI.

## 4. Capacidades por perfil

A fonte única é `src/config/profile-capabilities.ts`:

```text
Professor
├── Turmas
├── Avaliações
└── Notas

Coordenação
├── Turmas
├── Avaliações
└── Notas

Aluno
├── Avaliações
├── Notas
└── Comunicados
```

Sidebar, drawer mobile, bottom navigation, `QuickAccess` e o guard da rota dinâmica derivam `PROFILE_CAPABILITIES`. O aluno pode ver sua turma como dado cadastral no dashboard, mas não recebe acesso ao módulo Turmas. Acesso direto a `/plataforma/aluno/turmas` chama `notFound()`.

`Comunicados` é somente um placeholder demonstrativo e não possui mensagens, backend, notificações, criação ou realtime.

### Limite de segurança

O controle de navegação por perfil nesta P1 **não é autorização institucional**. O provider local ainda pode carregar o dataset fictício completo. Na produção futura, Supabase Auth e PostgreSQL com RLS deverão realizar autenticação e isolamento real.

## 5. Domínio acadêmico

Entidades em `src/types/academic.ts`:

- `Student`;
- `Teacher`;
- `TeachingAssignment`;
- `SchoolClass`;
- `Subject`;
- `Assessment`;
- `Grade`;
- `AuditEntry`;
- `MetadataRecord`.

`Student.registration` contém exatamente oito dígitos, é validada por Service e possui índice único.

### Modelagem docente

`Teacher` contém `id`, `name` e `active`. A relação canônica substitui os vetores ambíguos `subjectIds[]` e `classIds[]`:

```text
Teacher
   ↓
TeachingAssignment
  ↙             ↘
Class         Subject
```

`TeachingAssignment` explicita `teacherId`, `classId`, `subjectId` e `active`. As fixtures canônicas são:

- Professor Demo — Matemática → 2º A / Matemática;
- Professor Demo — Matemática → 2º B / Matemática;
- Professora Demo — Português → 2º A / Português;
- Professora Demo — Português → 2º B / Português;
- Professor Demo — Física → 2º A / Física.

O dashboard do professor deriva contagens a partir dessas atribuições e calcula estudantes pelas turmas atribuídas.

## 6. IndexedDB V2 e migrations

```text
DB_NAME    = ordem-platform
DB_VERSION = 2
```

`openOrdemDatabase()` encaminha `oldVersion` e `newVersion` a `applyMigrations()` durante `onupgradeneeded`:

```text
Abrir banco
   ↓
onupgradeneeded
   ↓
oldVersion
   ↓
executar somente migrations pendentes
```

O helper de migration cria uma store ausente ou obtém uma store existente pela transação de upgrade. Assim, índices podem ser acrescentados sem apagar o banco.

### Migration V1

Representa o schema original:

```text
students
teachers
classes
subjects
assessments
grades
auditEntries
metadata
```

Também recria os índices originais de matrícula, turma, situação do professor, avaliação, nota e auditoria.

### Migration V2

Acrescenta:

- `grades.studentAssessment` em `[studentId, assessmentId]`, único;
- store `teachingAssignments`;
- índices `teacherId`, `classId` e `subjectId`;
- `teachingAssignments.teacherClassSubject` em `[teacherId, classId, subjectId]`, único.

Antes do índice único de notas ser criado em uma store existente, a migration percorre os registros e detecta combinações duplicadas. Se houver inconsistência, a transação de upgrade é abortada com erro explícito. Não há escolha arbitrária nem exclusão silenciosa.

Migrations nunca chamam `deleteDatabase()`. A remoção existe apenas no reset demonstrativo explícito.

## 7. GradeRepository e atomicidade

`GradeRepository` fornece:

- `getByStudentId` pelo índice `studentId`;
- `getByAssessmentId` pelo índice `assessmentId`;
- `getByStudentAndAssessment` pelo índice composto `studentAssessment`;
- `upsert` pela identidade lógica estudante + avaliação;
- `saveGradeWithAudit`.

`GradeService` expõe equivalentes orientados à aplicação: `getByStudent`, `getByAssessment`, `getByStudentAndAssessment`, `upsert` e `saveGradeWithAudit`. Nenhum método carrega todas as notas para então filtrar.

O `upsert` reutiliza o ID e o `createdAt` do registro existente. O índice único impede um segundo registro para a mesma combinação.

`saveGradeWithAudit` abre somente uma transação `readwrite` com `grades` e `auditEntries`:

```text
Grade salva + AuditEntry salva = commit
qualquer operação falha          = rollback das duas
```

Não foi introduzido Unit of Work genérico e não existe UI de edição na P1.

## 8. Repositories e Services

Contratos:

- `StudentRepository`;
- `TeacherRepository`;
- `ClassRepository`;
- `SubjectRepository`;
- `AssessmentRepository`;
- `GradeRepository`;
- `AuditRepository`;
- `TeachingAssignmentRepository`.

Services disponíveis à P2:

- `StudentService`;
- `TeacherService`;
- `ClassService`;
- `SubjectService`;
- `AssessmentService`;
- `GradeService`;
- `AuditService`;
- `TeachingAssignmentService`.

`src/config/services.ts` é o ponto de composição. O `AcademicDataProvider` inclui `teachingAssignments` no `AcademicDataset`.

## 9. Seed e preservação de dados

`SEED_VERSION` permanece como metadata informativa. Ela não é gatilho de sobrescrita.

```text
Abrir/migrar banco
   ↓
Base acadêmica vazia?
   ├── sim → inserir dataset demonstrativo completo
   └── não → preservar registros existentes
                  ↓
          adicionar somente TeachingAssignments
          canônicos ausentes e referencialmente válidos
```

Consequências:

- primeiro acesso retorna `seeded: true`;
- inicializações seguintes retornam `seeded: false`;
- mudança de metadata não regrava students, assessments, grades ou auditEntries;
- uma V1 existente recebe apenas os dados referenciais ausentes da nova store;
- alterações locais de nota permanecem intactas.

`resetDemoDatabase()` é uma operação separada: apaga o banco, abre novamente, executa migrations e aplica o seed canônico. Ela nunca é chamada automaticamente, inclusive durante `Trocar perfil`.

## 10. Identidade visual

`src/config/branding.ts` define o caminho único do asset e os textos de contexto. `SchoolBrand` é reutilizado no header institucional, footer, seletor, shell e apresentação da plataforma.

O asset oficial recebido fica em `public/branding/logo_ordem_e_progresso.png`. Não existem símbolos `O` ou `OE` usados como marca improvisada. Uma eventual troca futura do arquivo exige alteração somente em `SCHOOL_LOGO_SRC`; se o valor for `null`, o componente mantém a identidade textual.

O favicon de template não é utilizado como identidade institucional.

## 11. Responsividade e acessibilidade

- sidebar em desktop e drawer acessível em telas menores;
- bottom navigation com quatro itens por perfil: Início + três capacidades;
- `Trocar perfil` aparece próximo ao perfil atual no desktop e dentro da navegação mobile;
- contato em duas colunas no desktop e uma no mobile;
- links e botões nativos, foco visível, `aria-label`, landmarks e alvos de toque;
- nenhuma ação essencial depende de hover.

## 12. Estratégia futura para Supabase

```text
Hoje

UI
 ↓
Services
 ↓
Repository Interfaces
 ↓
LocalRepositories
 ↓
IndexedDB

Futuro

UI
 ↓
Services
 ↓
Repository Interfaces
 ↓
SupabaseRepositories
 ↓
PostgreSQL + RLS
```

A evolução deverá implementar os mesmos contratos e trocar somente a composição. Nenhuma API específica de IndexedDB atravessa a fronteira dos Services.

## 13. Testes críticos

A suíte cobre:

- permissions e direct-route guard;
- profile switching;
- migrations V1 → V2 e preservação;
- falha explícita para duplicatas antigas;
- unicidade, upsert e consultas indexadas de Grade;
- commit e rollback de Grade + Audit;
- primeiro seed, segundo seed, metadata divergente e reset;
- população referencial de `teachingAssignments` em base existente;
- relações docentes e contagens derivadas;
- integridade referencial das fixtures e matrícula única;
- contato institucional e rotas renderizadas.

## 14. Fora do escopo

Permanecem deliberadamente ausentes: tabela dinâmica de notas, edição inline, navegação por células, cálculo de médias, filtros da P2, CSV, DED, autenticação, RLS, banco remoto, portal completo do aluno, chat, mensagens, notificações, impressão e geração/correção de provas.

## 14. Evolução para P2

A P1 permanece como registro da foundation que antecede o Academic Core. A implementação subsequente da P2 não reescreveu as migrations V1/V2 e manteve `DB_VERSION = 2`.

Os índices já criados pela P1 foram suficientes para consultas contextuais de estudantes, avaliações, notas, auditoria e TeachingAssignments. A semântica de status de Assessment da P2 (`draft`, `reviewed`, `closed`) é normalizada no Service para compatibilidade com fixtures P1 legadas (`scheduled`, `completed`), sem alteração de schema.

Detalhes da evolução estão em `docs/ARCHITECTURE_P2.md`.
