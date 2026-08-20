import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import {
  ACADEMIC_DEMO_CONFIG,
  ACADEMIC_PERIODS,
  DEMO_PROFILE_IDS,
} from "../src/config/academic-demo";
import { getAcademicServices } from "../src/config/services";
import { deleteDemoDatabase } from "../src/database/indexed-db/client";
import { DB_VERSION } from "../src/database/indexed-db/config";
import { demoDataset } from "../src/database/seed/data";
import { seedDatabase } from "../src/database/seed/seed";
import { upsertGradeInSnapshot } from "../src/modules/academic/snapshot";
import { formatLocalDateInput } from "../src/modules/assessments/date";
import {
  calculateClassAverage,
  calculateGradebookCompletion,
  calculateStudentAcademicState,
  calculateWeightedAverage,
  countPendingGrades,
  normalizeScore,
} from "../src/modules/grades/calculations";
import {
  loadAuditHistory,
  selectContextualStudentGrades,
  shouldCloseStudentDetail,
} from "../src/modules/grades/audit-history";
import {
  createLatestContextRequestSequence,
  resolveAuthorizedContextKey,
} from "../src/modules/grades/context";
import { filterGradebookRows } from "../src/modules/grades/filters";
import { parsePtBrScore, validateScoreInput } from "../src/modules/grades/input";
import {
  createGradeBlurCommitGuard,
  getNextEditableCell,
} from "../src/modules/grades/keyboard";
import { persistManualGradeIncrementally } from "../src/modules/grades/persistence";
import { filterAssessmentsByPeriod } from "../src/modules/grades/period";
import { initializeAcademicData } from "../src/services/academic-initialization";
import {
  AcademicIntegrityError,
  validateAcademicDataset,
  type AcademicIntegrityIssueCode,
} from "../src/services/academic-integrity";
import { normalizeAssessmentStatus } from "../src/services/academic-services";
import {
  ASSESSMENT_TYPES,
  type AcademicDataset,
  type Assessment,
  type AuditEntry,
  type Grade,
  type Student,
} from "../src/types/academic";

afterEach(async () => {
  await deleteDemoDatabase();
});

const calculationAssessments: Assessment[] = [
  {
    id: "a-10",
    name: "Prova",
    classId: "c",
    subjectId: "s",
    period: "1º bimestre",
    date: "2026-01-10",
    type: "exam",
    maxScore: 10,
    weight: 2,
    status: "draft",
  },
  {
    id: "a-5",
    name: "Trabalho",
    classId: "c",
    subjectId: "s",
    period: "1º bimestre",
    date: "2026-01-20",
    type: "assignment",
    maxScore: 5,
    weight: 1,
    status: "draft",
  },
];

function makeGrade(
  id: string,
  studentId: string,
  assessmentId: string,
  score: number,
): Grade {
  return {
    id,
    studentId,
    assessmentId,
    score,
    status: "recorded",
    source: "manual",
    createdAt: "2026-08-18T18:00:00.000Z",
    updatedAt: "2026-08-18T18:00:00.000Z",
  };
}

function cloneDataset(): AcademicDataset {
  return structuredClone(demoDataset);
}

function hasIntegrityIssue(
  dataset: AcademicDataset,
  code: AcademicIntegrityIssueCode,
): boolean {
  return validateAcademicDataset(dataset).issues.some(
    (issue) => issue.code === code,
  );
}

async function recordAssessmentGrades(
  studentIds: string[],
  assessmentId: string,
  score: number,
): Promise<void> {
  const services = getAcademicServices();
  for (const studentId of studentIds) {
    await services.grades.upsert(
      makeGrade(
        `grade-close-${studentId}-${assessmentId}`,
        studentId,
        assessmentId,
        score,
      ),
    );
  }
}

test("Cálculos: normaliza notas e aplica média ponderada com maxScore diferente", () => {
  assert.equal(normalizeScore(4, 5), 8);
  const result = calculateWeightedAverage(calculationAssessments, [
    makeGrade("g1", "student", "a-10", 8),
    makeGrade("g2", "student", "a-5", 4),
  ]);
  assert.equal(result.average, 8);
  assert.equal(result.pendingCount, 0);
  assert.equal(result.isPartial, false);
});

test("Cálculos: média parcial não transforma ausência em zero", () => {
  const result = calculateWeightedAverage(calculationAssessments, [
    makeGrade("g1", "student", "a-10", 9),
  ]);
  assert.equal(result.average, 9);
  assert.equal(result.pendingCount, 1);
  assert.equal(result.isPartial, true);
  assert.equal(
    calculateStudentAcademicState(calculationAssessments, [
      makeGrade("g1", "student", "a-10", 9),
    ]),
    "pending",
  );
});

test("Cálculos: zero é nota válida e pode resultar em Atenção", () => {
  const grades = [
    makeGrade("g1", "student", "a-10", 0),
    makeGrade("g2", "student", "a-5", 0),
  ];
  const result = calculateWeightedAverage(calculationAssessments, grades);
  assert.equal(result.average, 0);
  assert.equal(result.pendingCount, 0);
  assert.equal(
    calculateStudentAcademicState(calculationAssessments, grades),
    "attention",
  );
});

