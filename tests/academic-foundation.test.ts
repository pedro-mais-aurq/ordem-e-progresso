import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  deleteDemoDatabase,
  openOrdemDatabase,
  requestToPromise,
  transactionDone,
} from "../src/database/indexed-db/client";
import {
  ACADEMIC_STORE_NAMES,
  DB_NAME,
  DB_VERSION,
  STORE_NAMES,
} from "../src/database/indexed-db/config";
import {
  demoAssessments,
  demoAuditEntries,
  demoClasses,
  demoDataset,
  demoGrades,
  demoStudents,
  demoSubjects,
  demoTeachers,
  demoTeachingAssignments,
} from "../src/database/seed/data";
import {
  resetDemoDatabase,
  seedDatabase,
} from "../src/database/seed/seed";
import {
  canAccessSection,
  PROFILE_CAPABILITIES,
} from "../src/config/profile-capabilities";
import {
  LocalGradeRepository,
  LocalStudentRepository,
  LocalTeachingAssignmentRepository,
} from "../src/repositories/local/academic-repositories";
import {
  GradeService,
  isValidRegistration,
  StudentService,
  TeachingAssignmentService,
} from "../src/services/academic-services";
import type {
  AuditEntry,
  Grade,
  MetadataRecord,
} from "../src/types/academic";

function createV1Schema(database: IDBDatabase): void {
  const students = database.createObjectStore(STORE_NAMES.students, { keyPath: "id" });
  students.createIndex("registration", "registration", { unique: true });
  students.createIndex("classId", "classId");

  const teachers = database.createObjectStore(STORE_NAMES.teachers, { keyPath: "id" });
  teachers.createIndex("active", "active");

  database.createObjectStore(STORE_NAMES.classes, { keyPath: "id" });
  database.createObjectStore(STORE_NAMES.subjects, { keyPath: "id" });

  const assessments = database.createObjectStore(STORE_NAMES.assessments, { keyPath: "id" });
  assessments.createIndex("classId", "classId");
  assessments.createIndex("subjectId", "subjectId");

  const grades = database.createObjectStore(STORE_NAMES.grades, { keyPath: "id" });
  grades.createIndex("studentId", "studentId");
  grades.createIndex("assessmentId", "assessmentId");

  const auditEntries = database.createObjectStore(STORE_NAMES.auditEntries, { keyPath: "id" });
  auditEntries.createIndex("entityId", "entityId");

  database.createObjectStore(STORE_NAMES.metadata, { keyPath: "id" });
}

