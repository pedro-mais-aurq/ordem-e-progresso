"use client";

import { useMemo, useState } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import { DataState } from "@/src/components/platform/DataState";
import {
  AcademicCoreNotice,
  DashboardHeader,
  QuickAccess,
  StatsGrid,
} from "@/src/components/platform/DashboardUI";
import { PlatformShell } from "@/src/components/platform/PlatformShell";
import { ACADEMIC_PERIODS } from "@/src/config/academic-demo";
import {
  calculateClassAverage,
  calculateStudentAcademicState,
  countPendingGrades,
} from "@/src/modules/grades/calculations";
import { formatScore } from "@/src/modules/grades/input";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";

function CoordinationDashboardContent() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);

  const summaries = useMemo(() => {
    if (!data) return [];

    return data.subjects.map((subject) => {
      const assessments = filterAssessmentsByPeriod(
        data.assessments.filter(
          (assessment) => assessment.subjectId === subject.id,
        ),
        period,
      );
      const classIds = [
        ...new Set(assessments.map((assessment) => assessment.classId)),
      ];
      const students = data.students.filter(
        (student) => student.active && classIds.includes(student.classId),
      );
      const grades = data.grades.filter((grade) =>
        assessments.some(
          (assessment) => assessment.id === grade.assessmentId,
        ),
      );

      const studentAverages = students
        .map((student) => {
          const studentAssessments = assessments.filter(
            (assessment) => assessment.classId === student.classId,
          );
          const studentGrades = grades.filter(
            (grade) => grade.studentId === student.id,
          );
          const average = calculateClassAverage(
            studentAssessments,
            new Map([[student.id, studentGrades]]),
          );
          return average;
        })
        .filter((average): average is number => average !== null);

      return {
        id: subject.id,
        name: subject.name,
        average:
          studentAverages.length === 0
            ? null
            : studentAverages.reduce((sum, value) => sum + value, 0) /
              studentAverages.length,
      };
    });
  }, [data, period]);

  const pending = useMemo(() => {
    if (!data) return 0;
    return data.classes.reduce((total, schoolClass) => {
      const students = data.students.filter(
        (student) => student.classId === schoolClass.id && student.active,
      );
      const assessments = filterAssessmentsByPeriod(
        data.assessments.filter(
          (assessment) => assessment.classId === schoolClass.id,
        ),
        period,
      );
      const grades = data.grades.filter((grade) =>
        assessments.some(
          (assessment) => assessment.id === grade.assessmentId,
        ),
      );
      return (
        total +
        countPendingGrades(
          students.map((student) => student.id),
          assessments,
          grades,
        )
      );
    }, 0);
  }, [data, period]);

  const attention = useMemo(() => {
    if (!data) return 0;
    return data.students.filter((student) => {
      const classAssessments = filterAssessmentsByPeriod(
        data.assessments.filter(
          (assessment) => assessment.classId === student.classId,
        ),
        period,
      );
      const subjectIds = [
        ...new Set(classAssessments.map((assessment) => assessment.subjectId)),
      ];

      return subjectIds.some((subjectId) => {
        const assessments = classAssessments.filter(
          (assessment) => assessment.subjectId === subjectId,
        );
        const grades = data.grades.filter(
          (grade) =>
            grade.studentId === student.id &&
            assessments.some(
              (assessment) => assessment.id === grade.assessmentId,
            ),
        );
        return calculateStudentAcademicState(assessments, grades) === "attention";
      });
    }).length;
  }, [data, period]);

  return (
    <>
      <DashboardHeader
        eyebrow="Visão da coordenação"
        title="Panorama acadêmico"
        description="Indicadores derivados das mesmas avaliações e notas persistidas pelo fluxo do professor."
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
          <small>Indicadores da coordenação</small>
          <strong>{period}</strong>
        </div>
      </section>
      <StatsGrid
        items={[
          {
            label: "Turmas",
            value: data?.classes.length ?? 0,
            detail: "No ano letivo de 2026",
            accent: "blue",
          },
          {
            label: "Avaliações",
            value: filterAssessmentsByPeriod(
              data?.assessments ?? [],
              period,
            ).length,
            detail: `Cadastradas em ${period}`,
            accent: "green",
          },
          {
            label: "Notas pendentes",
            value: pending,
            detail: "Lançamentos ausentes",
            accent: "amber",
          },
          {
            label: "Alunos em atenção",
            value: attention,
            detail: "Com média completa abaixo da demo",
            accent: "amber",
          },
        ]}
      />
      <section className="dashboard-section" aria-labelledby="subject-summary-title">
        <div className="dashboard-section__heading">
          <div>
            <span>Resumo acadêmico</span>
            <h2 id="subject-summary-title">Médias por disciplina</h2>
          </div>
          <small>Valores calculados</small>
        </div>
        <div className="coordination-dashboard-subjects">
          {summaries.map((summary) => (
            <article key={summary.id}>
              <strong>{summary.name}</strong>
              <span>
                média{" "}
                {summary.average === null
                  ? "—"
                  : formatScore(summary.average, 1)}
              </span>
            </article>
          ))}
        </div>
      </section>
      <QuickAccess profile="coordenacao" />
      <AcademicCoreNotice />
    </>
  );
}

export default function CoordinationPage() {
  return (
    <PlatformShell profile="coordenacao">
      <DataState>
        <CoordinationDashboardContent />
      </DataState>
    </PlatformShell>
  );
}
