import { STORE_NAMES, type StoreName } from "./config";

type UpgradeFailureHandler = (error: Error) => void;

function getOrCreateStore(
  database: IDBDatabase,
  transaction: IDBTransaction,
  name: StoreName,
): IDBObjectStore {
  return database.objectStoreNames.contains(name)
    ? transaction.objectStore(name)
    : database.createObjectStore(name, { keyPath: "id" });
}

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options: IDBIndexParameters = {},
): void {
  if (!store.indexNames.contains(name)) {
    store.createIndex(name, keyPath, options);
  }
}

function migrateToV1(database: IDBDatabase, transaction: IDBTransaction): void {
  const students = getOrCreateStore(database, transaction, STORE_NAMES.students);
  ensureIndex(students, "registration", "registration", { unique: true });
  ensureIndex(students, "classId", "classId");

  const teachers = getOrCreateStore(database, transaction, STORE_NAMES.teachers);
  ensureIndex(teachers, "active", "active");

  getOrCreateStore(database, transaction, STORE_NAMES.classes);
  getOrCreateStore(database, transaction, STORE_NAMES.subjects);

  const assessments = getOrCreateStore(database, transaction, STORE_NAMES.assessments);
  ensureIndex(assessments, "classId", "classId");
  ensureIndex(assessments, "subjectId", "subjectId");

  const grades = getOrCreateStore(database, transaction, STORE_NAMES.grades);
  ensureIndex(grades, "studentId", "studentId");
  ensureIndex(grades, "assessmentId", "assessmentId");

  const auditEntries = getOrCreateStore(database, transaction, STORE_NAMES.auditEntries);
  ensureIndex(auditEntries, "entityId", "entityId");

  getOrCreateStore(database, transaction, STORE_NAMES.metadata);
}

function addUniqueGradeIndex(
  grades: IDBObjectStore,
  transaction: IDBTransaction,
  onFailure: UpgradeFailureHandler,
): void {
  if (grades.indexNames.contains("studentAssessment")) {
    return;
  }

  const combinations = new Set<string>();
  const request = grades.openCursor();

  request.onerror = () => {
    onFailure(new Error("Falha ao verificar a integridade das notas existentes."));
    transaction.abort();
  };

  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) {
      try {
        grades.createIndex(
          "studentAssessment",
          ["studentId", "assessmentId"],
          { unique: true },
        );
      } catch (error) {
        onFailure(
          error instanceof Error
            ? error
            : new Error("Não foi possível criar o índice único de notas."),
        );
        transaction.abort();
      }
      return;
    }

    const grade = cursor.value as {
      id?: unknown;
      studentId?: unknown;
      assessmentId?: unknown;
    };
    const hasValidStudentId =
      typeof grade.studentId === "string" && grade.studentId.trim().length > 0;
    const hasValidAssessmentId =
      typeof grade.assessmentId === "string" &&
      grade.assessmentId.trim().length > 0;

    if (!hasValidStudentId || !hasValidAssessmentId) {
      const gradeId =
        typeof grade.id === "string" && grade.id.length > 0
          ? grade.id
          : String(cursor.primaryKey);
      onFailure(
        new Error(
          `Integridade inválida: a nota "${gradeId}" possui studentId ou assessmentId ausente ou vazio.`,
        ),
      );
      transaction.abort();
      return;
    }

    const combination = JSON.stringify([grade.studentId, grade.assessmentId]);

    if (combinations.has(combination)) {
      onFailure(
        new Error(
          `Integridade inválida: existem notas duplicadas para ${grade.studentId ?? "estudante desconhecido"} e ${grade.assessmentId ?? "avaliação desconhecida"}.`,
        ),
      );
      transaction.abort();
      return;
    }

    combinations.add(combination);
    cursor.continue();
  };
}

function migrateToV2(
  database: IDBDatabase,
  transaction: IDBTransaction,
  onFailure: UpgradeFailureHandler,
): void {
  const assignments = getOrCreateStore(
    database,
    transaction,
    STORE_NAMES.teachingAssignments,
  );
  ensureIndex(assignments, "teacherId", "teacherId");
  ensureIndex(assignments, "classId", "classId");
  ensureIndex(assignments, "subjectId", "subjectId");
  ensureIndex(
    assignments,
    "teacherClassSubject",
    ["teacherId", "classId", "subjectId"],
    { unique: true },
  );

  const grades = getOrCreateStore(database, transaction, STORE_NAMES.grades);
  addUniqueGradeIndex(grades, transaction, onFailure);
}

export function applyMigrations(
  database: IDBDatabase,
  transaction: IDBTransaction,
  oldVersion: number,
  newVersion: number,
  onFailure: UpgradeFailureHandler,
): void {
  for (let version = oldVersion + 1; version <= newVersion; version += 1) {
    if (version === 1) {
      migrateToV1(database, transaction);
    }

    if (version === 2) {
      migrateToV2(database, transaction, onFailure);
    }
  }
}
