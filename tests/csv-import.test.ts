import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { getAcademicServices } from "../src/config/services";
import { deleteDemoDatabase, openOrdemDatabase, requestToPromise } from "../src/database/indexed-db/client";
import { STORE_NAMES } from "../src/database/indexed-db/config";
import {
  demoAssessments,
  demoStudents,
} from "../src/database/seed/data";
import { seedDatabase } from "../src/database/seed/seed";
import {
  CSV_IMPORT_MAX_BYTES,
  CSV_IMPORT_MAX_ROWS,
  createGradeCsvTemplate,
  parseGradeCsv,
} from "../src/modules/grades/csv-import";
import { upsertGradesInSnapshot } from "../src/modules/academic/snapshot";
import {
  LocalAssessmentRepository,
  LocalGradeRepository,
  LocalStudentRepository,
  LocalTeachingAssignmentRepository,
} from "../src/repositories/local/academic-repositories";
import type { AuditEntry, Grade } from "../src/types/academic";
import { demoDataset } from "../src/database/seed/data";
import { GradeImportService } from "../src/services/grade-import-service";

const assessment = demoAssessments.find((item) => item.id === "assessment-math-2a-2")!;
const existingStudent = demoStudents[0];
const newStudent = demoStudents[20];
const otherClassStudent = demoStudents[26];

afterEach(async () => {
  await deleteDemoDatabase();
});

function csv(text: string, name = "notas.csv", size = new TextEncoder().encode(text).byteLength) {
  return parseGradeCsv({ name, size, text });
}

test("CSV aceita formato canônico, BOM, decimal pt-BR, decimal com ponto e zero", () => {
  const parsed = csv(
    `\uFEFFmatricula;nota\r\n${existingStudent.registration};8,5\r\n${newStudent.registration};0\r\n20260022;7.25\r\n`,
  );
  assert.deepEqual(parsed.issues, []);
  assert.deepEqual(parsed.rows.map((row) => row.score), [8.5, 0, 7.25]);
  assert.equal(createGradeCsvTemplate([existingStudent.registration]).includes("matricula;nota"), true);
  assert.equal(createGradeCsvTemplate([existingStudent.registration]).includes(`${existingStudent.registration};`), true);
});

test("CSV rejeita matrícula inválida, nota vazia e conteúdo não numérico", () => {
  const parsed = csv("matricula;nota\n123;8\n20260001;\n20260002;oito\n");
  assert.equal(parsed.rows.length, 0);
  assert.match(parsed.issues[0].message, /8 dígitos/);
  assert.match(parsed.issues[1].message, /vazia/);
  assert.match(parsed.issues[2].message, /inválida/);
});

test("CSV rejeita matrícula duplicada sem escolher ocorrência", () => {
  const parsed = csv(`matricula;nota\n${existingStudent.registration};7\n${existingStudent.registration};8\n`);
  assert.equal(parsed.rows.length, 1);
  assert.match(parsed.issues[0].message, /duplicada/);
});

test("CSV rejeita arquivo vazio, cabeçalho inválido e extensão diferente de csv", () => {
  assert.match(csv("", "notas.csv").issues[0].message, /vazio/);
  assert.match(csv("registro;valor\n20260001;8").issues[0].message, /cabeçalho/);
  assert.match(csv("matricula;nota\n20260001;8", "notas.txt").issues[0].message, /\.csv/);
});

test("CSV rejeita arquivo acima de 5 MB e mais de 5000 linhas", () => {
  assert.match(
    csv("matricula;nota\n20260001;8", "notas.csv", CSV_IMPORT_MAX_BYTES + 1).issues[0].message,
    /5 MB/,
  );
  const tooMany = ["matricula;nota", ...Array.from({ length: CSV_IMPORT_MAX_ROWS + 1 }, (_, index) => `${String(10_000_000 + index)};8`)].join("\n");
  assert.match(csv(tooMany).issues[0].message, /5000/);
});