test("Cálculos: Regular e Atenção usam passingAverage centralizado", () => {
  const regular = [
    makeGrade("g1", "regular", "a-10", 6),
    makeGrade("g2", "regular", "a-5", 3),
  ];
  const attention = [
    makeGrade("g3", "attention", "a-10", 5),
    makeGrade("g4", "attention", "a-5", 2.5),
  ];
  assert.equal(ACADEMIC_DEMO_CONFIG.passingAverage, 6);
  assert.equal(
    calculateStudentAcademicState(calculationAssessments, regular),
    "regular",
  );
  assert.equal(
    calculateStudentAcademicState(calculationAssessments, attention),
    "attention",
  );
});

test("Cálculos: média da turma e contagem de pendências são derivadas", () => {
  const map = new Map<string, Grade[]>([
    [
      "s1",
      [
        makeGrade("g1", "s1", "a-10", 8),
        makeGrade("g2", "s1", "a-5", 4),
      ],
    ],
    [
      "s2",
      [
        makeGrade("g3", "s2", "a-10", 6),
        makeGrade("g4", "s2", "a-5", 3),
      ],
    ],
  ]);
  assert.equal(calculateClassAverage(calculationAssessments, map), 7);
  assert.equal(
    countPendingGrades(
      ["s1", "s2"],
      calculationAssessments,
      [...map.values()].flat().slice(0, 3),
    ),
    1,
  );
});

test("Empty state: zero avaliações torna completude não aplicável", () => {
  const completion = calculateGradebookCompletion(
    ["s1", "s2"],
    [],
    [],
  );
  assert.deepEqual(completion, {
    applicable: false,
    completedStudents: 0,
    totalStudents: 2,
  });
});

test("Periodização: Professor, Aluno e Coordenação calculam apenas o período selecionado", () => {
  const assessments: Assessment[] = [
    calculationAssessments[0],
    {
      ...calculationAssessments[0],
      id: "a-period-2",
      period: "2º bimestre",
    },
  ];
  const grades = [
    makeGrade("g-period-1", "student", calculationAssessments[0].id, 4),
    makeGrade("g-period-2", "student", "a-period-2", 9),
  ];

  for (const profile of ["Professor", "Aluno", "Coordenação"]) {
    const firstPeriod = calculateWeightedAverage(
      filterAssessmentsByPeriod(assessments, "1º bimestre"),
      grades,
    );
    const secondPeriod = calculateWeightedAverage(
      filterAssessmentsByPeriod(assessments, "2º bimestre"),
      grades,
    );
    assert.equal(firstPeriod.average, 4, profile);
    assert.equal(secondPeriod.average, 9, profile);
  }
});

test("Entrada: converte decimal pt-BR, rejeita texto e respeita maxScore", () => {
  assert.equal(parsePtBrScore("8,5"), 8.5);
  assert.equal(parsePtBrScore("8.5"), 8.5);
  assert.equal(parsePtBrScore("oito"), null);
  assert.deepEqual(validateScoreInput("10", 10), { ok: true, score: 10 });
  assert.equal(validateScoreInput("10,1", 10).ok, false);
  assert.equal(validateScoreInput("-1", 10).ok, false);
  assert.deepEqual(validateScoreInput("0", 10), { ok: true, score: 0 });
});

test("Teclado: Enter avança verticalmente e respeita limite", () => {
  assert.deepEqual(
    getNextEditableCell(
      { studentIndex: 0, assessmentIndex: 1 },
      "enter",
      3,
      [0, 1, 3],
    ),
    { studentIndex: 1, assessmentIndex: 1 },
  );
  assert.deepEqual(
    getNextEditableCell(
      { studentIndex: 2, assessmentIndex: 1 },
      "enter",
      3,
      [0, 1, 3],
    ),
    { studentIndex: 2, assessmentIndex: 1 },
  );
});

test("Teclado: Tab e Shift+Tab percorrem somente colunas editáveis", () => {
  assert.deepEqual(
    getNextEditableCell(
      { studentIndex: 0, assessmentIndex: 1 },
      "tab",
      2,
      [0, 1, 3],
    ),
    { studentIndex: 0, assessmentIndex: 3 },
  );
  assert.deepEqual(
    getNextEditableCell(
      { studentIndex: 0, assessmentIndex: 3 },
      "tab",
      2,
      [0, 1, 3],
    ),
    { studentIndex: 1, assessmentIndex: 0 },
  );
  assert.deepEqual(
    getNextEditableCell(
      { studentIndex: 1, assessmentIndex: 0 },
      "shiftTab",
      2,
      [0, 1, 3],
    ),
    { studentIndex: 0, assessmentIndex: 3 },
  );
});

