# Arquitetura da P2 — Academic Core + Painel Dinâmico de Notas

## 1. Escopo

A P2 transforma a foundation da P1 em um Academic Core funcional para demonstração do valor central da Ordem:

```text
Professor lança
      ↓
sistema valida e persiste
      ↓
médias e pendências são derivadas
      ↓
Coordenação acompanha
      ↓
Aluno consulta o mesmo dado
```

Continuam fora do escopo: CSV, importação, DED/SEE-MG, Supabase, PostgreSQL, autenticação real, RLS, geração/correção de provas, impressão, comunicação funcional, notificações, reuniões, PWA, IA e dados reais.

## 2. Arquitetura preservada

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

Responsabilidades:

- **UI:** apresentação, foco, captura de entrada, feedback e responsividade;
- **Services/domínio:** autorização demonstrativa por `TeachingAssignment`, validação, lifecycle e orquestração;
- **funções puras:** cálculos, parsing, filtros e navegação;
- **Repositories:** consulta e persistência;
- **IndexedDB:** fonte local persistente.

Nenhum componente React abre ou consulta IndexedDB diretamente.

## 3. Schema e DB_VERSION

`DB_VERSION = 2` foi preservado.

A P2 não precisa de migration V3 porque a P1 já fornece os índices usados pelos fluxos:

```text
students.classId
assessments.classId
assessments.subjectId
grades.studentId
grades.assessmentId
grades.studentAssessment [studentId, assessmentId] UNIQUE
auditEntries.entityId
teachingAssignments.teacherId
teachingAssignments.classId
teachingAssignments.subjectId
teachingAssignments.teacherClassSubject UNIQUE
```

`AssessmentRepository.getByClassAndSubject()` utiliza o índice de turma e reduz em memória somente o conjunto já contextualizado. Não há `getAll().filter()` de Grades para montar o Gradebook.

## 4. Compatibilidade de Assessment status

A semântica canônica da P2 é:

```text
draft     → Rascunho
reviewed  → Conferido
closed    → Fechado
```

Bases P1 podem conter valores legados:

```text
scheduled → draft
completed → reviewed
```

A normalização ocorre em `AssessmentService`. Como não existe alteração estrutural do IndexedDB, não foi criada migration de schema somente para trocar valores.

Regras:

- `draft`: lançamento e edição permitidos;
- `reviewed`: consulta e edição ainda permitidos no MVP;
- `closed`: edição normal de Assessment já fechado e edição de Grade são bloqueadas na camada de Service.

Não existe fluxo administrativo de reabertura na P2.

## 5. TeachingAssignment como fonte canônica

O professor demonstrativo de Matemática usa `teacher-math`.

As opções de turma/disciplina em:

- Turmas;
- Avaliações;
- Gradebook;

são derivadas de `TeachingAssignment`.

`AssessmentService.create/update()` valida:

1. nome;
2. `maxScore > 0`;
3. `weight > 0`;
4. data;
5. turma existente;
6. disciplina existente;
7. `TeachingAssignment` ativo do professor.

`GradeService.saveManualGrade()` também valida o assignment associado à avaliação. Assim, a restrição não depende apenas da UI.

## 6. Consulta do Gradebook

Para o contexto explícito:

```text
Turma + Disciplina + Período
```

o fluxo é:

```text
StudentService.getByClass(classId)
AssessmentService.getByClassAndSubject(classId, subjectId)
      ↓
filtra período no conjunto contextual
      ↓
GradeService.getByAssessments(assessmentIds)
      ↓
GradeRepository.getByAssessmentId() por índice
      ↓
Map studentId::assessmentId em memória
```

Uma célula não dispara consulta própria.

O lookup renderizado é O(1) pelo mapa em memória.

Alunos são ordenados alfabeticamente e avaliações por data/nome, independentemente da ordem física do IndexedDB.

## 7. Identidade da Grade

Cada célula representa exatamente:

```text
studentId + assessmentId
```

A P1 já garante:

- índice composto único;
- `upsert` preservando `id` e `createdAt`;
- consulta composta;
- ausência de duplicação.

A P2 reutiliza esse contrato.

## 8. Lançamento manual

O pipeline canônico é:

```text
GradeCell
   ↓
GradeService.saveManualGrade()
   ↓
valida Student / Assessment / TeachingAssignment / closed / score
   ↓
verifica Grade existente
   ↓
sem mudança? retorna sem auditoria
   ↓
monta Grade source="manual"
   ↓
monta AuditEntry
   ↓
GradeRepository.saveGradeWithAudit()
   ↓
transação única grades + auditEntries
```

A UI nunca chama `GradeRepository.save()`.

### Valores

`0` é uma nota válida.

Ausência de Grade significa pendência.

Entrada `8,5` é convertida para `8.5` no domínio de interação. Não há clamp silencioso.

Se o valor for inválido:

- não persiste;
- restaura a representação do valor anterior;
- exibe erro acessível;
- mantém o foco no fluxo de teclado.

A remoção de nota não foi improvisada. Limpar uma célula informa que a remoção de lançamento está fora desta P2.

## 9. Concorrência local

Cada célula possui versão local de operação para impedir que uma resposta antiga altere o feedback de uma edição posterior.

O Gradebook também mantém uma cadeia de mutações por chave `studentId::assessmentId`, garantindo que operações concorrentes da mesma célula sejam persistidas na ordem em que foram disparadas.

Não foi adicionada biblioteca de data fetching.

## 10. Teclado desktop

A lógica está isolada em função pura.

Sequência editável inclui somente avaliações não fechadas.

- **Enter:** próxima linha, mesma avaliação;
- **Tab:** próxima célula editável em ordem linha/coluna;
- **Shift + Tab:** célula editável anterior;
- limites mantêm o foco dentro do grid;
- colunas Média/Situação e labels não entram na sequência;
- `closed` é ignorada.

