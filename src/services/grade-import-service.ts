import type {
  AssessmentRepository,
  GradeAuditWrite,
  GradeRepository,
  StudentRepository,
  TeachingAssignmentRepository,
} from "@/src/repositories/contracts";
import type { Assessment, AuditEntry, Grade, Student } from "@/src/types/academic";
import type { CsvGradeRow } from "@/src/modules/grades/csv-import";
import { normalizeAssessmentStatus } from "./academic-services";

export type GradeImportStatus = "new" | "unchanged" | "conflict" | "error";
export type GradeConflictResolution = "keep" | "replace";

export interface GradeImportPreviewRow extends CsvGradeRow {
  studentId: string | null;
  studentName: string | null;
  currentScore: number | null;
  status: GradeImportStatus;
  message: string | null;
}

export interface GradeImportPreview {
  assessmentId: string;
  rows: GradeImportPreviewRow[];
  hasErrors: boolean;
  conflictCount: number;
}

export interface ApplyGradeImportInput {
  teacherId: string;
  assessmentId: string;
  rows: readonly CsvGradeRow[];
  resolutions: Readonly<Record<string, GradeConflictResolution | undefined>>;
}

export interface GradeImportResult {
  grades: Grade[];
  added: number;
  updated: number;
  kept: number;
}

const REGISTRATION_PATTERN = /^[0-9]{8}$/;

interface GradeImportContext {
  studentsByRegistration: ReadonlyMap<string, Student>;
  gradesByStudentId: ReadonlyMap<string, Grade>;
}

