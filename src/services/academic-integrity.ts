import { isAcademicPeriod } from "@/src/config/academic-demo";
import {
  isAssessmentStatus,
  isAssessmentType,
} from "@/src/modules/assessments/validation";
import type { AcademicDataset } from "@/src/types/academic";

export type AcademicIntegrityIssueCode =
  | "student.class.missing"
  | "assessment.class.missing"
  | "assessment.subject.missing"
  | "assessment.max-score.invalid"
  | "assessment.weight.invalid"
  | "assessment.period.invalid"
  | "assessment.type.invalid"
  | "assessment.status.invalid"
  | "grade.student.missing"
  | "grade.assessment.missing"
  | "grade.class.mismatch"
  | "grade.score.invalid"
  | "grade.score.above-maximum";

export interface AcademicIntegrityIssue {
  code: AcademicIntegrityIssueCode;
  entityId: string;
  message: string;
}

export interface AcademicIntegrityResult {
  valid: boolean;
  issues: AcademicIntegrityIssue[];
}

export class AcademicIntegrityError extends Error {
  readonly issues: AcademicIntegrityIssue[];

  constructor(issues: AcademicIntegrityIssue[]) {
    super("Os dados locais da demonstração estão inconsistentes.");
    this.name = "AcademicIntegrityError";
    this.issues = issues;
  }
}

export function validateAcademicDataset(
  dataset: AcademicDataset,
): AcademicIntegrityResult {
  const issues: AcademicIntegrityIssue[] = [];
  const classes = new Set(dataset.classes.map((item) => item.id));
  const subjects = new Set(dataset.subjects.map((item) => item.id));
  const students = new Map(dataset.students.map((item) => [item.id, item]));
  const assessments = new Map(
    dataset.assessments.map((item) => [item.id, item]),
  );

  for (const student of dataset.students) {
    if (!classes.has(student.classId)) {
      issues.push({
        code: "student.class.missing",
        entityId: student.id,
        message: `O estudante "${student.id}" referencia uma turma inexistente.`,
      });
    }
  }

  for (const assessment of dataset.assessments) {
    if (!classes.has(assessment.classId)) {
      issues.push({
        code: "assessment.class.missing",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" referencia uma turma inexistente.`,
      });
    }
    if (!subjects.has(assessment.subjectId)) {
      issues.push({
        code: "assessment.subject.missing",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" referencia uma disciplina inexistente.`,
      });
    }
    if (!Number.isFinite(assessment.maxScore) || assessment.maxScore <= 0) {
      issues.push({
        code: "assessment.max-score.invalid",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" possui valor máximo inválido.`,
      });
    }
    if (!Number.isFinite(assessment.weight) || assessment.weight <= 0) {
      issues.push({
        code: "assessment.weight.invalid",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" possui peso inválido.`,
      });
    }
    if (!isAcademicPeriod(assessment.period)) {
      issues.push({
        code: "assessment.period.invalid",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" possui período inválido.`,
      });
    }
    if (!isAssessmentType(assessment.type)) {
      issues.push({
        code: "assessment.type.invalid",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" possui tipo inválido.`,
      });
    }
    if (!isAssessmentStatus(assessment.status)) {
      issues.push({
        code: "assessment.status.invalid",
        entityId: assessment.id,
        message: `A avaliação "${assessment.id}" possui status inválido.`,
      });
    }
  }

  for (const grade of dataset.grades) {
    const student = students.get(grade.studentId);
    const assessment = assessments.get(grade.assessmentId);

    if (!student) {
      issues.push({
        code: "grade.student.missing",
        entityId: grade.id,
        message: `A nota "${grade.id}" referencia um estudante inexistente.`,
      });
    }
    if (!assessment) {
      issues.push({
        code: "grade.assessment.missing",
        entityId: grade.id,
        message: `A nota "${grade.id}" referencia uma avaliação inexistente.`,
      });
    }
    if (student && assessment && student.classId !== assessment.classId) {
      issues.push({
        code: "grade.class.mismatch",
        entityId: grade.id,
        message: `A nota "${grade.id}" relaciona estudante e avaliação de turmas diferentes.`,
      });
    }

    if (
      grade.status === "recorded" &&
      (typeof grade.score !== "number" || !Number.isFinite(grade.score))
    ) {
      issues.push({
        code: "grade.score.invalid",
        entityId: grade.id,
        message: `A nota "${grade.id}" possui pontuação registrada inválida.`,
      });
      continue;
    }

    if (grade.score !== null) {
      if (!Number.isFinite(grade.score) || grade.score < 0) {
        issues.push({
          code: "grade.score.invalid",
          entityId: grade.id,
          message: `A nota "${grade.id}" possui pontuação negativa ou inválida.`,
        });
      } else if (assessment && grade.score > assessment.maxScore) {
        issues.push({
          code: "grade.score.above-maximum",
          entityId: grade.id,
          message: `A nota "${grade.id}" supera o valor máximo da avaliação.`,
        });
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

export function ensureAcademicDatasetIntegrity(dataset: AcademicDataset): void {
  const result = validateAcademicDataset(dataset);
  if (!result.valid) {
    throw new AcademicIntegrityError(result.issues);
  }
}

export function isAcademicIntegrityError(
  error: unknown,
): error is AcademicIntegrityError {
  return error instanceof AcademicIntegrityError;
}