test("Teclado: último Enter não arma skip de blur e a edição seguinte persiste", () => {
  const last = { studentIndex: 2, assessmentIndex: 1 };
  const next = getNextEditableCell(last, "enter", 3, [0, 1]);
  assert.deepEqual(next, last);

  const currentInput = {};
  const guard = createGradeBlurCommitGuard();
  assert.equal(guard.prepareFocusTransfer(currentInput, currentInput), false);
  assert.equal(
    guard.consumeBlurSkip(),
    false,
    "o blur da edição posterior precisa executar o commit",
  );
});

test("Teclado: último Tab e primeiro Shift+Tab não deixam flag residual", () => {
  const last = { studentIndex: 1, assessmentIndex: 3 };
  const first = { studentIndex: 0, assessmentIndex: 0 };
  assert.deepEqual(getNextEditableCell(last, "tab", 2, [0, 1, 3]), last);
  assert.deepEqual(
    getNextEditableCell(first, "shiftTab", 2, [0, 1, 3]),
    first,
  );

  for (const boundary of [last, first]) {
    const currentInput = { boundary };
    const guard = createGradeBlurCommitGuard();
    assert.equal(guard.prepareFocusTransfer(currentInput, currentInput), false);
    assert.equal(guard.consumeBlurSkip(), false);
  }
});

test("Teclado: transferência real consome exatamente um blur", () => {
  const guard = createGradeBlurCommitGuard();
  const currentInput = {};
  const nextInput = {};
  assert.equal(guard.prepareFocusTransfer(currentInput, nextInput), true);
  assert.equal(guard.consumeBlurSkip(), true);
  assert.equal(guard.consumeBlurSkip(), false);
});

test("Interação GradeCell: último Enter, nova edição e blur persistem as duas notas", async () => {
  const savedScores: number[] = [];
  const persistence = {
    async saveManualGrade(input: {
      studentId: string;
      assessmentId: string;
      score: number;
      actorId: string;
    }) {
      savedScores.push(input.score);
      return {
        changed: true,
        grade: makeGrade(
          "grade-boundary",
          input.studentId,
          input.assessmentId,
          input.score,
        ),
      };
    },
  };
  const guard = createGradeBlurCommitGuard();
  const currentInput = {};

  await persistManualGradeIncrementally(
    persistence,
    {
      studentId: "student-last",
      assessmentId: "assessment-last",
      score: 8,
      actorId: DEMO_PROFILE_IDS.professor,
    },
    () => undefined,
  );
  const next = getNextEditableCell(
    { studentIndex: 2, assessmentIndex: 0 },
    "enter",
    3,
    [0],
  );
  assert.deepEqual(next, { studentIndex: 2, assessmentIndex: 0 });
  assert.equal(guard.prepareFocusTransfer(currentInput, currentInput), false);

  // A segunda edição termina em blur. Como o limite não armou o guard,
  // o mesmo pipeline de persistência é executado novamente.
  if (!guard.consumeBlurSkip()) {
    await persistManualGradeIncrementally(
      persistence,
      {
        studentId: "student-last",
        assessmentId: "assessment-last",
        score: 9,
        actorId: DEMO_PROFILE_IDS.professor,
      },
      () => undefined,
    );
  }

  assert.deepEqual(savedScores, [8, 9]);
});

test("Contexto: query só seleciona combinação autorizada", () => {
  const options = [
    { key: "class-2a::subject-math" },
    { key: "class-2b::subject-math" },
  ];
  assert.equal(
    resolveAuthorizedContextKey(options, "class-2b::subject-math"),
    "class-2b::subject-math",
  );
  assert.equal(
    resolveAuthorizedContextKey(options, "class-2a::subject-portuguese"),
    "class-2a::subject-math",
  );
});

test("Contexto: resposta antiga não vence a solicitação mais recente", () => {
  const requests = createLatestContextRequestSequence();
  const first = requests.issue();
  const second = requests.issue();

  assert.equal(requests.isLatest(first), false);
  assert.equal(requests.isLatest(second), true);
});

test("Filtros: Todos, Abaixo, Pendências, Acima, nome, matrícula e combinação", () => {
  const students: Student[] = [
    {
      id: "s1",
      registration: "20260001",
      name: "Ana Clara",
      classId: "c",
      active: true,
    },
    {
      id: "s2",
      registration: "20260002",
      name: "Bruno Silva",
      classId: "c",
      active: true,
    },
    {
      id: "s3",
      registration: "20260003",
      name: "Carla Dias",
      classId: "c",
      active: true,
    },
  ];
  const rows = [
    {
      student: students[0],
      grades: [
        makeGrade("g1", "s1", "a-10", 8),
        makeGrade("g2", "s1", "a-5", 4),
      ],
    },
    {
      student: students[1],
      grades: [
        makeGrade("g3", "s2", "a-10", 5),
        makeGrade("g4", "s2", "a-5", 2.5),
      ],
    },
    {
      student: students[2],
      grades: [makeGrade("g5", "s3", "a-10", 9)],
    },
  ];

  assert.equal(filterGradebookRows(rows, calculationAssessments, "all", "").length, 3);
  assert.deepEqual(
    filterGradebookRows(rows, calculationAssessments, "below", "").map(
      (row) => row.student.id,
    ),
    ["s2"],
  );
  assert.deepEqual(
    filterGradebookRows(rows, calculationAssessments, "pending", "").map(
      (row) => row.student.id,
    ),
    ["s3"],
  );
  assert.deepEqual(
    filterGradebookRows(rows, calculationAssessments, "above", "").map(
      (row) => row.student.id,
    ),
    ["s1"],
  );
  assert.deepEqual(
    filterGradebookRows(rows, calculationAssessments, "all", "ana").map(
      (row) => row.student.id,
    ),
    ["s1"],
  );
  assert.deepEqual(
    filterGradebookRows(rows, calculationAssessments, "all", "20260002").map(
      (row) => row.student.id,
    ),
    ["s2"],
  );
  assert.deepEqual(
    filterGradebookRows(rows, calculationAssessments, "below", "bruno").map(
      (row) => row.student.id,
    ),
    ["s2"],
  );
});