test("preview rejeita matrícula inexistente, aluno de outra turma, inativo e nota acima do máximo", async () => {
  await seedDatabase();
  await new LocalStudentRepository().save({ ...demoStudents[1], active: false });
  const preview = await getAcademicServices().gradeImports.preview(
    "teacher-math",
    assessment.id,
    [
      { line: 2, registration: "99999999", score: 8 },
      { line: 3, registration: otherClassStudent.registration, score: 8 },
      { line: 4, registration: demoStudents[1].registration, score: 8 },
      { line: 5, registration: newStudent.registration, score: assessment.maxScore + 1 },
    ],
  );
  assert.equal(preview.hasErrors, true);
  assert.deepEqual(preview.rows.map((row) => row.status), ["error", "error", "error", "error"]);
  assert.match(preview.rows[0].message!, /não encontrada/);
  assert.match(preview.rows[1].message!, /turma/);
  assert.match(preview.rows[2].message!, /inativo/);
  assert.match(preview.rows[3].message!, /entre 0 e/);
});

test("Service rejeita score NaN sem depender do parser CSV", async () => {
  await seedDatabase();
  await assert.rejects(
    () => getAcademicServices().gradeImports.preview(
      "teacher-math",
      assessment.id,
      [{ line: 2, registration: existingStudent.registration, score: Number.NaN }],
    ),
    /finita/,
  );
});

test("Service rejeita score Infinity sem depender do parser CSV", async () => {
  await seedDatabase();
  await assert.rejects(
    () => getAcademicServices().gradeImports.preview(
      "teacher-math",
      assessment.id,
      [{ line: 2, registration: existingStudent.registration, score: Number.POSITIVE_INFINITY }],
    ),
    /finita/,
  );
});

test("Service rejeita matrícula duplicada sem depender do parser CSV", async () => {
  await seedDatabase();
  await assert.rejects(
    () => getAcademicServices().gradeImports.preview(
      "teacher-math",
      assessment.id,
      [
        { line: 2, registration: existingStudent.registration, score: 7 },
        { line: 3, registration: existingStudent.registration, score: 8 },
      ],
    ),
    /duplicada/,
  );
});

test("preview carrega estudantes e Grades em lote sem consultas por linha", async () => {
  await seedDatabase();

  class CountingStudentRepository extends LocalStudentRepository {
    classQueries = 0;
    registrationQueries = 0;

    override async getByClassId(classId: string) {
      this.classQueries += 1;
      return super.getByClassId(classId);
    }

    override async getByRegistration(registration: string) {
      this.registrationQueries += 1;
      return super.getByRegistration(registration);
    }
  }

  class CountingGradeRepository extends LocalGradeRepository {
    assessmentQueries = 0;
    pairQueries = 0;

    override async getByAssessmentId(assessmentId: string) {
      this.assessmentQueries += 1;
      return super.getByAssessmentId(assessmentId);
    }

    override async getByStudentAndAssessment(studentId: string, assessmentId: string) {
      this.pairQueries += 1;
      return super.getByStudentAndAssessment(studentId, assessmentId);
    }
  }

  const students = new CountingStudentRepository();
  const grades = new CountingGradeRepository();
  const service = new GradeImportService(
    grades,
    new LocalAssessmentRepository(),
    students,
    new LocalTeachingAssignmentRepository(),
  );

  const preview = await service.preview(
    "teacher-math",
    assessment.id,
    demoStudents.slice(0, 20).map((student, index) => ({
      line: index + 2,
      registration: student.registration,
      score: 7,
    })),
  );

  assert.equal(preview.rows.length, 20);
  assert.equal(students.classQueries, 1);
  assert.equal(students.registrationQueries, 0);
  assert.equal(grades.assessmentQueries, 1);
  assert.equal(grades.pairQueries, 0);
});

