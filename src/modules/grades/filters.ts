import { ACADEMIC_DEMO_CONFIG } from "@/src/config/academic-demo";
import {
  calculateStudentAcademicState,
  calculateWeightedAverage,
} from "@/src/modules/grades/calculations";
import type { Assessment, Grade, Student } from "@/src/types/academic";

export type GradebookFilter =
  | "all"
  | "below"
  | "pending"
  | "above";

export interface GradebookStudentRow {
  student: Student;
  grades: Grade[];
}

function normalizeSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function filterGradebookRows(
  rows: GradebookStudentRow[],
  assessments: Assessment[],
  filter: GradebookFilter,
  search: string,
  passingAverage = ACADEMIC_DEMO_CONFIG.passingAverage,
): GradebookStudentRow[] {
  const query = normalizeSearch(search.trim());

  return rows.filter((row) => {
    const matchesSearch =
      query.length === 0 ||
      normalizeSearch(row.student.name).includes(query) ||
      row.student.registration.includes(query);

    if (!matchesSearch) {
      return false;
    }

    if (filter === "all") {
      return true;
    }

    const result = calculateWeightedAverage(assessments, row.grades);
    const state = calculateStudentAcademicState(
      assessments,
      row.grades,
      passingAverage,
    );

    if (filter === "pending") {
      return state === "pending";
    }

    if (result.average === null || result.pendingCount > 0) {
      return false;
    }

    if (filter === "below") {
      return result.average < passingAverage;
    }

    return result.average >= passingAverage;
  });
}
