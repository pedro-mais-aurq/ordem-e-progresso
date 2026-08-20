import { STORE_NAMES } from "@/src/database/indexed-db/config";
import {
  openOrdemDatabase,
  requestToPromise,
  transactionDone,
} from "@/src/database/indexed-db/client";
import type {
  AssessmentRepository,
  AuditRepository,
  ClassRepository,
  GradeRepository,
  GradeAuditWrite,
  StudentRepository,
  SubjectRepository,
  TeacherRepository,
  TeachingAssignmentRepository,
} from "@/src/repositories/contracts";
import type {
  Assessment,
  AuditEntry,
  Grade,
  SchoolClass,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from "@/src/types/academic";
import { IndexedDbRepository } from "./indexed-db-repository";

async function getAllByIndex<T>(
  storeName: (typeof STORE_NAMES)[keyof typeof STORE_NAMES],
  indexName: string,
  value: IDBValidKey,
): Promise<T[]> {
  const database = await openOrdemDatabase();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestToPromise(
      transaction
        .objectStore(storeName)
        .index(indexName)
        .getAll(value) as IDBRequest<T[]>,
    );
  } finally {
    database.close();
  }
}

export class LocalStudentRepository
  extends IndexedDbRepository<Student>
  implements StudentRepository
{
  constructor() {
    super(STORE_NAMES.students);
  }

  async getByRegistration(registration: string): Promise<Student | null> {
    const database = await openOrdemDatabase();
    try {
      const transaction = database.transaction(STORE_NAMES.students, "readonly");
      const result = await requestToPromise(
        transaction
          .objectStore(STORE_NAMES.students)
          .index("registration")
          .get(registration) as IDBRequest<Student | undefined>,
      );
      return result ?? null;
    } finally {
      database.close();
    }
  }

  getByClassId(classId: string): Promise<Student[]> {
    return getAllByIndex<Student>(STORE_NAMES.students, "classId", classId);
  }
}

export class LocalTeacherRepository
  extends IndexedDbRepository<Teacher>
  implements TeacherRepository
{
  constructor() {
    super(STORE_NAMES.teachers);
  }
}

export class LocalClassRepository
  extends IndexedDbRepository<SchoolClass>
  implements ClassRepository
{
  constructor() {
    super(STORE_NAMES.classes);
  }
}

export class LocalSubjectRepository
  extends IndexedDbRepository<Subject>
  implements SubjectRepository
{
  constructor() {
    super(STORE_NAMES.subjects);
  }
}

export class LocalAssessmentRepository
  extends IndexedDbRepository<Assessment>
  implements AssessmentRepository
{
  constructor() {
    super(STORE_NAMES.assessments);
  }

  getByClassId(classId: string): Promise<Assessment[]> {
    return getAllByIndex<Assessment>(STORE_NAMES.assessments, "classId", classId);
  }

  getBySubjectId(subjectId: string): Promise<Assessment[]> {
    return getAllByIndex<Assessment>(
      STORE_NAMES.assessments,
      "subjectId",
      subjectId,
    );
  }

  async getByClassAndSubject(
    classId: string,
    subjectId: string,
  ): Promise<Assessment[]> {
    const assessments = await this.getByClassId(classId);
    return assessments.filter((assessment) => assessment.subjectId === subjectId);
  }
}

