export const DB_NAME = "ordem-platform";
export const DB_VERSION = 2;

export const STORE_NAMES = {
  students: "students",
  teachers: "teachers",
  classes: "classes",
  subjects: "subjects",
  assessments: "assessments",
  grades: "grades",
  auditEntries: "auditEntries",
  metadata: "metadata",
  teachingAssignments: "teachingAssignments",
} as const;

export type StoreName = (typeof STORE_NAMES)[keyof typeof STORE_NAMES];

export const ACADEMIC_STORE_NAMES: StoreName[] = [
  STORE_NAMES.students,
  STORE_NAMES.teachers,
  STORE_NAMES.classes,
  STORE_NAMES.subjects,
  STORE_NAMES.assessments,
  STORE_NAMES.grades,
  STORE_NAMES.auditEntries,
  STORE_NAMES.teachingAssignments,
];
