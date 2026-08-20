"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import {
  ACADEMIC_PERIODS,
  DEMO_PROFILE_IDS,
} from "@/src/config/academic-demo";
import {
  calculateStudentAcademicState,
  countPendingGrades,
} from "@/src/modules/grades/calculations";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";

export function TeacherClassesPage() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);

  const assignments = useMemo(
    () =>
      (data?.teachingAssignments ?? []).filter(
        (assignment) =>
          assignment.active &&
          assignment.teacherId === DEMO_PROFILE_IDS.professor,
      ),
    [data],
  );

  return (
    <div className="academic-page">
      <header className="academic-page__header">
        <div>
          <span className="academic-kicker">TeachingAssignment</span>
          <h1>Minhas turmas</h1>
          <p>
            Somente as combinações de turma e disciplina atribuídas ao professor
            demonstrativo aparecem aqui.
          </p>
        </div>
      </header>

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
          <small>Indicadores dos cards</small>
          <strong>{period}</strong>
        </div>
      </section>

      <div className="academic-card-grid">
        {assignments.map((assignment) => {
          const schoolClass = data?.classes.find(
            (item) => item.id === assignment.classId,
          );
          const subject = data?.subjects.find(
            (item) => item.id === assignment.subjectId,
          );
          const students =
            data?.students.filter(
              (student) =>
                student.classId === assignment.classId && student.active,
            ) ?? [];
          const assessments = filterAssessmentsByPeriod(
            data?.assessments.filter(
              (assessment) =>
                assessment.classId === assignment.classId &&
                assessment.subjectId === assignment.subjectId,
            ) ?? [],
            period,
          );
          const grades =
            data?.grades.filter((grade) =>
              assessments.some(
                (assessment) => assessment.id === grade.assessmentId,
              ),
            ) ?? [];
          const attention = students.filter((student) => {
            const studentGrades = grades.filter(
              (grade) => grade.studentId === student.id,
            );
            return (
              calculateStudentAcademicState(assessments, studentGrades) ===
              "attention"
            );
          }).length;

          return (
            <article className="academic-context-card" key={assignment.id}>
              <span>{schoolClass?.gradeLevel ?? "Turma"}</span>
              <h2>{schoolClass?.name ?? "Turma"} · {subject?.name ?? "Disciplina"}</h2>
              <dl>
                <div>
                  <dt>Alunos</dt>
                  <dd>{students.length}</dd>
                </div>
                <div>
                  <dt>Avaliações</dt>
                  <dd>{assessments.length}</dd>
                </div>
                <div>
                  <dt>Pendências</dt>
                  <dd>
                    {countPendingGrades(
                      students.map((student) => student.id),
                      assessments,
                      grades,
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Atenção</dt>
                  <dd>{attention}</dd>
                </div>
              </dl>
              <Link
                href={`/plataforma/professor/notas?classId=${encodeURIComponent(assignment.classId)}&subjectId=${encodeURIComponent(assignment.subjectId)}&period=${encodeURIComponent(period)}`}
              >
                Abrir Painel Dinâmico <span aria-hidden="true">→</span>
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