test("Service bloqueia Assessment closed e professor sem TeachingAssignment", async () => {
  await seedDatabase();
  await new LocalAssessmentRepository().save({ ...assessment, status: "closed" });
  await assert.rejects(
    () => getAcademicServices().gradeImports.preview("teacher-math", assessment.id, []),
    /fechada/,
  );
  await new LocalAssessmentRepository().save(assessment);
  await assert.rejects(
    () => getAcademicServices().gradeImports.preview("teacher-physics", assessment.id, []),
    /TeachingAssignment/,
  );
});

test("preview classifica Grade nova, igual e conflito", async () => {
  await seedDatabase();
  const existing = await getAcademicServices().grades.getByStudentAndAssessment(existingStudent.id, assessment.id);
  assert.ok(existing?.score !== null && existing?.score !== undefined);
  const preview = await getAcademicServices().gradeImports.preview(
    "teacher-math",
    assessment.id,
    [
      { line: 2, registration: newStudent.registration, score: 7 },
      { line: 3, registration: existingStudent.registration, score: existing.score },
      { line: 4, registration: demoStudents[2].registration, score: 9.75 },
    ],
  );
  assert.deepEqual(preview.rows.map((row) => row.status), ["new", "unchanged", "conflict"]);
});

test("aplicação mantém conflito escolhido e não audita Grade sem alteração", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const current = await services.grades.getByStudentAndAssessment(existingStudent.id, assessment.id);
  assert.ok(current?.score !== null && current?.score !== undefined);
  const databaseBefore = await openOrdemDatabase();
  const auditCountBefore = await requestToPromise(
    databaseBefore.transaction(STORE_NAMES.auditEntries, "readonly").objectStore(STORE_NAMES.auditEntries).count(),
  );
  databaseBefore.close();

  const result = await services.gradeImports.apply({
    teacherId: "teacher-math",
    assessmentId: assessment.id,
    rows: [
      { line: 2, registration: existingStudent.registration, score: current.score },
      { line: 3, registration: demoStudents[2].registration, score: 9.75 },
    ],
    resolutions: { [demoStudents[2].registration]: "keep" },
  });
  assert.deepEqual(result, { grades: [], added: 0, updated: 0, kept: 2 });

  const databaseAfter = await openOrdemDatabase();
  const auditCountAfter = await requestToPromise(
    databaseAfter.transaction(STORE_NAMES.auditEntries, "readonly").objectStore(STORE_NAMES.auditEntries).count(),
  );
  databaseAfter.close();
  assert.equal(auditCountAfter, auditCountBefore);
});

test("aplicação cria e substitui Grades com source csv e AuditEntries correspondentes", async () => {
  await seedDatabase();
  const services = getAcademicServices();
  const existing = await services.grades.getByStudentAndAssessment(existingStudent.id, assessment.id);
  assert.ok(existing);
  const result = await services.gradeImports.apply({
    teacherId: "teacher-math",
    assessmentId: assessment.id,
    rows: [
      { line: 2, registration: newStudent.registration, score: 6.5 },
      { line: 3, registration: existingStudent.registration, score: 9.25 },
    ],
    resolutions: { [existingStudent.registration]: "replace" },
  });
  assert.equal(result.added, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.kept, 0);
  assert.equal(result.grades.every((grade) => grade.source === "csv"), true);
  assert.equal(
    (await services.grades.getByStudentAndAssessment(existingStudent.id, assessment.id))?.id,
    existing.id,
  );

  const database = await openOrdemDatabase();
  const auditEntries = await requestToPromise(
    database.transaction(STORE_NAMES.auditEntries, "readonly").objectStore(STORE_NAMES.auditEntries).getAll() as IDBRequest<AuditEntry[]>,
  );
  database.close();
  const importedAudits = auditEntries.filter((entry) => entry.source === "csv");
  assert.equal(importedAudits.length, 2);
  assert.deepEqual(
    new Set(importedAudits.map((entry) => entry.entityId)),
    new Set(result.grades.map((grade) => grade.id)),
  );
});

