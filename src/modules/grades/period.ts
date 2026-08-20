import type { Assessment } from "@/src/types/academic";

export function filterAssessmentsByPeriod(
  assessments: Assessment[],
  period: string,
): Assessment[] {
  return assessments.filter((assessment) => assessment.period === period);
}
