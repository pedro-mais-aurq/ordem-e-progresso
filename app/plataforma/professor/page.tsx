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
import { countPendingGrades } from "@/src/modules/grades/calculations";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";

function ProfessorDashboardContent() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);
  const teacher =
    data?.teachers.find((item) => item.id === DEMO_PROFILE_IDS.professor) ??
    data?.teachers[0];
  const assignments =
    data?.teachingAssignments.filter(
      (assignment) =>
        assignment.teacherId === teacher?.id && assignment.active,
    ) ?? [];
  const classIds = new Set(assignments.map((assignment) => assignment.classId));
  const pairKeys = new Set(
    assignments.map(
      (assignment) => `${assignment.classId}::${assignment.subjectId}`,
    ),
  );
  const assessments = filterAssessmentsByPeriod(
    data?.assessments.filter((assessment) =>
      pairKeys.has(`${assessment.classId}::${assessment.subjectId}`),
    ) ?? [],
    period,
  );
  const students =
    data?.students.filter(
      (student) => student.active && classIds.has(student.classId),
    ) ?? [];
  const grades =
    data?.grades.filter((grade) =>
      assessments.some((assessment) => assessment.id === grade.assessmentId),
    ) ?? [];

  const pending = [...classIds].reduce((sum, classId) => {
    const classStudents = students.filter(
      (student) => student.classId === classId,
    );
    const classAssessments = assessments.filter(
      (assessment) => assessment.classId === classId,
    );
    const classGrades = grades.filter((grade) =>
      classAssessments.some(
        (assessment) => assessment.id === grade.assessmentId,
      ),
    );
    return (
      sum +
      countPendingGrades(
        classStudents.map((student) => student.id),
        classAssessments,
        classGrades,
      )
    );
  }, 0);

  return (
    <>
      <DashboardHeader
        eyebrow="Visão do professor"
        title={`Olá, ${teacher?.name ?? "Professor Demo"}`}
        description="Acesse suas TeachingAssignments, avaliações e o Painel Dinâmico para lançar notas com baixo atrito."
      />
      <DashboardPeriodSelector period={period} onChange={setPeriod} />
      <StatsGrid
        items={[
          {
            label: "Turmas",
            value: classIds.size,
            detail: "Vinculadas ao perfil",
            accent: "blue",
          },
          {
            label: "Avaliações",
            value: assessments.length,
            detail: "Nos vínculos do professor",
            accent: "green",
          },
          {
            label: "Pendências",
            value: pending,
            detail: "Lançamentos ainda ausentes",
            accent: "amber",
          },
        ]}
      />
      <QuickAccess profile="professor" />
      <AcademicCoreNotice />
    </>
  );
}

function DashboardPeriodSelector({
  period,
  onChange,
}: {
  period: string;
  onChange: (period: string) => void;
}) {
  return (
    <section className="academic-context-bar" aria-label="Período acadêmico">
      <label>
        <span>Período</span>
        <select value={period} onChange={(event) => onChange(event.target.value)}>
          {ACADEMIC_PERIODS.map((item) => (
            <option key={item} value={item}>{item}</option>
          ))}
        </select>
      </label>
      <div className="academic-context-bar__summary">
        <small>Indicadores do professor</small>
        <strong>{period}</strong>
      </div>
    </section>
  );
}

export default function ProfessorPage() {
  return (
    <PlatformShell profile="professor">
      <DataState>
        <ProfessorDashboardContent />
      </DataState>
    </PlatformShell>
  );
}
