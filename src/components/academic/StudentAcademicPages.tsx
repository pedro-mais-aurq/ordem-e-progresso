"use client";

import { useMemo, useState } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import {
  ACADEMIC_PERIODS,
  DEMO_PROFILE_IDS,
} from "@/src/config/academic-demo";
import {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_TYPE_LABELS,
  formatAcademicDate,
} from "@/src/modules/assessments/presentation";
import {
  calculateStudentAcademicState,
  calculateWeightedAverage,
} from "@/src/modules/grades/calculations";
import { formatScore } from "@/src/modules/grades/input";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";

export function StudentGradesPage() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);
  const student = data?.students.find(
    (item) => item.id === DEMO_PROFILE_IDS.aluno,
  );
  const allAssessments = useMemo(
    () =>
      (data?.assessments ?? [])
        .filter((assessment) => assessment.classId === student?.classId)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data, student?.classId],
  );
  const assessments = useMemo(
    () => filterAssessmentsByPeriod(allAssessments, period),
    [allAssessments, period],
  );
  const grades = useMemo(
    () =>
      (data?.grades ?? []).filter(
        (grade) => grade.studentId === student?.id,
      ),
    [data, student?.id],
  );

  const subjects = (data?.subjects ?? []).filter((subject) =>
    assessments.some((assessment) => assessment.subjectId === subject.id),
  );

  return (
    <div className="academic-page">
      <header className="academic-page__header">
        <div>
          <span className="academic-kicker">Portal do aluno</span>
          <h1>Minhas notas</h1>
          <p>
            Dados da mesma base local utilizada pelo professor e pela
            coordenação. Esta visão é somente leitura.
          </p>
        </div>
      </header>

      <PeriodSelector period={period} onChange={setPeriod} />

      {subjects.length === 0 ? (
        <div className="academic-empty academic-empty--large">
          <strong>Nenhuma nota disponível</strong>
          <p>Não existem avaliações cadastradas para a turma deste aluno.</p>
        </div>
      ) : (
        <div className="student-subject-list">
          {subjects.map((subject) => {
            const subjectAssessments = assessments.filter(
              (assessment) => assessment.subjectId === subject.id,
            );
            const subjectGrades = grades.filter((grade) =>
              subjectAssessments.some(
                (assessment) => assessment.id === grade.assessmentId,
              ),
            );
            const result = calculateWeightedAverage(
              subjectAssessments,
              subjectGrades,
            );
            const state = calculateStudentAcademicState(
              subjectAssessments,
              subjectGrades,
            );

            return (
              <section className="academic-card student-subject-card" key={subject.id}>
                <div className="student-subject-card__heading">
                  <div>
                    <span>Disciplina</span>
                    <h2>{subject.name}</h2>
                  </div>
                  <span className={`academic-state academic-state--${state}`}>
                    {state === "pending"
                      ? "Pendente"
                      : state === "attention"
                        ? "Atenção"
                        : "Regular"}
                  </span>
                </div>

                <div className="student-grade-items">
                  {subjectAssessments.map((assessment) => {
                    const grade = subjectGrades.find(
                      (item) => item.assessmentId === assessment.id,
                    );
                    return (
                      <article key={assessment.id}>
                        <div>
                          <strong>{assessment.name}</strong>
                          <small>
                            {formatAcademicDate(assessment.date)} ·{" "}
                            {ASSESSMENT_TYPE_LABELS[assessment.type]}
                          </small>
                        </div>
                        <strong>
                          {grade?.score === null || !grade
                            ? "Pendente"
                            : `${formatScore(grade.score)} / ${formatScore(assessment.maxScore)}`}
                        </strong>
                      </article>
                    );
                  })}
                </div>

                <footer className="student-subject-card__summary">
                  <div>
                    <span>{result.isPartial ? "Média parcial" : "Média"}</span>
                    <strong>
                      {result.average === null
                        ? "—"
                        : formatScore(result.average, 1)}
                    </strong>
                  </div>
                  {result.pendingCount > 0 ? (
                    <small>
                      {result.pendingCount} lançamento
                      {result.pendingCount === 1 ? "" : "s"} pendente
                      {result.pendingCount === 1 ? "" : "s"}
                    </small>
                  ) : (
                    <small>Lançamento completo</small>
                  )}
                </footer>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function StudentAssessmentsPage() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);
  const student = data?.students.find(
    (item) => item.id === DEMO_PROFILE_IDS.aluno,
  );
  const assessments = filterAssessmentsByPeriod(
    (data?.assessments ?? [])
      .filter((assessment) => assessment.classId === student?.classId)
      .sort((a, b) => a.date.localeCompare(b.date)),
    period,
  );
  const grades = (data?.grades ?? []).filter(
    (grade) => grade.studentId === student?.id,
  );

  return (
    <div className="academic-page">
      <header className="academic-page__header">
        <div>
          <span className="academic-kicker">Portal do aluno</span>
          <h1>Avaliações</h1>
          <p>
            Consulte datas, tipos, valores máximos, status e a nota já
            registrada, sem qualquer permissão de edição.
          </p>
        </div>
      </header>

      <PeriodSelector period={period} onChange={setPeriod} />

      {assessments.length === 0 ? (
        <div className="academic-empty academic-empty--large">
          <strong>Nenhuma avaliação disponível</strong>
          <p>A turma ainda não possui avaliações cadastradas.</p>
        </div>
      ) : (
        <div className="student-assessment-grid">
          {assessments.map((assessment) => {
            const subject = data?.subjects.find(
              (item) => item.id === assessment.subjectId,
            );
            const grade = grades.find(
              (item) => item.assessmentId === assessment.id,
            );

            return (
              <article className="academic-card student-assessment-card" key={assessment.id}>
                <div>
                  <span className={`status-pill status-pill--${assessment.status}`}>
                    {ASSESSMENT_STATUS_LABELS[assessment.status]}
                  </span>
                  <span>{ASSESSMENT_TYPE_LABELS[assessment.type]}</span>
                </div>
                <h2>{assessment.name}</h2>
                <p>{subject?.name ?? "Disciplina"} · {assessment.period}</p>
                <dl>
                  <div>
                    <dt>Data</dt>
                    <dd>{formatAcademicDate(assessment.date)}</dd>
                  </div>
                  <div>
                    <dt>Valor</dt>
                    <dd>{formatScore(assessment.maxScore)}</dd>
                  </div>
                  <div>
                    <dt>Nota</dt>
                    <dd>
                      {grade?.score === null || !grade
                        ? "Pendente"
                        : formatScore(grade.score)}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PeriodSelector({
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
        <small>Consulta do aluno</small>
        <strong>{period}</strong>
      </div>
    </section>
  );
}
