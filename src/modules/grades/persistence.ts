import type {
  SaveManualGradeInput,
  SaveManualGradeResult,
} from "@/src/services/academic-services";
import type { Grade } from "@/src/types/academic";

export interface ManualGradePersistence {
  saveManualGrade(input: SaveManualGradeInput): Promise<SaveManualGradeResult>;
}

export async function persistManualGradeIncrementally(
  persistence: ManualGradePersistence,
  input: SaveManualGradeInput,
  applyPersistedGrade: (grade: Grade) => void,
): Promise<Grade> {
  const result = await persistence.saveManualGrade(input);
  applyPersistedGrade(result.grade);
  return result.grade;
}
