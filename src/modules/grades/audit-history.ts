import type { AuditEntry, Grade } from "@/src/types/academic";

export function selectContextualStudentGrades(
  grades: Grade[],
  studentId: string,
  assessmentIds: string[],
): Grade[] {
  const allowedAssessmentIds = new Set(assessmentIds);
  return grades.filter(
    (grade) =>
      grade.studentId === studentId &&
      allowedAssessmentIds.has(grade.assessmentId),
  );
}

export type AuditHistoryState =
  | { status: "success"; entries: AuditEntry[]; error: null }
  | { status: "empty"; entries: []; error: null }
  | { status: "error"; entries: []; error: string };

export async function loadAuditHistory(
  entityIds: string[],
  getByEntities: (entityIds: string[]) => Promise<AuditEntry[]>,
): Promise<AuditHistoryState> {
  try {
    const entries = await getByEntities(entityIds);
    if (entries.length === 0) {
      return { status: "empty", entries: [], error: null };
    }
    return { status: "success", entries, error: null };
  } catch (cause) {
    return {
      status: "error",
      entries: [],
      error:
        cause instanceof Error
          ? cause.message
          : "Não foi possível consultar o histórico de alterações.",
    };
  }
}

export function shouldCloseStudentDetail(key: string): boolean {
  return key === "Escape";
}
