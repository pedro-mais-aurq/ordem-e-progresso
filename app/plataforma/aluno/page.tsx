"use client";

import { useState } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import { DataState } from "@/src/components/platform/DataState";
import {
  AcademicCoreNotice,
  DashboardHeader,
  QuickAccess,
  StatsGrid,
} from "@/src/components/platform/DashboardUI";
import { PlatformShell } from "@/src/components/platform/PlatformShell";
import {
  ACADEMIC_PERIODS,
  DEMO_PROFILE_IDS,
} from "@/src/config/academic-demo";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";

function StudentDashboardContent() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);
  const student = data?.students.find(
    (item) => item.id === DEMO_PROFILE_IDS.aluno,
  );
  const schoolClass = data?.classes.find(
    (item) => item.id === student?.classId,
  );
  const assessments = filterAssessmentsByPeriod(
    data?.assessments.filter(
      (assessment) => assessment.classId === student?.classId,
    ) ?? [],
    period,
  );
  const grades =
    data?.grades.filter((grade) => grade.studentId === student?.id) ?? [];
  const subjectCount = new Set(
    assessments.map((assessment) => assessment.subjectId),
  ).size;
  const completedAssessments = assessments.filter((assessment) =>
    grades.some(
      (grade) =>
        grade.assessmentId === assessment.id &&
        grade.status === "recorded" &&
        grade.score !== null,
    ),
  ).length;

  return (
    <>
      <DashboardHeader
        eyebrow="Visão do estudante"
        title={student?.name ?? "Estudante Demo"}
        description="Consulte avaliações e notas persistidas no mesmo Academic Core utilizado pelos demais perfis."
      />
      <section className="academic-context-bar" aria-label="Período acadêmico">
        <label>
          <span>Período</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {ACADEMIC_PERIODS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="academic-context-bar__summary">
          <small>Indicadores do estudante</small>
          <strong>{period}</strong>
        </div>
      </section>
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
            label: "Avaliações concluídas",
            value: `${completedAssessments}/${assessments.length}`,
            detail: `${subjectCount} disciplina${subjectCount === 1 ? "" : "s"} acompanhada${subjectCount === 1 ? "" : "s"} em ${period}`,
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
