export type GradeNavigationAction = "enter" | "tab" | "shiftTab";

export interface EditableCellPosition {
  studentIndex: number;
  assessmentIndex: number;
}

export interface GradeBlurCommitGuard {
  prepareFocusTransfer(current: object, target: object | null): boolean;
  consumeBlurSkip(): boolean;
}

export function createGradeBlurCommitGuard(): GradeBlurCommitGuard {
  let skipNextBlur = false;

  return {
    prepareFocusTransfer(current, target) {
      skipNextBlur = target !== null && target !== current;
      return skipNextBlur;
    },
    consumeBlurSkip() {
      const shouldSkip = skipNextBlur;
      skipNextBlur = false;
      return shouldSkip;
    },
  };
}

export function getNextEditableCell(
  current: EditableCellPosition,
  action: GradeNavigationAction,
  studentCount: number,
  editableAssessmentIndices: number[],
): EditableCellPosition {
  if (studentCount <= 0 || editableAssessmentIndices.length === 0) {
    return current;
  }

  const currentColumnPosition = editableAssessmentIndices.indexOf(
    current.assessmentIndex,
  );
  if (currentColumnPosition < 0) {
    return current;
  }

  if (action === "enter") {
    return {
      studentIndex: Math.min(current.studentIndex + 1, studentCount - 1),
      assessmentIndex: current.assessmentIndex,
    };
  }

  const flatIndex =
    current.studentIndex * editableAssessmentIndices.length +
    currentColumnPosition;
  const lastIndex = studentCount * editableAssessmentIndices.length - 1;
  const nextFlat =
    action === "shiftTab"
      ? Math.max(flatIndex - 1, 0)
      : Math.min(flatIndex + 1, lastIndex);

  return {
    studentIndex: Math.floor(nextFlat / editableAssessmentIndices.length),
    assessmentIndex:
      editableAssessmentIndices[nextFlat % editableAssessmentIndices.length],
  };
}