A célula possui `aria-label` com aluno, avaliação e valor máximo.

## 11. Mobile

A P2 não comprime a planilha.

A estrutura específica é:

```text
Turma · Disciplina
      ↓
selecionar Avaliação
      ↓
cabeçalho com máximo + status
      ↓
lista vertical de alunos
      ↓
input decimal por aluno
```

Os inputs usam `inputMode="decimal"` e o mesmo `GradeService.saveManualGrade()`.

A troca visual acontece em breakpoint próprio; a estrutura mobile existe como componente de lançamento por avaliação e não depende da tabela para definir sua interação.

## 12. Cálculo acadêmico

As funções puras vivem em `src/modules/grades/`.

### Normalização

```text
normalizedScore = score / maxScore × 10
```

### Média ponderada

```text
Σ(normalizedScore × weight)
──────────────────────────
Σ(weight)
```

Somente Grades realmente lançadas participam do numerador/denominador.

Se existir qualquer avaliação sem Grade, a média disponível é marcada como **Média parcial**, nunca como final.

### Situação

A configuração central é:

```text
ACADEMIC_DEMO_CONFIG.passingAverage = 6
```

Ela é uma **regra demonstrativa do MVP** e não representa necessariamente política oficial da escola.

Estados:

- `Pendente`: pelo menos uma avaliação sem Grade;
- `Regular`: lançamento completo e média >= `passingAverage`;
- `Atenção`: lançamento completo e média < `passingAverage`.

`recovery` é tratada como avaliação normal; não existe substituição automática de média.

### Média da turma

É derivada das médias individuais que possuem ao menos uma nota lançada. Médias parciais podem participar do indicador de acompanhamento, cuja UI explicita que utiliza as notas lançadas. O valor não é persistido.

## 13. Filtros

O Gradebook combina:

- Todos;
- Abaixo da média;
- Com pendências;
- Acima da média;
- nome parcial;
- matrícula.

Busca ignora caixa e acentos do nome.

Filtros de desempenho usam somente `ACADEMIC_DEMO_CONFIG.passingAverage`.

## 14. Feedback de persistência

Cada célula pode indicar:

```text
editando
salvando
salvo
erro
```

A tabela inteira não é bloqueada durante uma atualização.

Após persistência, o snapshot compartilhado do `AcademicDataProvider` é atualizado sem destruir o layout. Isso mantém navegações posteriores entre Professor, Coordenação e Aluno sincronizadas com o IndexedDB.

## 15. Auditoria

Cada mudança manual real registra:

```text
actorId
action
entityType
entityId
previousValue
newValue
source
timestamp
```

Primeiro lançamento:

```text
previousValue = null
newValue = score
```

Edição:

```text
previousValue = score anterior
newValue = score novo
```

Confirmar exatamente o mesmo valor retorna `changed: false` e não cria AuditEntry.

A visualização de histórico na visão individual do aluno é append-only e consulta auditoria por `entityId`.

## 16. Visão individual do aluno para professor/coordenação

O painel lateral reutiliza:

- Student;
- Assessment;
- Grade;
- cálculos acadêmicos;
- auditoria.

Apresenta:

- nome;
- matrícula;
- turma;
- avaliações;
- notas;
- média parcial/final;
- média da turma;
- situação;
- evolução cronológica simples com barra CSS;
- histórico de alterações quando existir.

Não há chart library.

## 17. Portal do aluno

`/plataforma/aluno/notas` agrupa dados por disciplina e mostra:

- avaliações;
- nota/máximo;
- pendências;
- média parcial/final;
- situação.

`/plataforma/aluno/avaliacoes` mostra:

- nome;
- disciplina;
- data;
- tipo;
- valor máximo;
- status;
- nota quando disponível.

Ambas são read-only.

`/plataforma/aluno/turmas` continua 404 via política centralizada.

`Comunicados` continua placeholder.

## 18. Coordenação

O dashboard deriva:

- turmas;
- avaliações;
- notas pendentes;
- alunos em atenção;
- resumo de médias por disciplina.

Turmas permite selecionar uma classe e ver, por disciplina:

- média;
- avaliações;
- pendências;
- alunos em atenção.

Avaliações são read-only.

Notas reutiliza o mesmo `GradebookPage` com `readOnly=true`.

Não existe tabela acadêmica paralela.

## 19. Seed demonstrativo

A base vazia recebe fixtures completas.

Para uma base P1 existente, a complementação P2 é conservadora:

- adiciona assignments canônicos ausentes;
- adiciona avaliações canônicas ausentes;
- adiciona somente Grades cujo par lógico ainda não exista.

Nunca regrava Grade existente.

O dataset canônico contém:

- cenário regular;
- cenário de atenção;
- cenário pendente;
- três avaliações de Matemática no 2º A;
- avaliações em Português e Física;
- duas avaliações de Matemática no 2º B.

Todos os nomes permanecem fictícios.

## 20. Empty/loading/error states

A plataforma preserva `loading`, `success`, `empty` e `error` no provider.

Módulos acadêmicos adicionam estados para:

- nenhuma avaliação;
- nenhum resultado de filtro;
- nenhuma auditoria;
- falha de contexto;
- avaliação fechada.

Falha de salvamento de Grade não é apresentada como sucesso.

## 21. Funcionalidades adiadas

Não são bugs da P2:

- remoção auditada de Grade;
- fluxo administrativo de reabertura;
- CSV/importação;
- conflitos;
- DED/SEE-MG;
- regras institucionais definitivas de aprovação/recuperação;
- autenticação/RLS;
- backend remoto;
- relatórios avançados;
- geração/correção de provas;
- comunicação/notificações;
- impressão;
- PWA;
- IA.
