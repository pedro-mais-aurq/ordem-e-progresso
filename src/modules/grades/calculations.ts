import { ACADEMIC_DEMO_CONFIG } from "@/src/config/academic-demo";
import type { Assessment, Grade } from "@/src/types/academic";

export type AcademicState = "pending" | "regular" | "attention";

export interface StudentAverageResult {
  average: number | null;
  pendingCount: number;
  completedCount: number;
  totalCount: number;
  isPartial: boolean;
}

export function normalizeScore(score: number, maxScore: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0) {
    throw new Error("Nota e valor máximo precisam ser números válidos.");
  }
  return (score / maxScore) * 10;
}

export function calculateWeightedAverage(
  assessments: Assessment[],
  grades: Grade[],
): StudentAverageResult {
  const gradeByAssessment = new Map(
    grades
      .filter((grade) => grade.status === "recorded" && grade.score !== null)
      .map((grade) => [grade.assessmentId, grade]),
  );

  let weightedTotal = 0;
  let weightTotal = 0;
  let completedCount = 0;

  for (const assessment of assessments) {
    const grade = gradeByAssessment.get(assessment.id);
    if (!grade || grade.score === null) {
      continue;
    }
    weightedTotal += normalizeScore(grade.score, assessment.maxScore) * assessment.weight;
    weightTotal += assessment.weight;
    completedCount += 1;
  }

  const pendingCount = Math.max(assessments.length - completedCount, 0);
  return {
    average: weightTotal > 0 ? weightedTotal / weightTotal : null,
    pendingCount,
    completedCount,
    totalCount: assessments.length,
    isPartial: pendingCount > 0,
  };
}

export function calculateStudentAcademicState(
  assessments: Assessment[],
  grades: Grade[],
  passingAverage = ACADEMIC_DEMO_CONFIG.passingAverage,
): AcademicState {
  const result = calculateWeightedAverage(assessments, grades);
  if (result.pendingCount > 0) {
    return "pending";
  }
  if (result.average === null) {
    return "pending";
  }
  return result.average >= passingAverage ? "regular" : "attention";
}

export function calculateClassAverage(
  assessments: Assessment[],
  gradesByStudent: Map<string, Grade[]>,
): number | null {
  const averages = [...gradesByStudent.values()]
    .map((grades) => calculateWeightedAverage(assessments, grades).average)
    .filter((average): average is number => average !== null);

  if (averages.length === 0) {
    return null;
  }

  return averages.reduce((sum, average) => sum + average, 0) / averages.length;
}

export function countPendingGrades(
  studentIds: string[],
  assessments: Assessment[],
  grades: Grade[],
): number {
  const recorded = new Set(
    grades
      .filter((grade) => grade.status === "recorded" && grade.score !== null)
      .map((grade) => `${grade.studentId}::${grade.assessmentId}`),
  );

  let pending = 0;
  for (const studentId of studentIds) {
    for (const assessment of assessments) {
      if (!recorded.has(`${studentId}::${assessment.id}`)) {
        pending += 1;
      }
    }
  }
  return pending;
}
