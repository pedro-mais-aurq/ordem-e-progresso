export interface BaseEntity {
  id: string;
}

export interface Student extends BaseEntity {
  registration: string;
  name: string;
  classId: string;
  active: boolean;
}

export interface Teacher extends BaseEntity {
  name: string;
  active: boolean;
}

export interface TeachingAssignment extends BaseEntity {
  teacherId: string;
  classId: string;
  subjectId: string;
  active: boolean;
}

export interface SchoolClass extends BaseEntity {
  name: string;
  gradeLevel: string;
  schoolYear: number;
}

export interface Subject extends BaseEntity {
  name: string;
}

export type AssessmentType =
  | "exam"
  | "assignment"
  | "activity"
  | "seminar"
  | "recovery"
  | "other";

export type AssessmentStatus = "draft" | "reviewed" | "closed";

export interface Assessment extends BaseEntity {
  name: string;
  classId: string;
  subjectId: string;
  period: string;
  date: string;
  type: AssessmentType;
  maxScore: number;
  weight: number;
  status: AssessmentStatus;
}

export type GradeSource = "manual" | "csv" | "automatic-correction" | "ded";
export type GradeStatus = "pending" | "recorded";

export interface Grade extends BaseEntity {
  studentId: string;
  assessmentId: string;
  score: number | null;
  status: GradeStatus;
  source: GradeSource;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEntry extends BaseEntity {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue: unknown;
  newValue: unknown;
  source: string;
  timestamp: string;
}

export interface MetadataRecord extends BaseEntity {
  value: string;
}

export interface AcademicDataset {
  students: Student[];
  teachers: Teacher[];
  classes: SchoolClass[];
  subjects: Subject[];
  assessments: Assessment[];
  grades: Grade[];
  auditEntries: AuditEntry[];
  teachingAssignments: TeachingAssignment[];
}

export type UserProfile = "professor" | "coordenacao" | "aluno";
