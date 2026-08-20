import type { AcademicSeedDataset, MetadataRecord } from "@/src/types/academic";
import {
  deleteDemoDatabase,
  openOrdemDatabase,
  requestToPromise,
  transactionDone,
} from "../indexed-db/client";
import { ACADEMIC_STORE_NAMES, STORE_NAMES } from "../indexed-db/config";
import { demoSeedDataset } from "./data";

export const SEED_VERSION = "p2-v2";
const SEED_KEY = "demo-seed-version";

const CORE_DATA_STORES = [
  STORE_NAMES.students,
  STORE_NAMES.teachers,
  STORE_NAMES.classes,
  STORE_NAMES.subjects,
  STORE_NAMES.assessments,
  STORE_NAMES.grades,
  STORE_NAMES.auditEntries,
] as const;

export interface SeedResult {
  seeded: boolean;
  version: string;
}

export async function seedDatabase(
  dataset: AcademicSeedDataset = demoSeedDataset,
): Promise<SeedResult> {
  const database = await openOrdemDatabase();
  const transaction = database.transaction(
    [...ACADEMIC_STORE_NAMES, STORE_NAMES.metadata],
    "readwrite",
  );
  const done = transactionDone(transaction);

  try {
    const metadataStore = transaction.objectStore(STORE_NAMES.metadata);
    const counts = await Promise.all(
      CORE_DATA_STORES.map((storeName) =>
        requestToPromise(transaction.objectStore(storeName).count()),
      ),
    );
    const isAcademicDatabaseEmpty = counts.every((count) => count === 0);

    if (isAcademicDatabaseEmpty) {
      const storeRecords: Array<[string, readonly { id: string }[]]> = [
        [STORE_NAMES.students, dataset.students],
        [STORE_NAMES.teachers, dataset.teachers],
        [STORE_NAMES.classes, dataset.classes],
        [STORE_NAMES.subjects, dataset.subjects],
        [STORE_NAMES.assessments, dataset.assessments],
        [STORE_NAMES.grades, dataset.grades],
        [STORE_NAMES.auditEntries, dataset.auditEntries],
        [STORE_NAMES.teachingAssignments, dataset.teachingAssignments],
      ];

      for (const [storeName, records] of storeRecords) {
        const store = transaction.objectStore(storeName);
        records.forEach((record) => store.add(record));
      }
    } else {
      const [teachers, classes, subjects, students, assessments] =
        await Promise.all([
          requestToPromise(
            transaction.objectStore(STORE_NAMES.teachers).getAllKeys(),
          ),
          requestToPromise(
            transaction.objectStore(STORE_NAMES.classes).getAllKeys(),
          ),
          requestToPromise(
            transaction.objectStore(STORE_NAMES.subjects).getAllKeys(),
          ),
          requestToPromise(
            transaction.objectStore(STORE_NAMES.students).getAllKeys(),
          ),
          requestToPromise(
            transaction.objectStore(STORE_NAMES.assessments).getAllKeys(),
          ),
        ]);

      const teacherIds = new Set(teachers);
      const classIds = new Set(classes);
      const subjectIds = new Set(subjects);
      const studentIds = new Set(students);
      const assessmentIds = new Set(assessments);

      const assignmentStore = transaction.objectStore(
        STORE_NAMES.teachingAssignments,
      );

      for (const assignment of dataset.teachingAssignments) {
        const referencesExist =
          teacherIds.has(assignment.teacherId) &&
          classIds.has(assignment.classId) &&
          subjectIds.has(assignment.subjectId);

        if (!referencesExist) {
          continue;
        }

        const existing = await requestToPromise(
          assignmentStore
            .index("teacherClassSubject")
            .get([
              assignment.teacherId,
              assignment.classId,
              assignment.subjectId,
            ]),
        );

        if (!existing) {
          assignmentStore.add(assignment);
        }
      }

      // Complementação P2 segura: somente avaliações canônicas ausentes.
      // Registros já existentes nunca são regravados.
      const assessmentStore = transaction.objectStore(STORE_NAMES.assessments);
      for (const assessment of dataset.assessments) {
        const referencesExist =
          classIds.has(assessment.classId) && subjectIds.has(assessment.subjectId);
        if (referencesExist && !assessmentIds.has(assessment.id)) {
          assessmentStore.add(assessment);
          assessmentIds.add(assessment.id);
        }
      }

      // Complementa apenas pares studentId + assessmentId que ainda não
      // possuem Grade. Nunca sobrescreve notas modificadas pelo usuário.
      const gradeStore = transaction.objectStore(STORE_NAMES.grades);
      for (const grade of dataset.grades) {
        if (
          !studentIds.has(grade.studentId) ||
          !assessmentIds.has(grade.assessmentId)
        ) {
          continue;
        }

        const existing = await requestToPromise(
          gradeStore
            .index("studentAssessment")
            .get([grade.studentId, grade.assessmentId]),
        );

        if (!existing) {
          gradeStore.add(grade);
        }
      }
    }

    metadataStore.put({
      id: SEED_KEY,
      value: SEED_VERSION,
    } satisfies MetadataRecord);
    await done;
    return { seeded: isAcademicDatabaseEmpty, version: SEED_VERSION };
  } finally {
    database.close();
  }
}

export async function resetDemoDatabase(): Promise<SeedResult> {
  await deleteDemoDatabase();
  return seedDatabase();
}
