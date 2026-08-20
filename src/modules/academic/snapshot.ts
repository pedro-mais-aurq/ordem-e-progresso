import type {
  AcademicDataset,
  Assessment,
  Grade,
} from "@/src/types/academic";

export function upsertGradeInSnapshot(
  dataset: AcademicDataset,
  grade: Grade,
): AcademicDataset {
  return {
    ...dataset,
    grades: [
      ...dataset.grades.filter(
        (current) =>
          !(
            current.studentId === grade.studentId &&
            current.assessmentId === grade.assessmentId
          ),
      ),
      grade,
    ],
  };
}

export function upsertGradesInSnapshot(
  dataset: AcademicDataset,
  grades: readonly Grade[],
): AcademicDataset {
  return grades.reduce(upsertGradeInSnapshot, dataset);
}

export function upsertAssessmentInSnapshot(
  dataset: AcademicDataset,
  assessment: Assessment,
): AcademicDataset {
  return {
    ...dataset,
    assessments: [
      ...dataset.assessments.filter(
        (current) => current.id !== assessment.id,
      ),
      assessment,
    ],
  };
}
