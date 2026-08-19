import type {
  AssessmentRepository,
  AuditRepository,
  ClassRepository,
  GradeRepository,
  StudentRepository,
  SubjectRepository,
  TeacherRepository,
  TeachingAssignmentRepository,
} from "@/src/repositories/contracts";
import type {
  Assessment,
  AssessmentStatus,
  AuditEntry,
  Grade,
  SchoolClass,
  Student,
  Subject,
  Teacher,
  TeachingAssignment,
} from "@/src/types/academic";

export function isValidRegistration(registration: string): boolean {
  return /^\d{8}$/.test(registration);
}

function createId(prefix: string): string {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

export function normalizeAssessmentStatus(status: unknown): AssessmentStatus {
  if (status === "draft" || status === "reviewed" || status === "closed") {
    return status;
  }

  // Compatibilidade de dados da P1 sem migration de schema:
  // scheduled -> draft; completed -> reviewed.
  if (status === "scheduled") {
    return "draft";
  }
  if (status === "completed") {
    return "reviewed";
  }

  return "draft";
}

function normalizeAssessment(assessment: Assessment): Assessment {
  return {
    ...assessment,
    status: normalizeAssessmentStatus(assessment.status),
  };
}

function assertValidDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Informe uma data válida para a avaliação.");
  }
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error("Informe uma data válida para a avaliação.");
  }
}

export class StudentService {
  constructor(private readonly repository: StudentRepository) {}

  async getAll(): Promise<Student[]> {
    return this.repository.getAll();
  }

  async getActive(): Promise<Student[]> {
    const students = await this.repository.getAll();
    return students.filter((student) => student.active);
  }

  async getByClass(classId: string): Promise<Student[]> {
    const students = await this.repository.getByClassId(classId);
    return students
      .filter((student) => student.active)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  async getById(id: string): Promise<Student | null> {
    return this.repository.getById(id);
  }

  async getByRegistration(registration: string): Promise<Student | null> {
    if (!isValidRegistration(registration)) {
      return null;
    }
    return this.repository.getByRegistration(registration);
  }

  async save(student: Student): Promise<void> {
    if (!isValidRegistration(student.registration)) {
      throw new Error("A matrícula deve possuir exatamente 8 dígitos.");
    }
    await this.repository.save(student);
  }
}

class BasicService<T extends { id: string }> {
  constructor(
    private readonly repository: {
      getAll(): Promise<T[]>;
      getById(id: string): Promise<T | null>;
      save(entity: T): Promise<void>;
    },
  ) {}

  getAll(): Promise<T[]> {
    return this.repository.getAll();
  }

  getById(id: string): Promise<T | null> {
    return this.repository.getById(id);
  }

  save(entity: T): Promise<void> {
    return this.repository.save(entity);
  }
}

export class TeacherService extends BasicService<Teacher> {
  constructor(repository: TeacherRepository) {
    super(repository);
  }
}

export class ClassService extends BasicService<SchoolClass> {
  constructor(repository: ClassRepository) {
    super(repository);
  }
}

export class SubjectService extends BasicService<Subject> {
  constructor(repository: SubjectRepository) {
    super(repository);
  }
}

export interface AssessmentInput {
  name: string;
  classId: string;
  subjectId: string;
  period: string;
  date: string;
  type: Assessment["type"];
  maxScore: number;
  weight: number;
}

export class AssessmentService {
  constructor(
    private readonly repository: AssessmentRepository,
    private readonly assignmentRepository: TeachingAssignmentRepository,
    private readonly classRepository: ClassRepository,
    private readonly subjectRepository: SubjectRepository,
  ) {}

  async getAll(): Promise<Assessment[]> {
    const assessments = await this.repository.getAll();
    return assessments.map(normalizeAssessment).sort(sortAssessments);
  }

  async getById(id: string): Promise<Assessment | null> {
    const assessment = await this.repository.getById(id);
    return assessment ? normalizeAssessment(assessment) : null;
  }

  async getByClass(classId: string): Promise<Assessment[]> {
    const assessments = await this.repository.getByClassId(classId);
    return assessments.map(normalizeAssessment).sort(sortAssessments);
  }

