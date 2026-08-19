"use client";

import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import { DataState } from "@/src/components/platform/DataState";
import {
  AcademicCoreNotice,
  DashboardHeader,
  QuickAccess,
  StatsGrid,
} from "@/src/components/platform/DashboardUI";
import { PlatformShell } from "@/src/components/platform/PlatformShell";
import { DEMO_PROFILE_IDS } from "@/src/config/academic-demo";
import {
  calculateStudentAcademicState,
  calculateWeightedAverage,
} from "@/src/modules/grades/calculations";
import { formatScore } from "@/src/modules/grades/input";

function StudentDashboardContent() {
  const { data } = useAcademicData();
  const student = data?.students.find(
    (item) => item.id === DEMO_PROFILE_IDS.aluno,
  );
  const schoolClass = data?.classes.find(
    (item) => item.id === student?.classId,
  );
  const assessments =
    data?.assessments.filter(
      (assessment) => assessment.classId === student?.classId,
    ) ?? [];
  const grades =
    data?.grades.filter((grade) => grade.studentId === student?.id) ?? [];
  const result = calculateWeightedAverage(assessments, grades);
  const state = calculateStudentAcademicState(assessments, grades);

  return (
    <>
      <DashboardHeader
        eyebrow="Visão do estudante"
        title={student?.name ?? "Estudante Demo"}
        description="Consulte avaliações e notas persistidas no mesmo Academic Core utilizado pelos demais perfis."
      />
      <StatsGrid
        items={[
          {
            label: "Matrícula",
            value: student?.registration ?? "—",
            detail: "Identificador fictício",
            accent: "blue",
          },
          {
            label: "Turma",
            value: schoolClass?.name ?? "—",
            detail: schoolClass?.gradeLevel ?? "Turma demonstrativa",
            accent: "green",
          },
          {
            label: result.isPartial ? "Média parcial" : "Média",
            value:
              result.average === null
                ? "—"
                : formatScore(result.average, 1),
            detail:
              state === "pending"
                ? "Existem notas pendentes"
                : state === "attention"
                  ? "Situação de atenção"
                  : "Situação regular",
            accent: "amber",
          },
        ]}
      />
      <QuickAccess profile="aluno" />
      <AcademicCoreNotice />
    </>
  );
}

export default function StudentPage() {
  return (
    <PlatformShell profile="aluno">
      <DataState>
        <StudentDashboardContent />
      </DataState>
    </PlatformShell>
  );
}