function createImportId(prefix: "grade" | "audit"): string {
  const value =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export class GradeImportService {
  constructor(
    private readonly grades: GradeRepository,
    private readonly assessments: AssessmentRepository,
    private readonly students: StudentRepository,
    private readonly assignments: TeachingAssignmentRepository,
  ) {}

  async preview(
    teacherId: string,
    assessmentId: string,
    rows: readonly CsvGradeRow[],
  ): Promise<GradeImportPreview> {
    this.assertValidRows(rows);
    const assessment = await this.assertAuthorizedAssessment(teacherId, assessmentId);
    const context = await this.loadImportContext(assessment);
    return this.createPreview(assessment, rows, context);
  }

  async apply(input: ApplyGradeImportInput): Promise<GradeImportResult> {
    this.assertValidRows(input.rows);
    const assessment = await this.assertAuthorizedAssessment(
      input.teacherId,
      input.assessmentId,
    );
    // Recarregue o contexto em lote na confirmação. Isso evita reutilizar uma
    // prévia stale sem voltar ao padrão de uma consulta por linha.
    const context = await this.loadImportContext(assessment);
    const preview = this.createPreview(assessment, input.rows, context);
    if (preview.hasErrors) {
      throw new Error("Corrija os erros do CSV antes de confirmar a importação.");
    }

    const writes: GradeAuditWrite[] = [];
    let added = 0;
    let updated = 0;
    let kept = 0;
    const timestamp = new Date().toISOString();

    for (const row of preview.rows) {
      if (!row.studentId) {
        throw new Error("A prévia contém uma linha sem estudante resolvido.");
      }
      if (row.status === "unchanged") {
        kept += 1;
        continue;
      }
      if (row.status === "conflict" && input.resolutions[row.registration] === "keep") {
        kept += 1;
        continue;
      }
      if (row.status === "conflict" && input.resolutions[row.registration] !== "replace") {
        throw new Error(`Resolva o conflito da matrícula ${row.registration}.`);
      }

      const existing = context.gradesByStudentId.get(row.studentId);
      const grade: Grade = {
        id: existing?.id ?? createImportId("grade"),
        studentId: row.studentId,
        assessmentId: input.assessmentId,
        score: row.score,
        status: "recorded",
        source: "csv",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      };
      const auditEntry: AuditEntry = {
        id: createImportId("audit"),
        actorId: input.teacherId,
        action: existing ? "grade.updated" : "grade.created",
        entityType: "grade",
        entityId: grade.id,
        previousValue: existing?.score ?? null,
        newValue: row.score,
        source: "csv",
        timestamp,
      };
      writes.push({ grade, auditEntry });
      if (existing) updated += 1;
      else added += 1;
    }

    const persistedGrades = await this.grades.saveGradesWithAudit(writes);
    return { grades: persistedGrades, added, updated, kept };
  }

  private assertValidRows(rows: readonly CsvGradeRow[]): void {
    const registrations = new Set<string>();

    for (const row of rows) {
      if (!REGISTRATION_PATTERN.test(row.registration)) {
        throw new Error(
          `A matrícula da linha ${row.line} deve possuir exatamente 8 dígitos.`,
        );
      }
      if (registrations.has(row.registration)) {
        throw new Error(
          `A matrícula ${row.registration} está duplicada no conjunto recebido.`,
        );
      }
      registrations.add(row.registration);

      if (!Number.isFinite(row.score)) {
        throw new Error(`A nota da matrícula ${row.registration} deve ser finita.`);
      }
    }
  }

  private async loadImportContext(
    assessment: Assessment,
  ): Promise<GradeImportContext> {
    const [students, grades] = await Promise.all([
      this.students.getByClassId(assessment.classId),
      this.grades.getByAssessmentId(assessment.id),
    ]);

    return {
      studentsByRegistration: new Map(
        students.map((student) => [student.registration, student]),
      ),
      gradesByStudentId: new Map(
        grades.map((grade) => [grade.studentId, grade]),
      ),
    };
  }

  private createPreview(
    assessment: Assessment,
    rows: readonly CsvGradeRow[],
    context: GradeImportContext,
  ): GradeImportPreview {
    const previewRows = rows.map((row): GradeImportPreviewRow => {
      const student = context.studentsByRegistration.get(row.registration);
      if (!student) {
        return this.errorRow(
          row,
          "Matrícula não encontrada na turma da avaliação.",
        );
      }
      if (!student.active) {
        return this.errorRow(row, "O estudante está inativo.", student.id, student.name);
      }
      if (student.classId !== assessment.classId) {
        return this.errorRow(row, "O estudante pertence a outra turma.", student.id, student.name);
      }
      if (row.score < 0 || row.score > assessment.maxScore) {
        return this.errorRow(
          row,
          `A nota deve estar entre 0 e ${assessment.maxScore}.`,
          student.id,
          student.name,
        );
      }

      const existing = context.gradesByStudentId.get(student.id);
      const status: GradeImportStatus = !existing
        ? "new"
        : existing.score === row.score && existing.status === "recorded"
          ? "unchanged"
          : "conflict";
      return {
        ...row,
        studentId: student.id,
        studentName: student.name,
        currentScore: existing?.score ?? null,
        status,
        message: null,
      };
    });

    return {
      assessmentId: assessment.id,
      rows: previewRows,
      hasErrors: previewRows.some((row) => row.status === "error"),
      conflictCount: previewRows.filter((row) => row.status === "conflict").length,
    };
  }

  private async assertAuthorizedAssessment(teacherId: string, assessmentId: string) {
    const assessment = await this.assessments.getById(assessmentId);
    if (!assessment) throw new Error("Avaliação não encontrada.");
    if (normalizeAssessmentStatus(assessment.status) === "closed") {
      throw new Error("Avaliação fechada não permite importação de notas.");
    }
    const assignment = await this.assignments.getByTeacherClassSubject(
      teacherId,
      assessment.classId,
      assessment.subjectId,
    );
    if (!assignment || !assignment.active) {
      throw new Error("O professor não possui TeachingAssignment ativo para esta avaliação.");
    }
    return assessment;
  }

  private errorRow(
    row: CsvGradeRow,
    message: string,
    studentId: string | null = null,
    studentName: string | null = null,
  ): GradeImportPreviewRow {
    return {
      ...row,
      studentId,
      studentName,
      currentScore: null,
      status: "error",
      message,
    };
  }
}