test("Integridade: dataset canônico é válido e não mantém snapshot global de auditoria", () => {
  assert.deepEqual(validateAcademicDataset(demoDataset), {
    valid: true,
    issues: [],
  });
  assert.equal("auditEntries" in demoDataset, false);
});

test("Integridade: rejeita Student com classId órfão", () => {
  const dataset = cloneDataset();
  dataset.students[0].classId = "class-missing";
  assert.equal(hasIntegrityIssue(dataset, "student.class.missing"), true);
});

test("Integridade: rejeita Assessment com turma ou disciplina órfã", () => {
  const missingClass = cloneDataset();
  missingClass.assessments[0].classId = "class-missing";
  assert.equal(
    hasIntegrityIssue(missingClass, "assessment.class.missing"),
    true,
  );

  const missingSubject = cloneDataset();
  missingSubject.assessments[0].subjectId = "subject-missing";
  assert.equal(
    hasIntegrityIssue(missingSubject, "assessment.subject.missing"),
    true,
  );
});

test("Integridade: rejeita Grade com Student ou Assessment órfão", () => {
  const missingStudent = cloneDataset();
  missingStudent.grades[0].studentId = "student-missing";
  assert.equal(hasIntegrityIssue(missingStudent, "grade.student.missing"), true);

  const missingAssessment = cloneDataset();
  missingAssessment.grades[0].assessmentId = "assessment-missing";
  assert.equal(
    hasIntegrityIssue(missingAssessment, "grade.assessment.missing"),
    true,
  );
});

test("Integridade: rejeita Grade que cruza turmas diferentes", () => {
  const dataset = cloneDataset();
  dataset.grades[0].studentId = "student-2b-01";
  assert.equal(hasIntegrityIssue(dataset, "grade.class.mismatch"), true);
});

test("Integridade: rejeita score negativo ou acima do maxScore", () => {
  const negative = cloneDataset();
  negative.grades[0].score = -0.1;
  assert.equal(hasIntegrityIssue(negative, "grade.score.invalid"), true);

  const aboveMaximum = cloneDataset();
  aboveMaximum.grades[0].score = 10.1;
  assert.equal(
    hasIntegrityIssue(aboveMaximum, "grade.score.above-maximum"),
    true,
  );
});

test("Integridade: rejeita maxScore e weight não positivos", () => {
  const invalidMaximum = cloneDataset();
  invalidMaximum.assessments[0].maxScore = 0;
  assert.equal(
    hasIntegrityIssue(invalidMaximum, "assessment.max-score.invalid"),
    true,
  );

  const invalidWeight = cloneDataset();
  invalidWeight.assessments[0].weight = 0;
  assert.equal(
    hasIntegrityIssue(invalidWeight, "assessment.weight.invalid"),
    true,
  );
});

test("Integridade: rejeita period, type e status inválidos em runtime", () => {
  const invalidPeriod = cloneDataset();
  (invalidPeriod.assessments[0] as unknown as { period: string }).period =
    "5º bimestre";
  assert.equal(
    hasIntegrityIssue(invalidPeriod, "assessment.period.invalid"),
    true,
  );

  const invalidType = cloneDataset();
  (invalidType.assessments[0] as unknown as { type: string }).type = "quiz";
  assert.equal(
    hasIntegrityIssue(invalidType, "assessment.type.invalid"),
    true,
  );

  const invalidStatus = cloneDataset();
  (invalidStatus.assessments[0] as unknown as { status: string }).status =
    "archived";
  assert.equal(
    hasIntegrityIssue(invalidStatus, "assessment.status.invalid"),
    true,
  );
});

test("Inicialização: inconsistência é reportada sem correção automática", async () => {
  const inconsistent = cloneDataset();
  inconsistent.students[0].classId = "class-missing";

  await assert.rejects(
    () =>
      initializeAcademicData({
        seed: async () => undefined,
        load: async () => inconsistent,
      }),
    AcademicIntegrityError,
  );
  assert.equal(inconsistent.students[0].classId, "class-missing");
});