export class LocalTeachingAssignmentRepository
  extends IndexedDbRepository<TeachingAssignment>
  implements TeachingAssignmentRepository
{
  constructor() {
    super(STORE_NAMES.teachingAssignments);
  }

  getByTeacherId(teacherId: string): Promise<TeachingAssignment[]> {
    return getAllByIndex<TeachingAssignment>(
      STORE_NAMES.teachingAssignments,
      "teacherId",
      teacherId,
    );
  }

  getByClassId(classId: string): Promise<TeachingAssignment[]> {
    return getAllByIndex<TeachingAssignment>(
      STORE_NAMES.teachingAssignments,
      "classId",
      classId,
    );
  }

  getBySubjectId(subjectId: string): Promise<TeachingAssignment[]> {
    return getAllByIndex<TeachingAssignment>(
      STORE_NAMES.teachingAssignments,
      "subjectId",
      subjectId,
    );
  }

  async getByTeacherClassSubject(
    teacherId: string,
    classId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null> {
    const database = await openOrdemDatabase();
    try {
      const transaction = database.transaction(
        STORE_NAMES.teachingAssignments,
        "readonly",
      );
      const result = await requestToPromise(
        transaction
          .objectStore(STORE_NAMES.teachingAssignments)
          .index("teacherClassSubject")
          .get([teacherId, classId, subjectId]) as IDBRequest<
          TeachingAssignment | undefined
        >,
      );
      return result ?? null;
    } finally {
      database.close();
    }
  }
}

export class LocalGradeRepository
  extends IndexedDbRepository<Grade>
  implements GradeRepository
{
  constructor() {
    super(STORE_NAMES.grades);
  }

  getByStudentId(studentId: string): Promise<Grade[]> {
    return getAllByIndex<Grade>(STORE_NAMES.grades, "studentId", studentId);
  }

  getByAssessmentId(assessmentId: string): Promise<Grade[]> {
    return getAllByIndex<Grade>(
      STORE_NAMES.grades,
      "assessmentId",
      assessmentId,
    );
  }

  async getByStudentAndAssessment(
    studentId: string,
    assessmentId: string,
  ): Promise<Grade | null> {
    const database = await openOrdemDatabase();
    try {
      const transaction = database.transaction(STORE_NAMES.grades, "readonly");
      const result = await requestToPromise(
        transaction
          .objectStore(STORE_NAMES.grades)
          .index("studentAssessment")
          .get([studentId, assessmentId]) as IDBRequest<Grade | undefined>,
      );
      return result ?? null;
    } finally {
      database.close();
    }
  }

  override save(grade: Grade): Promise<void> {
    return this.upsert(grade);
  }

  async upsert(grade: Grade): Promise<void> {
    const database = await openOrdemDatabase();
    const transaction = database.transaction(STORE_NAMES.grades, "readwrite");
    const done = transactionDone(transaction);

    try {
      const store = transaction.objectStore(STORE_NAMES.grades);
      const existing = await requestToPromise(
        store
          .index("studentAssessment")
          .get([grade.studentId, grade.assessmentId]) as IDBRequest<
          Grade | undefined
        >,
      );

      store.put({
        ...grade,
        id: existing?.id ?? grade.id,
        createdAt: existing?.createdAt ?? grade.createdAt,
      });
      await done;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // A transação pode já ter sido abortada pelo IndexedDB.
      }
      throw error;
    } finally {
      database.close();
    }
  }

  async saveGradeWithAudit(
    grade: Grade,
    auditEntry: AuditEntry,
  ): Promise<void> {
    await this.saveGradesWithAudit([{ grade, auditEntry }]);
  }

  async saveGradesWithAudit(
    entries: readonly GradeAuditWrite[],
  ): Promise<Grade[]> {
    if (entries.length === 0) {
      return [];
    }

    const database = await openOrdemDatabase();
    const transaction = database.transaction(
      [STORE_NAMES.grades, STORE_NAMES.auditEntries],
      "readwrite",
    );
    const done = transactionDone(transaction);

    try {
      const gradeStore = transaction.objectStore(STORE_NAMES.grades);
      const auditStore = transaction.objectStore(STORE_NAMES.auditEntries);
      const persistedGrades: Grade[] = [];

      for (const { grade, auditEntry } of entries) {
        const existing = await requestToPromise(
          gradeStore
            .index("studentAssessment")
            .get([grade.studentId, grade.assessmentId]) as IDBRequest<
            Grade | undefined
          >,
        );
        const persistedGrade: Grade = {
          ...grade,
          id: existing?.id ?? grade.id,
          createdAt: existing?.createdAt ?? grade.createdAt,
        };
        const persistedAuditEntry: AuditEntry = {
          ...auditEntry,
          entityId: persistedGrade.id,
        };

        gradeStore.put(persistedGrade);
        auditStore.add(persistedAuditEntry);
        persistedGrades.push(persistedGrade);
      }

      await done;
      return persistedGrades;
    } catch (error) {
      try {
        transaction.abort();
      } catch {
        // A transação pode já ter sido abortada pelo IndexedDB.
      }
      throw error;
    } finally {
      database.close();
    }
  }
}

export class LocalAuditRepository
  extends IndexedDbRepository<AuditEntry>
  implements AuditRepository
{
  constructor() {
    super(STORE_NAMES.auditEntries);
  }

  getByEntityId(entityId: string): Promise<AuditEntry[]> {
    return getAllByIndex<AuditEntry>(
      STORE_NAMES.auditEntries,
      "entityId",
      entityId,
    );
  }
}
