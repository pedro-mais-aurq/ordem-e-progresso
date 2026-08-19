"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import { DEMO_PROFILE_IDS } from "@/src/config/academic-demo";
import {
  calculateStudentAcademicState,
  countPendingGrades,
} from "@/src/modules/grades/calculations";

export function TeacherClassesPage() {
  const { data } = useAcademicData();

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
          const assessments =
            data?.assessments.filter(
              (assessment) =>
                assessment.classId === assignment.classId &&
                assessment.subjectId === assignment.subjectId,
            ) ?? [];
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
              <Link href="/plataforma/professor/notas">
                Abrir Painel Dinâmico <span aria-hidden="true">→</span>
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