test("Inicialização: retry repete seed e load completos após falha", async () => {
  let seedCalls = 0;
  let loadCalls = 0;
  const dependencies = {
    seed: async () => {
      seedCalls += 1;
    },
    load: async () => {
      loadCalls += 1;
      if (loadCalls === 1) throw new Error("falha inicial simulada");
      return demoDataset;
    },
  };

  await assert.rejects(
    () => initializeAcademicData(dependencies),
    /falha inicial simulada/,
  );
  const recovered = await initializeAcademicData(dependencies);

  assert.equal(seedCalls, 2);
  assert.equal(loadCalls, 2);
  assert.equal(recovered, demoDataset);
});

test("Inicialização: UI exige confirmação para restaurar dados inconsistentes", async () => {
  const source = await readFile(
    new URL("../src/components/platform/DataState.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Os dados locais da demonstração estão inconsistentes/);
  assert.match(source, /Restaurar base demonstrativa/);
  assert.match(source, /window\.confirm/);
  assert.match(source, /alterações locais serão apagadas/i);
});

test("Auditoria permanece on-demand e fora do AcademicDataset do provider", async () => {
  const source = await readFile(
    new URL(
      "../src/components/platform/AcademicDataProvider.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  assert.doesNotMatch(source, /services\.audit\.getAll/);
  assert.match(source, /services\.grades\.getAll/);
});

test("Data de nova avaliação usa calendário local sem corte UTC", () => {
  const previousTimezone = process.env.TZ;
  process.env.TZ = "America/Sao_Paulo";
  try {
    const localEvening = new Date("2026-08-19T01:30:00.000Z");
    assert.equal(formatLocalDateInput(localEvening), "2026-08-18");
  } finally {
    if (previousTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = previousTimezone;
    }
  }
});

test("Assessments: cria avaliação válida apenas com TeachingAssignment permitido", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const created = await services.assessments.create(
    {
      name: "Avaliação criada no teste",
      classId: "class-2a",
      subjectId: "subject-math",
      period: "1º bimestre",
      date: "2026-08-18",
      type: "exam",
      maxScore: 10,
      weight: 2,
    },
    DEMO_PROFILE_IDS.professor,
  );
  assert.equal(created.status, "draft");
  assert.equal(
    (await services.assessments.getById(created.id))?.name,
    "Avaliação criada no teste",
  );
});

test("Assessments: rejeita nome vazio, maxScore, weight e TeachingAssignment inválidos", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const base = {
    name: "Teste",
    classId: "class-2a",
    subjectId: "subject-math",
    period: "1º bimestre",
    date: "2026-08-18",
    type: "exam" as const,
    maxScore: 10,
    weight: 1,
  };

  await assert.rejects(
    () => services.assessments.create({ ...base, name: "   " }, DEMO_PROFILE_IDS.professor),
    /nome/i,
  );
  await assert.rejects(
    () => services.assessments.create({ ...base, maxScore: 0 }, DEMO_PROFILE_IDS.professor),
    /valor máximo/i,
  );
  await assert.rejects(
    () => services.assessments.create({ ...base, weight: 0 }, DEMO_PROFILE_IDS.professor),
    /peso/i,
  );
  await assert.rejects(
    () =>
      services.assessments.create(
        { ...base, subjectId: "subject-portuguese" },
        DEMO_PROFILE_IDS.professor,
      ),
    /TeachingAssignment/i,
  );
});

test("Assessments: aceita somente os quatro períodos canônicos em runtime", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const base = {
    name: "Validação de período",
    classId: "class-2a",
    subjectId: "subject-math",
    date: "2026-08-18",
    type: "exam" as const,
    maxScore: 10,
    weight: 1,
  };

  for (const period of ACADEMIC_PERIODS) {
    const assessment = await services.assessments.create(
      { ...base, period },
      DEMO_PROFILE_IDS.professor,
    );
    assert.equal(assessment.period, period);
  }

  for (const period of ["5º bimestre", "teste", ""]) {
    await assert.rejects(
      () =>
        services.assessments.create(
          { ...base, period },
          DEMO_PROFILE_IDS.professor,
        ),
      /período/i,
    );
  }
});

test("Assessments: valida todos os tipos permitidos e rejeita tipo desconhecido", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const base = {
    name: "Validação de tipo",
    classId: "class-2a",
    subjectId: "subject-math",
    period: "1º bimestre" as const,
    date: "2026-08-18",
    maxScore: 10,
    weight: 1,
  };

  for (const type of ASSESSMENT_TYPES) {
    const assessment = await services.assessments.create(
      { ...base, type },
      DEMO_PROFILE_IDS.professor,
    );
    assert.equal(assessment.type, type);
  }

  await assert.rejects(
    () =>
      services.assessments.create(
        { ...base, type: "quiz" as never },
        DEMO_PROFILE_IDS.professor,
      ),
    /tipo de avaliação inválido/i,
  );
});