test("conflito não resolvido bloqueia aplicação", async () => {
  await seedDatabase();
  await assert.rejects(
    () => getAcademicServices().gradeImports.apply({
      teacherId: "teacher-math",
      assessmentId: assessment.id,
      rows: [{ line: 2, registration: existingStudent.registration, score: 9.9 }],
      resolutions: {},
    }),
    /Resolva o conflito/,
  );
});

test("batch Grade + Audit faz rollback integral quando uma auditoria falha", async () => {
  await seedDatabase();
  const repository = new LocalGradeRepository();
  const timestamp = "2026-08-19T12:00:00.000Z";
  const makeWrite = (index: number) => {
    const grade: Grade = {
      id: `grade-batch-${index}`,
      studentId: demoStudents[20 + index].id,
      assessmentId: assessment.id,
      score: 7 + index,
      status: "recorded",
      source: "csv",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const auditEntry: AuditEntry = {
      id: "audit-duplicated-inside-batch",
      actorId: "teacher-math",
      action: "grade.created",
      entityType: "grade",
      entityId: grade.id,
      previousValue: null,
      newValue: grade.score,
      source: "csv",
      timestamp,
    };
    return { grade, auditEntry };
  };
  await assert.rejects(() => repository.saveGradesWithAudit([makeWrite(0), makeWrite(1)]));
  assert.equal(await repository.getByStudentAndAssessment(demoStudents[20].id, assessment.id), null);
  assert.equal(await repository.getByStudentAndAssessment(demoStudents[21].id, assessment.id), null);
});

test("apply recarrega a Grade antes do lote e evita previousValue stale", async () => {
  await seedDatabase();
  const repository = new LocalGradeRepository();
  const existing = await repository.getByStudentAndAssessment(
    existingStudent.id,
    assessment.id,
  );
  assert.ok(existing);

  await getAcademicServices().gradeImports.preview(
    "teacher-math",
    assessment.id,
    [{ line: 2, registration: existingStudent.registration, score: 9.5 }],
  );

  const concurrentScore = 8.75;
  const concurrentlyUpdated: Grade = {
    ...existing,
    score: concurrentScore,
    updatedAt: "2026-08-19T12:25:00.000Z",
  };
  await repository.upsert(concurrentlyUpdated);

  const result = await getAcademicServices().gradeImports.apply({
    teacherId: "teacher-math",
    assessmentId: assessment.id,
    rows: [{ line: 2, registration: existingStudent.registration, score: 9.5 }],
    resolutions: { [existingStudent.registration]: "replace" },
  });
  assert.equal(result.updated, 1);

  const database = await openOrdemDatabase();
  const audits = await requestToPromise(
    database
      .transaction(STORE_NAMES.auditEntries, "readonly")
      .objectStore(STORE_NAMES.auditEntries)
      .getAll() as IDBRequest<AuditEntry[]>,
  );
  database.close();
  const persistedAudit = audits.find(
    (entry) => entry.source === "csv" && entry.newValue === 9.5,
  );

  assert.equal(persistedAudit?.entityId, existing.id);
  assert.equal(persistedAudit?.previousValue, concurrentScore);
  assert.equal(persistedAudit?.action, "grade.updated");
});

test("snapshot aplica somente as Grades confirmadas pelo batch", () => {
  const imported: Grade[] = [
    {
      id: "grade-snapshot-csv",
      studentId: newStudent.id,
      assessmentId: assessment.id,
      score: 8,
      status: "recorded",
      source: "csv",
      createdAt: "2026-08-19T12:00:00.000Z",
      updatedAt: "2026-08-19T12:00:00.000Z",
    },
  ];
  const snapshot = upsertGradesInSnapshot(demoDataset, imported);
  assert.equal(snapshot.students, demoDataset.students);
  assert.equal(snapshot.assessments, demoDataset.assessments);
  assert.equal(snapshot.grades.find((grade) => grade.id === imported[0].id)?.score, 8);
});
