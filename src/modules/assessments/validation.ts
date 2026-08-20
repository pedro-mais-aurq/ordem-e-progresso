import {
  ACADEMIC_PERIODS,
  isAcademicPeriod,
  type AcademicPeriod,
} from "@/src/config/academic-demo";
import {
  ASSESSMENT_STATUSES,
  ASSESSMENT_TYPES,
  type AssessmentStatus,
  type AssessmentType,
} from "@/src/types/academic";

export { isAcademicPeriod };

export function parseAcademicPeriod(value: unknown): AcademicPeriod {
  if (!isAcademicPeriod(value)) {
    throw new Error(
      `Período inválido. Utilize um dos períodos: ${ACADEMIC_PERIODS.join(", ")}.`,
    );
  }
  return value;
}

export function isAssessmentType(value: unknown): value is AssessmentType {
  return ASSESSMENT_TYPES.some((type) => type === value);
}

export function parseAssessmentType(value: unknown): AssessmentType {
  if (!isAssessmentType(value)) {
    throw new Error("Tipo de avaliação inválido.");
  }
  return value;
}

export function isAssessmentStatus(value: unknown): value is AssessmentStatus {
  return ASSESSMENT_STATUSES.some((status) => status === value);
}