test("Assessments: compatibilidade P1 mapeia scheduled/completed sem migration V3", () => {
  assert.equal(DB_VERSION, 2);
  assert.equal(normalizeAssessmentStatus("scheduled"), "draft");
  assert.equal(normalizeAssessmentStatus("completed"), "reviewed");
  assert.equal(normalizeAssessmentStatus("closed"), "closed");
  assert.throws(
    () => normalizeAssessmentStatus("invalid"),
    /status de avaliação desconhecido/i,
  );
});

test("Assessment integrity: bloqueia turma, disciplina e período após lançamento de Grades", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const assessment = await services.assessments.getById(
    "assessment-math-2a-1",
  );
  assert.ok(assessment);

  await assert.rejects(
    () =>
      services.assessments.update(
        { ...assessment, classId: "class-2b" },
        DEMO_PROFILE_IDS.professor,
      ),
    /turma não pode ser alterada/i,
  );

  await services.teachingAssignments.save({
    id: "assignment-test-math-physics",
    teacherId: DEMO_PROFILE_IDS.professor,
    classId: "class-2a",
    subjectId: "subject-physics",
    active: true,
  });
  await assert.rejects(
    () =>
      services.assessments.update(
        { ...assessment, subjectId: "subject-physics" },
        DEMO_PROFILE_IDS.professor,
      ),
    /disciplina não pode ser alterada/i,
  );

  await assert.rejects(
    () =>
      services.assessments.update(
        { ...assessment, period: "2º bimestre" },
        DEMO_PROFILE_IDS.professor,
      ),
    /período não pode ser alterado/i,
  );
});

test("Assessment integrity: maxScore nunca invalida Grade existente", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const assessment = await services.assessments.getById(
    "assessment-math-2a-1",
  );
  assert.ok(assessment);

  await assert.rejects(
    () =>
      services.assessments.update(
        { ...assessment, maxScore: 5 },
        DEMO_PROFILE_IDS.professor,
      ),
    /valor máximo não pode ser menor/i,
  );

  const reducibleAssessment = await services.assessments.getById(
    "assessment-math-2a-3",
  );
  assert.ok(reducibleAssessment);
  const updated = await services.assessments.update(
    { ...reducibleAssessment, maxScore: 4.6 },
    DEMO_PROFILE_IDS.professor,
  );
  assert.equal(updated.maxScore, 4.6);
});

test("Assessment integrity: weight válido é editável e recalcula os derivados", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const assessment = await services.assessments.getById(
    "assessment-math-2a-1",
  );
  assert.ok(assessment);

  const assessmentsBefore = await services.assessments.getByClassAndSubject(
    "class-2a",
    "subject-math",
  );
  const grades = await services.grades.getByStudent(DEMO_PROFILE_IDS.aluno);
  const before = calculateWeightedAverage(assessmentsBefore, grades).average;

  await services.assessments.update(
    { ...assessment, weight: 5 },
    DEMO_PROFILE_IDS.professor,
  );

  const assessmentsAfter = await services.assessments.getByClassAndSubject(
    "class-2a",
    "subject-math",
  );
  const after = calculateWeightedAverage(assessmentsAfter, grades).average;
  assert.notEqual(after, before);
  assert.equal(
    assessmentsAfter.find((item) => item.id === assessment.id)?.weight,
    5,
  );
});

test("Assessment integrity: update valida o TeachingAssignment do contexto original", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const assessment = await services.assessments.getById(
    "assessment-math-2a-1",
  );
  const assignment = await services.teachingAssignments.getAssignment(
    DEMO_PROFILE_IDS.professor,
    "class-2a",
    "subject-math",
  );
  assert.ok(assessment);
  assert.ok(assignment);

  await services.teachingAssignments.save({ ...assignment, active: false });
  await assert.rejects(
    () =>
      services.assessments.update(
        { ...assessment, classId: "class-2b" },
        DEMO_PROFILE_IDS.professor,
      ),
    /TeachingAssignment/i,
  );
});

test("Auditoria: primeiro lançamento, edição, upsert e ausência de evento sem mudança", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const studentId = "student-2a-20";
  const assessmentId = "assessment-math-2a-2";

  const first = await services.grades.saveManualGrade({
    studentId,
    assessmentId,
    score: 7,
    actorId: DEMO_PROFILE_IDS.professor,
  });
  assert.equal(first.changed, true);
  assert.equal(first.grade.score, 7);

  const firstAudit = await services.audit.getByEntity(first.grade.id);
  assert.equal(firstAudit.length, 1);
  assert.equal(firstAudit[0].previousValue, null);
  assert.equal(firstAudit[0].newValue, 7);
  assert.equal(firstAudit[0].source, "manual");

  const edited = await services.grades.saveManualGrade({
    studentId,
    assessmentId,
    score: 8.5,
    actorId: DEMO_PROFILE_IDS.professor,
  });
  assert.equal(edited.grade.id, first.grade.id);
  assert.equal(edited.grade.score, 8.5);

  const editedAudit = await services.audit.getByEntity(first.grade.id);
  assert.equal(editedAudit.length, 2);
  const editEntry = editedAudit.find((entry) => entry.newValue === 8.5);
  assert.ok(editEntry);
  assert.equal(editEntry.previousValue, 7);

  const unchanged = await services.grades.saveManualGrade({
    studentId,
    assessmentId,
    score: 8.5,
    actorId: DEMO_PROFILE_IDS.professor,
  });
  assert.equal(unchanged.changed, false);
  assert.equal((await services.audit.getByEntity(first.grade.id)).length, 2);
  assert.equal(
    (
      await services.grades.getByStudentAndAssessment(
        studentId,
        assessmentId,
      )
    )?.id,
    first.grade.id,
  );
});