async function openV1Database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => createV1Schema(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function setSeedMetadata(value: string): Promise<void> {
  const database = await openOrdemDatabase();
  const transaction = database.transaction(STORE_NAMES.metadata, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAMES.metadata).put({
    id: "demo-seed-version",
    value,
  } satisfies MetadataRecord);
  await done;
  database.close();
}

afterEach(async () => {
  await deleteDemoDatabase();
});

test("matrícula exige exatamente oito dígitos numéricos", () => {
  assert.equal(isValidRegistration("20260031"), true);
  assert.equal(isValidRegistration("2026031"), false);
  assert.equal(isValidRegistration("202600031"), false);
  assert.equal(isValidRegistration("2026A031"), false);
});

test("política de capacidades centraliza as permissões dos três perfis", () => {
  assert.deepEqual([...PROFILE_CAPABILITIES.professor], ["turmas", "avaliacoes", "notas"]);
  assert.deepEqual([...PROFILE_CAPABILITIES.coordenacao], ["turmas", "avaliacoes", "notas"]);
  assert.deepEqual([...PROFILE_CAPABILITIES.aluno], ["avaliacoes", "notas", "comunicados"]);
  assert.equal(canAccessSection("aluno", "turmas"), false);
  assert.equal(canAccessSection("aluno", "comunicados"), true);
});

test("IndexedDB V2 inicializa todas as stores e índices acadêmicos", async () => {
  const database = await openOrdemDatabase();
  const expectedStores = [...ACADEMIC_STORE_NAMES, STORE_NAMES.metadata];

  assert.equal(database.version, DB_VERSION);
  for (const storeName of expectedStores) {
    assert.equal(database.objectStoreNames.contains(storeName), true, `Store ausente: ${storeName}`);
  }

  const transaction = database.transaction(
    [STORE_NAMES.grades, STORE_NAMES.teachingAssignments],
    "readonly",
  );
  const gradeIndex = transaction.objectStore(STORE_NAMES.grades).index("studentAssessment");
  const assignmentIndex = transaction
    .objectStore(STORE_NAMES.teachingAssignments)
    .index("teacherClassSubject");
  assert.deepEqual(gradeIndex.keyPath, ["studentId", "assessmentId"]);
  assert.equal(gradeIndex.unique, true);
  assert.deepEqual(assignmentIndex.keyPath, ["teacherId", "classId", "subjectId"]);
  assert.equal(assignmentIndex.unique, true);
  database.close();
});

test("migration preserva dados e evolui uma base V1 para V2", async () => {
  const v1 = await openV1Database();
  const transaction = v1.transaction(
    [STORE_NAMES.students, STORE_NAMES.grades],
    "readwrite",
  );
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAMES.students).add({
    id: "student-v1",
    registration: "20990001",
    name: "Estudante preservado",
    classId: "class-v1",
    active: true,
  });
  transaction.objectStore(STORE_NAMES.grades).add({
    id: "grade-v1",
    studentId: "student-v1",
    assessmentId: "assessment-v1",
    score: 8,
    status: "recorded",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await done;
  v1.close();

  const v2 = await openOrdemDatabase();
  assert.equal(v2.version, 2);
  for (const storeName of [
    STORE_NAMES.students,
    STORE_NAMES.teachers,
    STORE_NAMES.classes,
    STORE_NAMES.subjects,
    STORE_NAMES.assessments,
    STORE_NAMES.grades,
    STORE_NAMES.auditEntries,
    STORE_NAMES.metadata,
  ]) {
    assert.equal(v2.objectStoreNames.contains(storeName), true, `Store V1 perdida: ${storeName}`);
  }
  assert.equal(v2.objectStoreNames.contains(STORE_NAMES.teachingAssignments), true);

  const read = v2.transaction(
    [STORE_NAMES.students, STORE_NAMES.grades, STORE_NAMES.teachingAssignments],
    "readonly",
  );
  assert.equal(
    (await requestToPromise(read.objectStore(STORE_NAMES.students).get("student-v1"))) !== undefined,
    true,
  );
  assert.equal(
    (await requestToPromise(read.objectStore(STORE_NAMES.grades).get("grade-v1"))) !== undefined,
    true,
  );
  assert.equal(
    read.objectStore(STORE_NAMES.grades).index("studentAssessment").unique,
    true,
  );
  assert.equal(
    await requestToPromise(read.objectStore(STORE_NAMES.teachingAssignments).count()),
    0,
  );
  v2.close();
});

test("migration falha explicitamente quando a V1 contém notas duplicadas", async () => {
  const v1 = await openV1Database();
  const transaction = v1.transaction(STORE_NAMES.grades, "readwrite");
  const done = transactionDone(transaction);
  const baseGrade = {
    studentId: "student-duplicate",
    assessmentId: "assessment-duplicate",
    score: 7,
    status: "recorded",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  } as const;
  transaction.objectStore(STORE_NAMES.grades).add({ id: "grade-duplicate-a", ...baseGrade });
  transaction.objectStore(STORE_NAMES.grades).add({ id: "grade-duplicate-b", ...baseGrade });
  await done;
  v1.close();

  await assert.rejects(() => openOrdemDatabase(), /Integridade inválida/);
});

test("migration rejeita Grade V1 com studentId vazio", async () => {
  const v1 = await openV1Database();
  const transaction = v1.transaction(STORE_NAMES.grades, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAMES.grades).add({
    id: "grade-invalid-student",
    studentId: "",
    assessmentId: "assessment-1",
    score: 7,
    status: "recorded",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await done;
  v1.close();

  await assert.rejects(
    () => openOrdemDatabase(),
    /grade-invalid-student.*studentId ou assessmentId ausente ou vazio/,
  );
});

test("migration rejeita Grade V1 com assessmentId vazio", async () => {
  const v1 = await openV1Database();
  const transaction = v1.transaction(STORE_NAMES.grades, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAMES.grades).add({
    id: "grade-invalid-assessment",
    studentId: "student-1",
    assessmentId: "",
    score: 7,
    status: "recorded",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await done;
  v1.close();

  await assert.rejects(
    () => openOrdemDatabase(),
    /grade-invalid-assessment.*studentId ou assessmentId ausente ou vazio/,
  );
});

test("migration rejeita Grade V1 sem studentId e assessmentId", async () => {
  const v1 = await openV1Database();
  const transaction = v1.transaction(STORE_NAMES.grades, "readwrite");
  const done = transactionDone(transaction);
  transaction.objectStore(STORE_NAMES.grades).add({
    id: "grade-invalid-fields",
    score: 7,
    status: "recorded",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await done;
  v1.close();

  await assert.rejects(
    () => openOrdemDatabase(),
    /grade-invalid-fields.*studentId ou assessmentId ausente ou vazio/,
  );
});

test("seed inicializa uma vez e preserva alterações após mudança de metadata", async () => {
  const firstSeed = await seedDatabase();
  const secondSeed = await seedDatabase();
  const gradeRepository = new LocalGradeRepository();
  const original = demoGrades[0];

  await gradeRepository.upsert({
    ...original,
    score: 9.75,
    updatedAt: "2026-08-18T15:00:00.000Z",
  });
  await setSeedMetadata("versao-local-diferente");
  const thirdSeed = await seedDatabase();
  const preserved = await gradeRepository.getByStudentAndAssessment(
    original.studentId,
    original.assessmentId,
  );

  assert.equal(firstSeed.seeded, true);
  assert.equal(secondSeed.seeded, false);
  assert.equal(thirdSeed.seeded, false);
  assert.equal(preserved?.score, 9.75);
  assert.equal((await new LocalStudentRepository().getAll()).length, 52);
});

test("seed adiciona somente assignments ausentes em uma base V1 existente", async () => {
  const v1 = await openV1Database();
  const transaction = v1.transaction(
    [STORE_NAMES.teachers, STORE_NAMES.classes, STORE_NAMES.subjects, STORE_NAMES.grades],
    "readwrite",
  );
  const done = transactionDone(transaction);
  demoTeachers.forEach((teacher) => transaction.objectStore(STORE_NAMES.teachers).add(teacher));
  demoClasses.forEach((schoolClass) => transaction.objectStore(STORE_NAMES.classes).add(schoolClass));
  demoSubjects.forEach((subject) => transaction.objectStore(STORE_NAMES.subjects).add(subject));
  transaction.objectStore(STORE_NAMES.grades).add({
    id: "grade-local-preserved",
    studentId: "student-local",
    assessmentId: "assessment-local",
    score: 4.5,
    status: "recorded",
    source: "manual",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  await done;
  v1.close();

  const result = await seedDatabase();
  const database = await openOrdemDatabase();
  const read = database.transaction(
    [STORE_NAMES.students, STORE_NAMES.grades, STORE_NAMES.teachingAssignments],
    "readonly",
  );
  assert.equal(result.seeded, false);
  assert.equal(await requestToPromise(read.objectStore(STORE_NAMES.students).count()), 0);
  assert.equal(await requestToPromise(read.objectStore(STORE_NAMES.grades).count()), 1);
  assert.equal(
    await requestToPromise(read.objectStore(STORE_NAMES.teachingAssignments).count()),
    5,
  );
  database.close();
});

test("reset demonstrativo explícito restaura o dataset canônico", async () => {
  await seedDatabase();
  const repository = new LocalGradeRepository();
  await repository.upsert({ ...demoGrades[0], score: 1.25 });

  const reset = await resetDemoDatabase();
  const restored = await repository.getByStudentAndAssessment(
    demoGrades[0].studentId,
    demoGrades[0].assessmentId,
  );

  assert.equal(reset.seeded, true);
  assert.equal(restored?.score, demoGrades[0].score);
});

test("GradeRepository usa índices, busca composta e upsert sem duplicação", async () => {
  await seedDatabase();
  const repository = new LocalGradeRepository();
  const service = new GradeService(repository);
  const original = demoGrades[0];

  assert.equal((await repository.getByStudentId(original.studentId)).length, 1);
  assert.equal((await repository.getByAssessmentId(original.assessmentId)).length, 16);
  assert.equal(
    (await repository.getByStudentAndAssessment(original.studentId, original.assessmentId))?.id,
    original.id,
  );

  await service.upsert({
    ...original,
    id: "grade-id-que-nao-deve-substituir-a-identidade",
    score: 9.2,
    updatedAt: "2026-08-18T16:00:00.000Z",
  });

  const byStudent = await service.getByStudent(original.studentId);
  const byAssessment = await service.getByAssessment(original.assessmentId);
  const combined = await service.getByStudentAndAssessment(
    original.studentId,
    original.assessmentId,
  );
  assert.equal(byStudent.length, 1);
  assert.equal(byAssessment.length, 16);
  assert.equal(combined?.id, original.id);
  assert.equal(combined?.score, 9.2);
});

test("Grade + Audit fazem commit na mesma transação", async () => {
  await seedDatabase();
  const repository = new LocalGradeRepository();
  const grade: Grade = {
    id: "grade-atomic-success",
    studentId: demoStudents[20].id,
    assessmentId: demoAssessments[0].id,
    score: 8.5,
    status: "recorded",
    source: "manual",
    createdAt: "2026-08-18T17:00:00.000Z",
    updatedAt: "2026-08-18T17:00:00.000Z",
  };
  const audit: AuditEntry = {
    id: "audit-atomic-success",
    actorId: "teacher-math",
    action: "grade.upserted",
    entityType: "grade",
    entityId: grade.id,
    previousValue: null,
    newValue: { score: grade.score },
    source: "test",
    timestamp: grade.updatedAt,
  };

  await repository.saveGradeWithAudit(grade, audit);
  assert.equal(
    (await repository.getByStudentAndAssessment(grade.studentId, grade.assessmentId))?.score,
    8.5,
  );

  const database = await openOrdemDatabase();
  const transaction = database.transaction(STORE_NAMES.auditEntries, "readonly");
  assert.deepEqual(
    await requestToPromise(transaction.objectStore(STORE_NAMES.auditEntries).get(audit.id)),
    audit,
  );
  database.close();
});

test("Grade + Audit normalizam entityId para o ID técnico preservado no upsert", async () => {
  const repository = new LocalGradeRepository();
  const originalGrade: Grade = {
    id: "grade-original",
    studentId: "student-001",
    assessmentId: "assessment-001",
    score: 6,
    status: "recorded",
    source: "manual",
    createdAt: "2026-08-18T17:30:00.000Z",
    updatedAt: "2026-08-18T17:30:00.000Z",
  };
  await repository.upsert(originalGrade);

  const temporaryGrade: Grade = {
    ...originalGrade,
    id: "grade-temporary",
    score: 8,
    updatedAt: "2026-08-18T17:45:00.000Z",
  };
  const audit: AuditEntry = {
    id: "audit-grade-upsert",
    actorId: "teacher-math",
    action: "grade.upserted",
    entityType: "grade",
    entityId: temporaryGrade.id,
    previousValue: { score: originalGrade.score },
    newValue: { score: temporaryGrade.score },
    source: "test",
    timestamp: temporaryGrade.updatedAt,
  };

  await repository.saveGradeWithAudit(temporaryGrade, audit);

  const persistedGrades = await repository.getByStudentId(originalGrade.studentId);
  assert.equal(persistedGrades.length, 1);
  assert.equal(persistedGrades[0].id, originalGrade.id);
  assert.equal(persistedGrades[0].score, 8);

  const database = await openOrdemDatabase();
  const transaction = database.transaction(STORE_NAMES.auditEntries, "readonly");
  const persistedAudit = await requestToPromise(
    transaction.objectStore(STORE_NAMES.auditEntries).get(audit.id) as IDBRequest<
      AuditEntry | undefined
    >,
  );
  database.close();

  assert.equal(persistedAudit?.entityId, originalGrade.id);
  assert.equal(audit.entityId, temporaryGrade.id);
});

test("falha de Audit reverte também a Grade na transação atômica", async () => {
  await seedDatabase();
  const repository = new LocalGradeRepository();
  const originalGrade: Grade = {
    id: "grade-rollback-original",
    studentId: "student-rollback",
    assessmentId: "assessment-rollback",
    score: 6,
    status: "recorded",
    source: "manual",
    createdAt: "2026-08-18T18:00:00.000Z",
    updatedAt: "2026-08-18T18:00:00.000Z",
  };
  await repository.upsert(originalGrade);
  const gradeUpdate: Grade = {
    ...originalGrade,
    id: "grade-rollback-temporary",
    score: 8,
    updatedAt: "2026-08-18T18:15:00.000Z",
  };

  await assert.rejects(() =>
    repository.saveGradeWithAudit(gradeUpdate, demoAuditEntries[0]),
  );
  const persistedGrade = await repository.getByStudentAndAssessment(
    originalGrade.studentId,
    originalGrade.assessmentId,
  );
  assert.equal(persistedGrade?.id, originalGrade.id);
  assert.equal(persistedGrade?.score, 6);

  const database = await openOrdemDatabase();
  const transaction = database.transaction(STORE_NAMES.auditEntries, "readonly");
  assert.equal(await requestToPromise(transaction.objectStore(STORE_NAMES.auditEntries).count()), 1);
  database.close();
});

test("StudentRepository e StudentService preservam contrato e validação", async () => {
  await seedDatabase();
  const repository = new LocalStudentRepository();
  const service = new StudentService(repository);
  const firstStudent = demoStudents[0];

  assert.deepEqual(await repository.getById(firstStudent.id), firstStudent);
  assert.deepEqual(await repository.getByRegistration(firstStudent.registration), firstStudent);
  assert.equal((await service.getActive()).length, 52);
  assert.equal(await service.getByRegistration("123"), null);
  await assert.rejects(
    () => service.save({ id: "invalid", registration: "ABC123", name: "Inválido", classId: "class-2a", active: true }),
    /8 dígitos/,
  );
});

test("TeachingAssignments representam exatamente as relações demonstrativas", async () => {
  await seedDatabase();
  const service = new TeachingAssignmentService(
    new LocalTeachingAssignmentRepository(),
  );

  const math = await service.getByTeacher("teacher-math");
  const portuguese = await service.getByTeacher("teacher-languages");
  const physics = await service.getByTeacher("teacher-physics");

  assert.deepEqual(math.map((item) => item.classId).sort(), ["class-2a", "class-2b"]);
  assert.deepEqual(portuguese.map((item) => item.classId).sort(), ["class-2a", "class-2b"]);
  assert.deepEqual(physics.map((item) => item.classId), ["class-2a"]);
  assert.equal((await service.getBySubject("subject-math")).length, 2);

  const classIds = new Set(math.map((item) => item.classId));
  const subjectIds = new Set(math.map((item) => item.subjectId));
  const studentCount = demoStudents.filter((student) => classIds.has(student.classId)).length;
  assert.equal(classIds.size, 2);
  assert.equal(subjectIds.size, 1);
  assert.equal(studentCount, 52);
});

test("fixtures mantêm integridade referencial e matrículas únicas", () => {
  const classIds = new Set(demoClasses.map((item) => item.id));
  const subjectIds = new Set(demoSubjects.map((item) => item.id));
  const teacherIds = new Set(demoTeachers.map((item) => item.id));
  const studentIds = new Set(demoStudents.map((item) => item.id));
  const assessmentIds = new Set(demoAssessments.map((item) => item.id));

  assert.equal(demoStudents.every((student) => classIds.has(student.classId)), true);
  assert.equal(
    demoAssessments.every(
      (assessment) =>
        classIds.has(assessment.classId) && subjectIds.has(assessment.subjectId),
    ),
    true,
  );
  assert.equal(
    demoGrades.every(
      (grade) =>
        studentIds.has(grade.studentId) && assessmentIds.has(grade.assessmentId),
    ),
    true,
  );
  assert.equal(
    demoTeachingAssignments.every(
      (assignment) =>
        teacherIds.has(assignment.teacherId) &&
        classIds.has(assignment.classId) &&
        subjectIds.has(assignment.subjectId),
    ),
    true,
  );
  assert.equal(
    new Set(demoStudents.map((student) => student.registration)).size,
    demoStudents.length,
  );
  assert.equal(demoDataset.teachingAssignments.length, 5);
});
