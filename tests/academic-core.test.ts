import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import { ACADEMIC_DEMO_CONFIG, DEMO_PROFILE_IDS } from "../src/config/academic-demo";
import { getAcademicServices } from "../src/config/services";
import { deleteDemoDatabase } from "../src/database/indexed-db/client";
import { DB_VERSION } from "../src/database/indexed-db/config";
import { seedDatabase } from "../src/database/seed/seed";
import {
  calculateClassAverage,
  calculateStudentAcademicState,
  calculateWeightedAverage,
  countPendingGrades,
  normalizeScore,
} from "../src/modules/grades/calculations";
import { filterGradebookRows } from "../src/modules/grades/filters";
import { parsePtBrScore, validateScoreInput } from "../src/modules/grades/input";
import { getNextEditableCell } from "../src/modules/grades/keyboard";
import { normalizeAssessmentStatus } from "../src/services/academic-services";
import type { Assessment, Grade, Student } from "../src/types/academic";

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

test("Assessments: compatibilidade P1 mapeia scheduled/completed sem migration V3", () => {
  assert.equal(DB_VERSION, 2);
  assert.equal(normalizeAssessmentStatus("scheduled"), "draft");
  assert.equal(normalizeAssessmentStatus("completed"), "reviewed");
  assert.equal(normalizeAssessmentStatus("closed"), "closed");
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
  assert.equal(editedAudit[1].previousValue, 7);
  assert.equal(editedAudit[1].newValue, 8.5);

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

test("Gradebook: avaliação closed bloqueia edição na camada de Service", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const assessment = await services.assessments.getById(
    "assessment-math-2a-2",
  );
  assert.ok(assessment);

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