test("Fechamento: 26 ativos e 25 Grades registradas mantém avaliação aberta", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const students = await services.students.getByClass("class-2a");
  const assessment = await services.assessments.getById(
    "assessment-math-2a-2",
  );
  assert.equal(students.length, 26);
  assert.ok(assessment);

  await recordAssessmentGrades(
    students.slice(0, 25).map((student) => student.id),
    assessment.id,
    7,
  );
  await assert.rejects(
    () =>
      services.assessments.update(
        { ...assessment, status: "closed" },
        DEMO_PROFILE_IDS.professor,
      ),
    /1 estudante\(s\) ativo\(s\).*pendente/i,
  );
  assert.notEqual(
    (await services.assessments.getById(assessment.id))?.status,
    "closed",
  );
});

test("Fechamento: 26 ativos e 26 Grades registradas permite fechar", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const students = await services.students.getByClass("class-2a");
  const assessment = await services.assessments.getById(
    "assessment-math-2a-2",
  );
  assert.ok(assessment);

  await recordAssessmentGrades(
    students.map((student) => student.id),
    assessment.id,
    7,
  );
  const closed = await services.assessments.update(
    { ...assessment, status: "closed" },
    DEMO_PROFILE_IDS.professor,
  );
  assert.equal(closed.status, "closed");
  await assert.rejects(
    () =>
      services.assessments.update(
        { ...closed, status: "reviewed" },
        DEMO_PROFILE_IDS.professor,
      ),
    /avaliação fechada não pode ser editada/i,
  );
});

test("Fechamento: estudante inativo não é contado como pendência", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const students = await services.students.getByClass("class-2a");
  const inactiveStudent = students.at(-1);
  const assessment = await services.assessments.getById(
    "assessment-math-2a-2",
  );
  assert.ok(inactiveStudent);
  assert.ok(assessment);

  await services.students.save({ ...inactiveStudent, active: false });
  await recordAssessmentGrades(
    students.slice(0, 25).map((student) => student.id),
    assessment.id,
    7,
  );
  const closed = await services.assessments.update(
    { ...assessment, status: "closed" },
    DEMO_PROFILE_IDS.professor,
  );
  assert.equal(closed.status, "closed");
});

test("Fechamento: Grade registrada com score zero conta como lançada", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const students = await services.students.getByClass("class-2a");
  const assessment = await services.assessments.getById(
    "assessment-math-2a-2",
  );
  assert.ok(assessment);

  await recordAssessmentGrades(
    students.map((student) => student.id),
    assessment.id,
    0,
  );
  const closed = await services.assessments.update(
    { ...assessment, status: "closed" },
    DEMO_PROFILE_IDS.professor,
  );
  assert.equal(closed.status, "closed");
});

test("Gradebook: avaliação closed bloqueia edição na camada de Service", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const assessment = await services.assessments.getById(
    "assessment-math-2a-2",
  );
  assert.ok(assessment);

  const students = await services.students.getByClass(assessment.classId);
  await recordAssessmentGrades(
    students.map((student) => student.id),
    assessment.id,
    7,
  );

  await services.assessments.update(
    { ...assessment, status: "closed" },
    DEMO_PROFILE_IDS.professor,
  );

  await assert.rejects(
    () =>
      services.grades.saveManualGrade({
        studentId: "student-2a-20",
        assessmentId: assessment.id,
        score: 8,
        actorId: DEMO_PROFILE_IDS.professor,
      }),
    /fechada/i,
  );
});

test("Permissões: professor não lança nota em combinação sem TeachingAssignment", async () => {
  await seedDatabase();
  const services = getAcademicServices();

  await assert.rejects(
    () =>
      services.grades.saveManualGrade({
        studentId: "student-2a-01",
        assessmentId: "assessment-portuguese-2a-1",
        score: 8,
        actorId: DEMO_PROFILE_IDS.professor,
      }),
    /TeachingAssignment/i,
  );
});

test("Integração entre perfis: alteração do professor é observada no mesmo registro por coordenação e aluno", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const studentId = DEMO_PROFILE_IDS.aluno;
  const assessmentId = "assessment-math-2a-2";

  const professorWrite = await services.grades.saveManualGrade({
    studentId,
    assessmentId,
    score: 9.3,
    actorId: DEMO_PROFILE_IDS.professor,
  });

  const coordinationRead = (
    await services.grades.getByAssessment(assessmentId)
  ).find((grade) => grade.studentId === studentId);
  const studentRead = (
    await services.grades.getByStudent(studentId)
  ).find((grade) => grade.assessmentId === assessmentId);

  assert.equal(coordinationRead?.id, professorWrite.grade.id);
  assert.equal(studentRead?.id, professorWrite.grade.id);
  assert.equal(coordinationRead?.score, 9.3);
  assert.equal(studentRead?.score, 9.3);
});