  async getByClassAndSubject(
    classId: string,
    subjectId: string,
  ): Promise<Assessment[]> {
    const assessments = await this.repository.getByClassAndSubject(
      classId,
      subjectId,
    );
    return assessments.map(normalizeAssessment).sort(sortAssessments);
  }

  async create(input: AssessmentInput, teacherId: string): Promise<Assessment> {
    await this.validateInput(input, teacherId);

    const assessment: Assessment = {
      id: createId("assessment"),
      ...input,
      name: input.name.trim(),
      period: input.period.trim(),
      status: "draft",
    };

    await this.repository.save(assessment);
    return assessment;
  }

  async update(
    assessment: Assessment,
    teacherId: string,
  ): Promise<Assessment> {
    const existing = await this.repository.getById(assessment.id);
    if (!existing) {
      throw new Error("Avaliação não encontrada.");
    }

    const normalizedExisting = normalizeAssessment(existing);
    if (normalizedExisting.status === "closed") {
      throw new Error("Avaliação fechada não pode ser editada.");
    }

    await this.validateInput(assessment, teacherId);
    const updated: Assessment = {
      ...assessment,
      name: assessment.name.trim(),
      period: assessment.period.trim(),
      status: normalizeAssessmentStatus(assessment.status),
    };
    await this.repository.save(updated);
    return updated;
  }

  private async validateInput(
    input: AssessmentInput,
    teacherId: string,
  ): Promise<void> {
    if (!input.name.trim()) {
      throw new Error("O nome da avaliação é obrigatório.");
    }
    if (!Number.isFinite(input.maxScore) || input.maxScore <= 0) {
      throw new Error("O valor máximo deve ser maior que zero.");
    }
    if (!Number.isFinite(input.weight) || input.weight <= 0) {
      throw new Error("O peso deve ser maior que zero.");
    }
    if (!input.period.trim()) {
      throw new Error("O período é obrigatório.");
    }
    assertValidDate(input.date);

    const [schoolClass, subject, assignment] = await Promise.all([
      this.classRepository.getById(input.classId),
      this.subjectRepository.getById(input.subjectId),
      this.assignmentRepository.getByTeacherClassSubject(
        teacherId,
        input.classId,
        input.subjectId,
      ),
    ]);

    if (!schoolClass) {
      throw new Error("Turma inexistente.");
    }
    if (!subject) {
      throw new Error("Disciplina inexistente.");
    }
    if (!assignment || !assignment.active) {
      throw new Error(
        "O professor não possui TeachingAssignment ativo para essa turma e disciplina.",
      );
    }
  }
}

function sortAssessments(a: Assessment, b: Assessment): number {
  const byDate = a.date.localeCompare(b.date);
  return byDate !== 0 ? byDate : a.name.localeCompare(b.name, "pt-BR");
}

export class TeachingAssignmentService extends BasicService<TeachingAssignment> {
  constructor(
    private readonly assignmentRepository: TeachingAssignmentRepository,
  ) {
    super(assignmentRepository);
  }

  getByTeacher(teacherId: string): Promise<TeachingAssignment[]> {
    return this.assignmentRepository.getByTeacherId(teacherId);
  }

  getByClass(classId: string): Promise<TeachingAssignment[]> {
    return this.assignmentRepository.getByClassId(classId);
  }

  getBySubject(subjectId: string): Promise<TeachingAssignment[]> {
    return this.assignmentRepository.getBySubjectId(subjectId);
  }

  getAssignment(
    teacherId: string,
    classId: string,
    subjectId: string,
  ): Promise<TeachingAssignment | null> {
    return this.assignmentRepository.getByTeacherClassSubject(
      teacherId,
      classId,
      subjectId,
    );
  }
}

export interface SaveManualGradeInput {
  studentId: string;
  assessmentId: string;
  score: number;
  actorId: string;
}

export interface SaveManualGradeResult {
  changed: boolean;
  grade: Grade;
}

export class GradeService extends BasicService<Grade> {
  constructor(
    private readonly gradeRepository: GradeRepository,
    private readonly assessmentRepository?: AssessmentRepository,
    private readonly studentRepository?: StudentRepository,
    private readonly assignmentRepository?: TeachingAssignmentRepository,
  ) {
    super(gradeRepository);
  }

  getByStudent(studentId: string): Promise<Grade[]> {
    return this.gradeRepository.getByStudentId(studentId);
  }

