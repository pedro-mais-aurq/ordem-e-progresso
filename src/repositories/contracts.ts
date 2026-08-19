import type {
  Assessment,
  AuditEntry,
  BaseEntity,
  Grade,
  SchoolClass,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from "@/src/types/academic";

export interface Repository<T extends BaseEntity> {
  getAll(): Promise<T[]>;
  getById(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
}

export interface StudentRepository extends Repository<Student> {
  getByRegistration(registration: string): Promise<Student | null>;
  getByClassId(classId: string): Promise<Student[]>;
}

export type TeacherRepository = Repository<Teacher>;
export type ClassRepository = Repository<SchoolClass>;
export type SubjectRepository = Repository<Subject>;

export interface AssessmentRepository extends Repository<Assessment> {
  getByClassId(classId: string): Promise<Assessment[]>;
  getBySubjectId(subjectId: string): Promise<Assessment[]>;
  getByClassAndSubject(classId: string, subjectId: string): Promise<Assessment[]>;
}

export interface TeachingAssignmentRepository
  extends Repository<TeachingAssignment> {
  getByTeacherId(teacherId: string): Promise<TeachingAssignment[]>;
  getByClassId(classId: string): Promise<TeachingAssignment[]>;
  getBySubjectId(subjectId: string): Promise<TeachingAssignment[]>;
  getByTeacherClassSubject(
    teacherId: string,
    classId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null>;
}

export interface GradeRepository extends Repository<Grade> {
  getByStudentId(studentId: string): Promise<Grade[]>;
  getByAssessmentId(assessmentId: string): Promise<Grade[]>;
  getByStudentAndAssessment(
    studentId: string,
    assessmentId: string,
  ): Promise<Grade | null>;
  upsert(grade: Grade): Promise<void>;
  saveGradeWithAudit(grade: Grade, auditEntry: AuditEntry): Promise<void>;
}

export interface AuditRepository extends Repository<AuditEntry> {
  getByEntityId(entityId: string): Promise<AuditEntry[]>;
}
