"use client";

import { useMemo, useState } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import { ACADEMIC_PERIODS } from "@/src/config/academic-demo";
import {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_TYPE_LABELS,
  formatAcademicDate,
} from "@/src/modules/assessments/presentation";
import {
  calculateClassAverage,
  calculateStudentAcademicState,
  countPendingGrades,
} from "@/src/modules/grades/calculations";
import { formatScore } from "@/src/modules/grades/input";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";

export function CoordinationClassesPage() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);
  const [selectedClassId, setSelectedClassId] = useState(
    data?.classes[0]?.id ?? "",
  );

  const effectiveClassId = selectedClassId || data?.classes[0]?.id || "";
  const schoolClass = data?.classes.find((item) => item.id === effectiveClassId);
  const students = useMemo(
    () =>
      data?.students.filter(
        (student) => student.classId === effectiveClassId && student.active,
      ) ?? [],
    [data, effectiveClassId],
  );

  const subjectSummaries = useMemo(() => {
    if (!data || !effectiveClassId) return [];

    const assignments = data.teachingAssignments.filter(
      (assignment) =>
        assignment.classId === effectiveClassId && assignment.active,
    );
    const subjectIds = [...new Set(assignments.map((item) => item.subjectId))];

    return subjectIds.map((subjectId) => {
      const subject = data.subjects.find((item) => item.id === subjectId);
      const assessments = filterAssessmentsByPeriod(
        data.assessments.filter(
          (assessment) =>
            assessment.classId === effectiveClassId &&
            assessment.subjectId === subjectId,
        ),
        period,
      );
      const grades = data.grades.filter((grade) =>
        assessments.some(
          (assessment) => assessment.id === grade.assessmentId,
        ),
      );
      const gradesByStudent = new Map(
        students.map((student) => [
          student.id,
          grades.filter((grade) => grade.studentId === student.id),
        ]),
      );
      const attention = students.filter(
        (student) =>
          calculateStudentAcademicState(
            assessments,
            gradesByStudent.get(student.id) ?? [],
          ) === "attention",
      ).length;

      return {
        subjectId,
        subjectName: subject?.name ?? "Disciplina",
        average: calculateClassAverage(assessments, gradesByStudent),
        pending: countPendingGrades(
          students.map((student) => student.id),
          assessments,
          grades,
        ),
        attention,
        assessmentCount: assessments.length,
      };
    });
  }, [data, effectiveClassId, students, period]);

  return (
    <div className="academic-page">
      <header className="academic-page__header">
        <div>
          <span className="academic-kicker">Coordenação</span>
          <h1>Turmas</h1>
          <p>
            Selecione uma turma para acompanhar disciplinas, médias,
            pendências e situações de atenção calculadas a partir do mesmo
            dataset acadêmico.
          </p>
        </div>
      </header>

      <section className="academic-context-bar coordination-class-selector">
        <label>
          <span>Turma</span>
          <select
            value={effectiveClassId}
            onChange={(event) => setSelectedClassId(event.target.value)}
          >
            {(data?.classes ?? []).map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.gradeLevel}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Período</span>
          <select value={period} onChange={(event) => setPeriod(event.target.value)}>
            {ACADEMIC_PERIODS.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <div className="academic-context-bar__summary">
          <small>Alunos ativos</small>
          <strong>{students.length}</strong>
        </div>
        <div className="academic-context-bar__summary">
          <small>Turma selecionada</small>
          <strong>{schoolClass?.name ?? "—"}</strong>
        </div>
      </section>

      {subjectSummaries.length === 0 ? (
        <div className="academic-empty academic-empty--large">
          <strong>Nenhuma disciplina vinculada</strong>
          <p>Não existem TeachingAssignments ativos para esta turma.</p>
        </div>
      ) : (
        <div className="coordination-subject-grid">
          {subjectSummaries.map((summary) => (
            <article className="academic-card coordination-subject-card" key={summary.subjectId}>
              <span>Disciplina</span>
              <h2>{summary.subjectName}</h2>
              <dl>
                <div>
                  <dt>Média</dt>
                  <dd>
                    {summary.average === null
                      ? "—"
                      : formatScore(summary.average, 1)}
                  </dd>
                </div>
                <div>
                  <dt>Avaliações</dt>
                  <dd>{summary.assessmentCount}</dd>
                </div>
                <div>
                  <dt>Pendências</dt>
                  <dd>{summary.pending}</dd>
                </div>
                <div>
                  <dt>Em atenção</dt>
                  <dd>{summary.attention}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

export function CoordinationAssessmentsPage() {
  const { data } = useAcademicData();
  const [period, setPeriod] = useState<string>(ACADEMIC_PERIODS[0]);
  const assessments = filterAssessmentsByPeriod(
    [...(data?.assessments ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date),
    ),
    period,
  );

  return (
    <div className="academic-page">
      <header className="academic-page__header">
        <div>
          <span className="academic-kicker">Coordenação · somente leitura</span>
          <h1>Avaliações</h1>
          <p>
            Consulte o ciclo de avaliações cadastrado pelos professores. A P2
            não permite criação pela coordenação.
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
          <small>Consulta da coordenação</small>
          <strong>{period}</strong>
        </div>
      </section>

      {assessments.length === 0 ? (
        <div className="academic-empty academic-empty--large">
          <strong>Nenhuma avaliação cadastrada</strong>
          <p>A base local ainda não possui avaliações.</p>
        </div>
      ) : (
        <div className="assessment-list academic-card">
          {assessments.map((assessment) => {
            const schoolClass = data?.classes.find(
              (item) => item.id === assessment.classId,
            );
            const subject = data?.subjects.find(
              (item) => item.id === assessment.subjectId,
            );
            return (
              <article className="assessment-row" key={assessment.id}>
                <div className="assessment-row__main">
                  <div>
                    <span className={`status-pill status-pill--${assessment.status}`}>
                      {ASSESSMENT_STATUS_LABELS[assessment.status]}
                    </span>
                    <span className="assessment-type">
                      {ASSESSMENT_TYPE_LABELS[assessment.type]}
                    </span>
                  </div>
                  <h3>{assessment.name}</h3>
                  <p>
                    {schoolClass?.name} · {subject?.name} · {assessment.period}
                  </p>
                </div>
                <div className="assessment-row__meta">
                  <span>{formatAcademicDate(assessment.date)}</span>
                  <span>
                    {formatScore(assessment.maxScore)} pts · peso{" "}
                    {formatScore(assessment.weight)}
                  </span>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