  getByAssessment(assessmentId: string): Promise<Grade[]> {
    return this.gradeRepository.getByAssessmentId(assessmentId);
  }

  async getByAssessments(assessmentIds: string[]): Promise<Grade[]> {
    const groups = await Promise.all(
      assessmentIds.map((assessmentId) =>
        this.gradeRepository.getByAssessmentId(assessmentId),
      ),
    );
    return groups.flat();
  }

  getByStudentAndAssessment(
    studentId: string,
    assessmentId: string,
  ): Promise<Grade | null> {
    return this.gradeRepository.getByStudentAndAssessment(
      studentId,
      assessmentId,
    );
  }

  upsert(grade: Grade): Promise<void> {
    return this.gradeRepository.upsert(grade);
  }

  saveGradeWithAudit(
    grade: Grade,
    auditEntry: AuditEntry,
  ): Promise<void> {
    return this.gradeRepository.saveGradeWithAudit(grade, auditEntry);
  }

  async saveManualGrade(
    input: SaveManualGradeInput,
  ): Promise<SaveManualGradeResult> {
    if (!Number.isFinite(input.score)) {
      throw new Error("A nota precisa ser numérica.");
    }

    if (
      !this.assessmentRepository ||
      !this.studentRepository ||
      !this.assignmentRepository
    ) {
      throw new Error(
        "GradeService não foi composto com as dependências acadêmicas da P2.",
      );
    }

    const [rawAssessment, student] = await Promise.all([
      this.assessmentRepository.getById(input.assessmentId),
      this.studentRepository.getById(input.studentId),
    ]);

    if (!rawAssessment) {
      throw new Error("Avaliação não encontrada.");
    }
    if (!student) {
      throw new Error("Aluno não encontrado.");
    }

    const assessment = normalizeAssessment(rawAssessment);
    if (assessment.status === "closed") {
      throw new Error("Avaliação fechada não permite edição de notas.");
    }
    if (student.classId !== assessment.classId) {
      throw new Error("Aluno não pertence à turma da avaliação.");
    }
    if (input.score < 0 || input.score > assessment.maxScore) {
      throw new Error(
        `A nota deve estar entre 0 e ${assessment.maxScore}.`,
      );
    }

    const assignment =
      await this.assignmentRepository.getByTeacherClassSubject(
        input.actorId,
        assessment.classId,
        assessment.subjectId,
      );
    if (!assignment || !assignment.active) {
      throw new Error(
        "O professor não possui TeachingAssignment ativo para esta avaliação.",
      );
    }

    const existing =
      await this.gradeRepository.getByStudentAndAssessment(
        input.studentId,
        input.assessmentId,
      );

    if (
      existing &&
      existing.status === "recorded" &&
      existing.score === input.score
    ) {
      return { changed: false, grade: existing };
    }

    const timestamp = new Date().toISOString();
    const grade: Grade = {
      id: existing?.id ?? createId("grade"),
      studentId: input.studentId,
      assessmentId: input.assessmentId,
      score: input.score,
      status: "recorded",
      source: "manual",
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    const auditEntry: AuditEntry = {
      id: createId("audit"),
      actorId: input.actorId,
      action: existing ? "grade.updated" : "grade.created",
      entityType: "grade",
      entityId: grade.id,
      previousValue: existing?.score ?? null,
      newValue: input.score,
      source: "manual",
      timestamp,
    };

    await this.gradeRepository.saveGradeWithAudit(grade, auditEntry);
    return { changed: true, grade };
  }
}

export class AuditService extends BasicService<AuditEntry> {
  constructor(private readonly auditRepository: AuditRepository) {
    super(auditRepository);
  }

  getByEntity(entityId: string): Promise<AuditEntry[]> {
    return this.auditRepository.getByEntityId(entityId);
  }

  async getByEntities(entityIds: string[]): Promise<AuditEntry[]> {
    const groups = await Promise.all(
      entityIds.map((entityId) => this.auditRepository.getByEntityId(entityId)),
    );
    return groups
      .flat()
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }
}

export interface AcademicServices {
  students: StudentService;
  teachers: TeacherService;
  classes: ClassService;
  subjects: SubjectService;
  assessments: AssessmentService;
  teachingAssignments: TeachingAssignmentService;
  grades: GradeService;
  audit: AuditService;
}