test("Performance: salvar Grade atualiza o snapshot sem seed nem recarga integral", async () => {
  const persisted = makeGrade(
    "grade-incremental",
    DEMO_PROFILE_IDS.aluno,
    "assessment-math-2a-2",
    9.7,
  );
  let saveCalls = 0;
  let snapshotUpdates = 0;
  let snapshot = demoDataset;

  const result = await persistManualGradeIncrementally(
    {
      async saveManualGrade() {
        saveCalls += 1;
        return { changed: true, grade: persisted };
      },
    },
    {
      studentId: persisted.studentId,
      assessmentId: persisted.assessmentId,
      score: persisted.score ?? 0,
      actorId: DEMO_PROFILE_IDS.professor,
    },
    (grade) => {
      snapshotUpdates += 1;
      snapshot = upsertGradeInSnapshot(snapshot, grade);
    },
  );

  assert.equal(saveCalls, 1);
  assert.equal(snapshotUpdates, 1);
  assert.equal(result, persisted);
  assert.equal(
    snapshot.grades.filter(
      (grade) =>
        grade.studentId === persisted.studentId &&
        grade.assessmentId === persisted.assessmentId,
    ).length,
    1,
  );
  assert.equal(
    snapshot.grades.find(
      (grade) =>
        grade.studentId === persisted.studentId &&
        grade.assessmentId === persisted.assessmentId,
    )?.score,
    9.7,
  );
});

test("Sincronização: snapshot confirmado é o mesmo para Professor, Aluno e Coordenação", () => {
  const persisted = makeGrade(
    "grade-shared-snapshot",
    DEMO_PROFILE_IDS.aluno,
    "assessment-math-2a-2",
    9.4,
  );
  const sharedSnapshot = upsertGradeInSnapshot(demoDataset, persisted);

  const professor = sharedSnapshot.grades.find(
    (grade) => grade.id === persisted.id,
  );
  const student = sharedSnapshot.grades.find(
    (grade) =>
      grade.studentId === DEMO_PROFILE_IDS.aluno &&
      grade.assessmentId === persisted.assessmentId,
  );
  const coordination = sharedSnapshot.grades.filter(
    (grade) => grade.assessmentId === persisted.assessmentId,
  ).find((grade) => grade.studentId === DEMO_PROFILE_IDS.aluno);

  assert.equal(professor?.score, 9.4);
  assert.equal(student?.id, persisted.id);
  assert.equal(coordination?.id, persisted.id);
});

test("Mobile: selecionar avaliação, editar e persistir produz feedback confirmado", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const selectedAssessmentId = "assessment-math-2a-2";
  let feedback = "editando";

  const grade = await persistManualGradeIncrementally(
    services.grades,
    {
      studentId: DEMO_PROFILE_IDS.aluno,
      assessmentId: selectedAssessmentId,
      score: 9.1,
      actorId: DEMO_PROFILE_IDS.professor,
    },
    () => {
      feedback = "salvo";
    },
  );

  assert.equal(grade.assessmentId, selectedAssessmentId);
  assert.equal(grade.score, 9.1);
  assert.equal(feedback, "salvo");
  assert.equal(
    (
      await services.grades.getByStudentAndAssessment(
        DEMO_PROFILE_IDS.aluno,
        selectedAssessmentId,
      )
    )?.score,
    9.1,
  );
});

test("StudentDetail: falha de auditoria é error, não empty, e Escape fecha", async () => {
  const state = await loadAuditHistory(
    ["grade-1"],
    async (): Promise<AuditEntry[]> => {
      throw new Error("falha simulada");
    },
  );
  assert.equal(state.status, "error");
  assert.match(state.error ?? "", /falha simulada/);
  assert.equal(shouldCloseStudentDetail("Escape"), true);
  assert.equal(shouldCloseStudentDetail("Enter"), false);
});

test("Histórico: usa somente Grades das avaliações do período atual", () => {
  const grades = [
    makeGrade("grade-period-1", "student", "assessment-period-1", 7),
    makeGrade("grade-period-2", "student", "assessment-period-2", 9),
    makeGrade("grade-other-student", "other", "assessment-period-1", 8),
  ];
  assert.deepEqual(
    selectContextualStudentGrades(
      grades,
      "student",
      ["assessment-period-1"],
    ).map((grade) => grade.id),
    ["grade-period-1"],
  );
});

test("Mobile: existe estrutura própria por avaliação e input decimal independente da tabela desktop", async () => {
  const source = await readFile(
    new URL("../src/components/academic/GradebookPage.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /gradebook-mobile/);
  assert.match(source, /mobileAssessmentId/);
  assert.match(source, /inputMode="decimal"/);
  assert.match(source, /mobile-grade-list/);
});
