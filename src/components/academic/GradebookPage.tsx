"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import { GradeCsvImport } from "@/src/components/academic/GradeCsvImport";
import {
  ACADEMIC_DEMO_CONFIG,
  ACADEMIC_PERIODS,
  DEMO_PROFILE_IDS,
} from "@/src/config/academic-demo";
import { getAcademicServices } from "@/src/config/services";
import {
  ASSESSMENT_STATUS_LABELS,
  formatAcademicDate,
} from "@/src/modules/assessments/presentation";
import {
  calculateClassAverage,
  calculateGradebookCompletion,
  calculateStudentAcademicState,
  calculateWeightedAverage,
  countPendingGrades,
  type AcademicState,
} from "@/src/modules/grades/calculations";
import {
  loadAuditHistory,
  selectContextualStudentGrades,
  shouldCloseStudentDetail,
  type AuditHistoryState,
} from "@/src/modules/grades/audit-history";
import {
  createLatestContextRequestSequence,
  resolveAuthorizedContextKey,
} from "@/src/modules/grades/context";
import {
  filterGradebookRows,
  type GradebookFilter,
  type GradebookStudentRow,
} from "@/src/modules/grades/filters";
import { formatScore, validateScoreInput } from "@/src/modules/grades/input";
import { persistManualGradeIncrementally } from "@/src/modules/grades/persistence";
import { filterAssessmentsByPeriod } from "@/src/modules/grades/period";
import {
  createGradeBlurCommitGuard,
  getNextEditableCell,
  type GradeNavigationAction,
} from "@/src/modules/grades/keyboard";
import type {
  Assessment,
  Grade,
  Student,
} from "@/src/types/academic";

interface GradebookPageProps {
  readOnly?: boolean;
  initialContext?: { classId: string; subjectId: string; period?: string };
}

type CellSaveState = "idle" | "editing" | "saving" | "saved" | "error";

function gradeKey(studentId: string, assessmentId: string): string {
  return `${studentId}::${assessmentId}`;
}

function academicStateLabel(state: AcademicState): string {
  if (state === "pending") return "Pendente";
  if (state === "attention") return "Atenção";
  return "Regular";
}

export function GradebookPage({
  readOnly = false,
  initialContext,
}: GradebookPageProps) {
  const { data, updateGradeSnapshot, updateGradesSnapshot } = useAcademicData();
  const requestedInitialKey = initialContext
    ? `${initialContext.classId}::${initialContext.subjectId}`
    : "";
  const [contextKey, setContextKey] = useState(requestedInitialKey);
  const [loadedContextKey, setLoadedContextKey] = useState("");
  const [period, setPeriod] = useState<string>(
    initialContext?.period?.trim() || ACADEMIC_PERIODS[0],
  );
  const [allAssessments, setAllAssessments] = useState<Assessment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loadingContext, setLoadingContext] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [filter, setFilter] = useState<GradebookFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [mobileAssessmentId, setMobileAssessmentId] = useState("");
  const [csvApplying, setCsvApplying] = useState(false);
  const [manualSaveCount, setManualSaveCount] = useState(0);
  const inputRefs = useRef(new Map<string, HTMLInputElement>());
  const mutationChains = useRef(new Map<string, Promise<unknown>>());
  const contextRequests = useRef(createLatestContextRequestSequence());
  const studentDetailTrigger = useRef<HTMLElement | null>(null);
  const csvApplyingRef = useRef(false);

  const handleCsvApplyingChange = useCallback((applying: boolean) => {
    csvApplyingRef.current = applying;
    setCsvApplying(applying);
  }, []);

  const openStudentDetail = useCallback((studentId: string) => {
    studentDetailTrigger.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedStudentId(studentId);
  }, []);

  const closeStudentDetail = useCallback(() => {
    setSelectedStudentId(null);
    queueMicrotask(() => studentDetailTrigger.current?.focus());
  }, []);

  const contextOptions = useMemo(() => {
    const assignments = (data?.teachingAssignments ?? []).filter(
      (assignment) =>
        assignment.active &&
        (readOnly || assignment.teacherId === DEMO_PROFILE_IDS.professor),
    );
    const seen = new Set<string>();

    return assignments
      .filter((assignment) => {
        const key = `${assignment.classId}::${assignment.subjectId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((assignment) => {
        const schoolClass = data?.classes.find(
          (item) => item.id === assignment.classId,
        );
        const subject = data?.subjects.find(
          (item) => item.id === assignment.subjectId,
        );
        return {
          key: `${assignment.classId}::${assignment.subjectId}`,
          classId: assignment.classId,
          subjectId: assignment.subjectId,
          label: `${schoolClass?.name ?? "Turma"} · ${subject?.name ?? "Disciplina"}`,
          className: schoolClass?.name ?? "Turma",
          subjectName: subject?.name ?? "Disciplina",
        };
      });
  }, [data, readOnly]);

  const effectiveContextKey = resolveAuthorizedContextKey(
    contextOptions,
    contextKey,
  );

  const currentContext =
    contextOptions.find((option) => option.key === loadedContextKey) ??
    contextOptions[0];

  function beginContextTransition(nextContextKey: string) {
    setContextKey(nextContextKey);
    setSelectedStudentId(null);
    setLoadingContext(true);
    setContextError(null);
    setLoadedContextKey("");
    setStudents([]);
    setAllAssessments([]);
    setGrades([]);
  }

  useEffect(() => {
    if (!effectiveContextKey) {
      return;
    }

    const [classId, subjectId] = effectiveContextKey.split("::");
    const services = getAcademicServices();
    const requestId = contextRequests.current.issue();
    let active = true;

    void Promise.all([
      services.students.getByClass(classId),
      services.assessments.getByClassAndSubject(classId, subjectId),
    ])
      .then(async ([nextStudents, nextAssessments]) => {
        const nextGrades = await services.grades.getByAssessments(
          nextAssessments.map((assessment) => assessment.id),
        );
        if (!active || !contextRequests.current.isLatest(requestId)) return;

        setStudents(nextStudents);
        setAllAssessments(nextAssessments);
        setGrades(nextGrades);
        setLoadedContextKey(effectiveContextKey);

      })
      .catch((cause: unknown) => {
        if (!active || !contextRequests.current.isLatest(requestId)) return;
        setContextError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível carregar o painel de notas.",
        );
      })
      .finally(() => {
        if (active && contextRequests.current.isLatest(requestId)) {
          setLoadingContext(false);
        }
      });

    return () => {
      active = false;
    };
  }, [effectiveContextKey]);

  const periods = useMemo(
    () => [
      ...new Set([
        ...ACADEMIC_PERIODS,
        ...allAssessments.map((assessment) => assessment.period),
      ]),
    ],
    [allAssessments],
  );

  const assessments = useMemo(
    () =>
      filterAssessmentsByPeriod(allAssessments, period)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [allAssessments, period],
  );

  const effectiveMobileAssessmentId = assessments.some(
    (assessment) => assessment.id === mobileAssessmentId,
  )
    ? mobileAssessmentId
    : assessments[0]?.id ?? "";

  const gradeMap = useMemo(
    () =>
      new Map(
        grades.map((grade) => [
          gradeKey(grade.studentId, grade.assessmentId),
          grade,
        ]),
      ),
    [grades],
  );

  const rows = useMemo<GradebookStudentRow[]>(
    () =>
      students.map((student) => ({
        student,
        grades: assessments
          .map((assessment) =>
            gradeMap.get(gradeKey(student.id, assessment.id)),
          )
          .filter((grade): grade is Grade => Boolean(grade)),
      })),
    [students, assessments, gradeMap],
  );

  const filteredRows = useMemo(
    () =>
      filterGradebookRows(
        rows,
        assessments,
        filter,
        search,
        ACADEMIC_DEMO_CONFIG.passingAverage,
      ),
    [rows, assessments, filter, search],
  );

  const gradesByStudent = useMemo(
    () =>
      new Map(
        rows.map((row) => [row.student.id, row.grades]),
      ),
    [rows],
  );

  const classAverage = calculateClassAverage(assessments, gradesByStudent);
  const pendingGrades = countPendingGrades(
    students.map((student) => student.id),
    assessments,
    grades,
  );
  const attentionStudents = rows.filter(
    (row) =>
      calculateStudentAcademicState(
        assessments,
        row.grades,
        ACADEMIC_DEMO_CONFIG.passingAverage,
      ) === "attention",
  ).length;
  const completion = calculateGradebookCompletion(
    students.map((student) => student.id),
    assessments,
    grades,
  );

  const editableAssessmentIndices = assessments
    .map((assessment, index) =>
      assessment.status === "closed" || readOnly ? -1 : index,
    )
    .filter((index) => index >= 0);

  async function saveGrade(
    student: Student,
    assessment: Assessment,
    score: number,
  ): Promise<Grade> {
    if (csvApplyingRef.current) {
      throw new Error("Aguarde a conclusão da importação CSV antes de editar notas.");
    }

    const key = gradeKey(student.id, assessment.id);
    const services = getAcademicServices();
    const previous = mutationChains.current.get(key) ?? Promise.resolve();
    setManualSaveCount((currentCount) => currentCount + 1);

    const current = previous
      .catch(() => undefined)
      .then(() =>
        persistManualGradeIncrementally(
          services.grades,
          {
            studentId: student.id,
            assessmentId: assessment.id,
            score,
            actorId: DEMO_PROFILE_IDS.professor,
          },
          (persistedGrade) => {
            setGrades((currentGrades) => {
              const withoutCurrent = currentGrades.filter(
                (grade) =>
                  !(
                    grade.studentId === persistedGrade.studentId &&
                    grade.assessmentId === persistedGrade.assessmentId
                  ),
              );
              return [...withoutCurrent, persistedGrade];
            });
            updateGradeSnapshot(persistedGrade);
          },
        ),
      );

    mutationChains.current.set(key, current);

    try {
      return await current;
    } finally {
      setManualSaveCount((currentCount) => Math.max(0, currentCount - 1));
      if (mutationChains.current.get(key) === current) {
        mutationChains.current.delete(key);
      }
    }
  }

  function navigateDesktop(
    currentStudentIndex: number,
    currentAssessmentIndex: number,
    action: GradeNavigationAction,
  ): HTMLInputElement | null {
    const next = getNextEditableCell(
      {
        studentIndex: currentStudentIndex,
        assessmentIndex: currentAssessmentIndex,
      },
      action,
      filteredRows.length,
      editableAssessmentIndices,
    );
    const nextStudent = filteredRows[next.studentIndex]?.student;
    const nextAssessment = assessments[next.assessmentIndex];
    if (!nextStudent || !nextAssessment) return null;

    return (
      inputRefs.current.get(
        `desktop:${gradeKey(nextStudent.id, nextAssessment.id)}`,
      ) ?? null
    );
  }

  function navigateMobile(
    currentStudentIndex: number,
    assessmentIndex: number,
  ): HTMLInputElement | null {
    const next = getNextEditableCell(
      { studentIndex: currentStudentIndex, assessmentIndex },
      "enter",
      filteredRows.length,
      [assessmentIndex],
    );
    const nextStudent = filteredRows[next.studentIndex]?.student;
    const nextAssessment = assessments[assessmentIndex];
    if (!nextStudent || !nextAssessment) return null;

    return (
      inputRefs.current.get(
        `mobile:${gradeKey(nextStudent.id, nextAssessment.id)}`,
      ) ?? null
    );
  }

  const selectedStudent = students.find(
    (student) => student.id === selectedStudentId,
  );

  if (
    effectiveContextKey &&
    (loadingContext || loadedContextKey !== effectiveContextKey)
  ) {
    return (
      <div className="academic-page">
        <div className="state-panel state-panel--loading" role="status">
          <span className="state-spinner" aria-hidden="true" />
          <div>
            <strong>Montando o Painel Dinâmico</strong>
            <p>Carregando alunos, avaliações e notas por índices…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="academic-page gradebook-page">
      <header className="academic-page__header gradebook-heading">
        <div>
          <span className="academic-kicker">
            {readOnly ? "Consulta acadêmica" : "Lançamento rápido"}
          </span>
          <h1>Painel Dinâmico de Notas</h1>
          <p>
            {readOnly
              ? "Mesmos dados acadêmicos em modo somente leitura para a coordenação."
              : "Edite diretamente na grade. Enter avança na avaliação; Tab percorre somente células editáveis."}
          </p>
        </div>
        {!readOnly ? (
          <div className="gradebook-keyboard-hint" aria-label="Atalhos de teclado">
            <span><kbd>Enter</kbd> próximo aluno</span>
            <span><kbd>Tab</kbd> próxima nota</span>
          </div>
        ) : null}
      </header>

      <section className="academic-context-bar" aria-label="Contexto acadêmico">
        <label>
          <span>Turma · disciplina</span>
          <select
            value={effectiveContextKey}
            disabled={csvApplying}
            onChange={(event) => {
              beginContextTransition(event.target.value);
            }}
          >
            {contextOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Período</span>
          <select
            value={period}
            disabled={csvApplying}
            onChange={(event) => setPeriod(event.target.value)}
          >
            {(periods.length > 0 ? periods : ACADEMIC_PERIODS).map(
              (availablePeriod) => (
                <option key={availablePeriod} value={availablePeriod}>
                  {availablePeriod}
                </option>
              ),
            )}
          </select>
        </label>
        <div className="academic-context-bar__summary">
          <small>Contexto atual</small>
          <strong>
            {currentContext?.className ?? "—"} ·{" "}
            {currentContext?.subjectName ?? "—"} · {period}
          </strong>
        </div>
      </section>

      {contextError ? (
        <div className="academic-alert academic-alert--error" role="alert">
          {contextError}
        </div>
      ) : null}

      {!readOnly && assessments.length > 0 ? (
        <GradeCsvImport
          key={`${loadedContextKey}:${period}`}
          assessments={assessments}
          students={students}
          teacherId={DEMO_PROFILE_IDS.professor}
          disabled={manualSaveCount > 0}
          onApplyingChange={handleCsvApplyingChange}
          onImported={(persistedGrades) => {
            setGrades((currentGrades) => {
              const importedKeys = new Set(
                persistedGrades.map((grade) => gradeKey(grade.studentId, grade.assessmentId)),
              );
              return [
                ...currentGrades.filter(
                  (grade) => !importedKeys.has(gradeKey(grade.studentId, grade.assessmentId)),
                ),
                ...persistedGrades,
              ];
            });
            updateGradesSnapshot(persistedGrades);
          }}
        />
      ) : null}

      <section className="gradebook-metrics" aria-label="Indicadores da turma">
        <MetricCard
          label="Média da turma"
          value={classAverage === null ? "—" : formatScore(classAverage, 1)}
          detail="Com as notas lançadas"
        />
        <MetricCard
          label="Alunos em atenção"
          value={attentionStudents}
          detail={`Média completa abaixo de ${formatScore(ACADEMIC_DEMO_CONFIG.passingAverage)}`}
          tone="attention"
        />
        <MetricCard
          label="Notas pendentes"
          value={pendingGrades}
          detail="Células ainda sem lançamento"
          tone={pendingGrades > 0 ? "pending" : undefined}
        />
        <MetricCard
          label="Avaliações"
          value={assessments.length}
          detail={
            !completion.applicable
              ? "Completude não aplicável"
              : `${completion.completedStudents}/${completion.totalStudents} alunos completos`
          }
        />
      </section>

      <section className="gradebook-toolbar" aria-label="Filtros do painel">
        <div className="gradebook-filter-tabs" role="group" aria-label="Situação">
          {([
            ["all", "Todos"],
            ["below", "Abaixo da média"],
            ["pending", "Com pendências"],
            ["above", "Acima da média"],
          ] as Array<[GradebookFilter, string]>).map(([value, label]) => (
            <button
              type="button"
              className={filter === value ? "is-active" : ""}
              key={value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="gradebook-search">
          <span className="sr-only">Buscar por nome ou matrícula</span>
          <input
            type="search"
            placeholder="Buscar nome ou matrícula"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </section>

      {assessments.length === 0 ? (
        <div className="academic-empty academic-empty--large">
          <strong>Nenhuma avaliação neste contexto</strong>
          <p>
            {readOnly
              ? "Não há avaliações cadastradas para esta turma, disciplina e período."
              : "Crie uma avaliação no módulo Avaliações antes de lançar notas."}
          </p>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="academic-empty academic-empty--large">
          <strong>Nenhum aluno corresponde ao filtro</strong>
          <p>Altere a busca ou selecione outro filtro acadêmico.</p>
        </div>
      ) : (
        <>
          <section className="gradebook-desktop" aria-label="Grade de notas">
            <div className="gradebook-table-wrap">
              <table className="gradebook-table">
                <thead>
                  <tr>
                    <th scope="col">Aluno</th>
                    {assessments.map((assessment) => (
                      <th scope="col" key={assessment.id}>
                        <span>{assessment.name}</span>
                        <small>
                          / {formatScore(assessment.maxScore)} · peso{" "}
                          {formatScore(assessment.weight)}
                        </small>
                        {assessment.status === "closed" ? (
                          <em>Fechada</em>
                        ) : null}
                      </th>
                    ))}
                    <th scope="col">Média</th>
                    <th scope="col">Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, studentIndex) => {
                    const result = calculateWeightedAverage(
                      assessments,
                      row.grades,
                    );
                    const state = calculateStudentAcademicState(
                      assessments,
                      row.grades,
                    );

                    return (
                      <tr key={row.student.id}>
                        <th scope="row">
                          <button
                            type="button"
                            className="student-cell-button"
                            onClick={() => openStudentDetail(row.student.id)}
                          >
                            <strong>{row.student.name}</strong>
                            <small>{row.student.registration}</small>
                          </button>
                        </th>

                        {assessments.map((assessment, assessmentIndex) => {
                          const persisted = gradeMap.get(
                            gradeKey(row.student.id, assessment.id),
                          );

                          return (
                            <td key={assessment.id}>
                              {readOnly || assessment.status === "closed" ? (
                                <ReadOnlyGradeCell
                                  grade={persisted}
                                  assessment={assessment}
                                />
                              ) : (
                                <GradeCell
                                  student={row.student}
                                  assessment={assessment}
                                  persisted={persisted}
                                  disabled={csvApplying}
                                  inputRef={(element) => {
                                    const key = `desktop:${gradeKey(row.student.id, assessment.id)}`;
                                    if (element) inputRefs.current.set(key, element);
                                    else inputRefs.current.delete(key);
                                  }}
                                  onSave={saveGrade}
                                  onNavigate={(action) =>
                                    navigateDesktop(
                                      studentIndex,
                                      assessmentIndex,
                                      action,
                                    )
                                  }
                                />
                              )}
                            </td>
                          );
                        })}

                        <td className="average-cell">
                          <strong>
                            {result.average === null
                              ? "—"
                              : formatScore(result.average, 1)}
                          </strong>
                          <small>
                            {result.isPartial ? "Média parcial" : "Média final"}
                          </small>
                        </td>
                        <td>
                          <AcademicStateBadge state={state} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="gradebook-mobile" aria-label="Lançamento mobile por avaliação">
            <div className="mobile-assessment-selector">
              <label>
                <span>Avaliação</span>
                <select
                  value={effectiveMobileAssessmentId}
                  onChange={(event) =>
                    setMobileAssessmentId(event.target.value)
                  }
                >
                  {assessments.map((assessment) => (
                    <option key={assessment.id} value={assessment.id}>
                      {assessment.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {(() => {
              const assessment = assessments.find(
                (item) => item.id === effectiveMobileAssessmentId,
              ) ?? assessments[0];
              const assessmentIndex = assessments.findIndex(
                (item) => item.id === assessment.id,
              );

              return (
                <>
                  <header className="mobile-grade-header">
                    <div>
                      <span>
                        {currentContext?.className} ·{" "}
                        {currentContext?.subjectName}
                      </span>
                      <h2>{assessment.name}</h2>
                    </div>
                    <div>
                      <small>Valor máximo</small>
                      <strong>{formatScore(assessment.maxScore)}</strong>
                    </div>
                    <span className={`status-pill status-pill--${assessment.status}`}>
                      {ASSESSMENT_STATUS_LABELS[assessment.status]}
                    </span>
                  </header>

                  {assessment.status === "closed" ? (
                    <div className="academic-alert">
                      Avaliação fechada — lançamento bloqueado.
                    </div>
                  ) : null}

                  <div className="mobile-grade-list">
                    {filteredRows.map((row, studentIndex) => {
                      const persisted = gradeMap.get(
                        gradeKey(row.student.id, assessment.id),
                      );
                      return (
                        <article className="mobile-grade-row" key={row.student.id}>
                          <button
                            className="mobile-grade-row__student"
                            type="button"
                            onClick={() => openStudentDetail(row.student.id)}
                          >
                            <strong>{row.student.name}</strong>
                            <small>{row.student.registration}</small>
                          </button>
                          {readOnly || assessment.status === "closed" ? (
                            <ReadOnlyGradeCell
                              grade={persisted}
                              assessment={assessment}
                            />
                          ) : (
                            <GradeCell
                              student={row.student}
                              assessment={assessment}
                              persisted={persisted}
                              disabled={csvApplying}
                              mobile
                              inputRef={(element) => {
                                const key = `mobile:${gradeKey(row.student.id, assessment.id)}`;
                                if (element) inputRefs.current.set(key, element);
                                else inputRefs.current.delete(key);
                              }}
                              onSave={saveGrade}
                              onNavigate={() =>
                                navigateMobile(studentIndex, assessmentIndex)
                              }
                            />
                          )}
                        </article>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </section>
        </>
      )}

      {selectedStudent ? (
        <StudentDetailPanel
          student={selectedStudent}
          assessments={assessments}
          grades={grades}
          classAverage={classAverage}
          onClose={closeStudentDetail}
          data={data}
        />
      ) : null}

      <aside className="academic-demo-rule">
        <strong>Regra demonstrativa</strong>
        <p>{ACADEMIC_DEMO_CONFIG.ruleNotice}</p>
      </aside>
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "attention" | "pending";
}) {
  return (
    <article className={`gradebook-metric${tone ? ` gradebook-metric--${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function AcademicStateBadge({ state }: { state: AcademicState }) {
  return (
    <span className={`academic-state academic-state--${state}`}>
      {academicStateLabel(state)}
    </span>
  );
}

function ReadOnlyGradeCell({
  grade,
  assessment,
}: {
  grade: Grade | undefined;
  assessment: Assessment;
}) {
  return (
    <div
      className="grade-readonly"
      aria-label={`Nota ${grade?.score ?? "pendente"} de ${formatScore(assessment.maxScore)}`}
    >
      <strong>{grade?.score === null || !grade ? "—" : formatScore(grade.score)}</strong>
      {assessment.status === "closed" ? <small>Fechada</small> : null}
    </div>
  );
}

function GradeCell({
  student,
  assessment,
  persisted,
  disabled,
  onSave,
  onNavigate,
  inputRef,
  mobile = false,
}: {
  student: Student;
  assessment: Assessment;
  persisted: Grade | undefined;
  disabled: boolean;
  onSave: (
    student: Student,
    assessment: Assessment,
    score: number,
  ) => Promise<Grade>;
  onNavigate: (action: GradeNavigationAction) => HTMLInputElement | null;
  inputRef: (element: HTMLInputElement | null) => void;
  mobile?: boolean;
}) {
  const [draft, setDraft] = useState(
    persisted?.score === null || !persisted ? "" : formatScore(persisted.score),
  );
  const [state, setState] = useState<CellSaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const operationVersion = useRef(0);
  const blurCommitGuard = useRef(createGradeBlurCommitGuard());
  const persistedVersion = `${persisted?.id ?? "pending"}:${persisted?.updatedAt ?? ""}:${persisted?.score ?? ""}`;
  const [observedPersistedVersion, setObservedPersistedVersion] = useState(
    persistedVersion,
  );

  if (
    observedPersistedVersion !== persistedVersion &&
    state !== "editing" &&
    state !== "saving"
  ) {
    setObservedPersistedVersion(persistedVersion);
    setDraft(
      persisted?.score === null || !persisted
        ? ""
        : formatScore(persisted.score),
    );
  }

  async function commit(): Promise<boolean> {
    if (disabled) {
      setDraft(
        persisted?.score === null || !persisted
          ? ""
          : formatScore(persisted.score),
      );
      setState("idle");
      setError(null);
      return false;
    }

    const validated = validateScoreInput(draft, assessment.maxScore);

    if (!validated.ok) {
      setState("error");
      setError(validated.message);
      setDraft(
        persisted?.score === null || !persisted
          ? ""
          : formatScore(persisted.score),
      );
      queueMicrotask(() => {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement) active.focus();
      });
      return false;
    }

    if (
      persisted?.status === "recorded" &&
      persisted.score === validated.score
    ) {
      setState("saved");
      setError(null);
      setDraft(formatScore(validated.score));
      return true;
    }

    const version = ++operationVersion.current;
    setState("saving");
    setError(null);

    try {
      const nextGrade = await onSave(student, assessment, validated.score);
      if (operationVersion.current === version) {
        setDraft(formatScore(nextGrade.score));
        setState("saved");
      }
      return true;
    } catch (cause) {
      if (operationVersion.current === version) {
        setState("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Não foi possível salvar a nota.",
        );
        setDraft(
          persisted?.score === null || !persisted
            ? ""
            : formatScore(persisted.score),
        );
      }
      return false;
    }
  }

  async function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    let action: GradeNavigationAction | null = null;
    if (event.key === "Enter") action = "enter";
    if (event.key === "Tab" && event.shiftKey) action = "shiftTab";
    if (event.key === "Tab" && !event.shiftKey) action = "tab";

    if (!action) return;
    event.preventDefault();
    const currentInput = event.currentTarget;

    const saved = await commit();
    if (!saved) {
      currentInput.focus();
      return;
    }

    const target = onNavigate(mobile ? "enter" : action);
    if (blurCommitGuard.current.prepareFocusTransfer(currentInput, target)) {
      target?.focus();
    }
  }

  return (
    <div className={`grade-cell${mobile ? " grade-cell--mobile" : ""}`}>
      <div className="grade-cell__input-wrap">
        <input
          ref={inputRef}
          inputMode="decimal"
          disabled={disabled}
          value={draft}
          aria-label={`Nota de ${student.name} em ${assessment.name}, máximo ${formatScore(assessment.maxScore)}`}
          aria-invalid={state === "error"}
          aria-describedby={
            error ? `grade-error-${student.id}-${assessment.id}` : undefined
          }
          placeholder="—"
          onFocus={() => {
            setState("editing");
            setError(null);
          }}
          onChange={(event) => {
            setDraft(event.target.value);
            setState("editing");
            setError(null);
          }}
          onBlur={() => {
            if (blurCommitGuard.current.consumeBlurSkip()) {
              return;
            }
            if (state === "editing") {
              void commit();
            }
          }}
          onKeyDown={(event) => void handleKeyDown(event)}
        />
        <span className={`grade-save-state grade-save-state--${state}`} aria-live="polite">
          {state === "editing"
            ? "editando"
            : state === "saving"
              ? "salvando"
              : state === "saved"
                ? "salvo"
                : state === "error"
                  ? "erro"
                  : ""}
        </span>
      </div>
      {mobile ? (
        <small className="grade-cell__maximum">máx. {formatScore(assessment.maxScore)}</small>
      ) : null}
      {error ? (
        <small
          className="grade-cell__error"
          id={`grade-error-${student.id}-${assessment.id}`}
          role="alert"
        >
          {error}
        </small>
      ) : null}
    </div>
  );
}

function StudentDetailPanel({
  student,
  assessments,
  grades,
  classAverage,
  onClose,
  data,
}: {
  student: Student;
  assessments: Assessment[];
  grades: Grade[];
  classAverage: number | null;
  onClose: () => void;
  data: ReturnType<typeof useAcademicData>["data"];
}) {
  const assessmentIds = useMemo(
    () => assessments.map((assessment) => assessment.id),
    [assessments],
  );
  const studentGrades = useMemo(
    () =>
      selectContextualStudentGrades(grades, student.id, assessmentIds),
    [assessmentIds, grades, student.id],
  );
  const result = calculateWeightedAverage(assessments, studentGrades);
  const state = calculateStudentAcademicState(assessments, studentGrades);
  const schoolClass = data?.classes.find((item) => item.id === student.classId);
  const [auditQuery, setAuditQuery] = useState<{
    gradeIdsKey: string | null;
    state: AuditHistoryState;
  }>({
    gradeIdsKey: null,
    state: { status: "empty", entries: [], error: null },
  });
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const gradeIds = useMemo(
    () => studentGrades.map((grade) => grade.id),
    [studentGrades],
  );
  const gradeIdsKey = gradeIds.slice().sort().join("|");
  const auditLoading = auditQuery.gradeIdsKey !== gradeIdsKey;
  const auditState = auditQuery.state;

  useEffect(() => {
    closeButtonRef.current?.focus();

    function handleDialogKeyDown(event: KeyboardEvent) {
      if (shouldCloseStudentDetail(event.key)) {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = [...panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleDialogKeyDown);
    return () => document.removeEventListener("keydown", handleDialogKeyDown);
  }, [onClose]);

  useEffect(() => {
    let active = true;
    void loadAuditHistory(
      gradeIds,
      (entityIds) => getAcademicServices().audit.getByEntities(entityIds),
    ).then((nextState) => {
      if (active) {
        setAuditQuery({ gradeIdsKey, state: nextState });
      }
    });
    return () => {
      active = false;
    };
  }, [gradeIds, gradeIdsKey]);

  return (
    <section className="student-detail">
      <div className="student-detail__backdrop" onClick={onClose} aria-hidden="true" />
      <div
        className="student-detail__panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-detail-title"
      >
        <header>
          <div>
            <span className="academic-kicker">Visão individual</span>
            <h2 id="student-detail-title">{student.name}</h2>
            <p>
              Matrícula {student.registration} · {schoolClass?.name ?? "Turma"}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Fechar visão do aluno"
          >
            ×
          </button>
        </header>

        <div className="student-detail__summary">
          <div>
            <span>{result.isPartial ? "Média parcial" : "Média"}</span>
            <strong>{result.average === null ? "—" : formatScore(result.average, 1)}</strong>
          </div>
          <div>
            <span>Média da turma</span>
            <strong>{classAverage === null ? "—" : formatScore(classAverage, 1)}</strong>
          </div>
          <div>
            <span>Situação</span>
            <AcademicStateBadge state={state} />
          </div>
        </div>

        <div className="student-detail__section">
          <h3>Avaliações e evolução</h3>
          <div className="student-evolution">
            {assessments.map((assessment) => {
              const grade = studentGrades.find(
                (item) => item.assessmentId === assessment.id,
              );
              const normalized =
                grade?.score === null || !grade
                  ? null
                  : Math.min(100, (grade.score / assessment.maxScore) * 100);
              return (
                <article key={assessment.id}>
                  <div>
                    <strong>{assessment.name}</strong>
                    <span>{formatAcademicDate(assessment.date)}</span>
                  </div>
                  <div className="student-evolution__score">
                    <strong>
                      {grade?.score === null || !grade
                        ? "Pendente"
                        : `${formatScore(grade.score)} / ${formatScore(assessment.maxScore)}`}
                    </strong>
                    <span className="student-evolution__bar" aria-hidden="true">
                      <i style={{ width: `${normalized ?? 0}%` }} />
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </div>

        <div className="student-detail__section">
          <h3>Histórico de alterações</h3>
          {auditLoading ? (
            <p className="student-detail__empty">Carregando auditoria…</p>
          ) : auditState.status === "error" ? (
            <p className="student-detail__empty" role="alert">
              Não foi possível carregar o histórico: {auditState.error}
            </p>
          ) : auditState.status === "empty" ? (
            <p className="student-detail__empty">
              Nenhuma alteração manual auditada para este aluno neste contexto.
            </p>
          ) : (
            <div className="audit-list">
              {auditState.entries.map((entry) => {
                const grade = studentGrades.find(
                  (item) => item.id === entry.entityId,
                );
                const assessment = assessments.find(
                  (item) => item.id === grade?.assessmentId,
                );
                return (
                  <article key={entry.id}>
                    <time>{new Date(entry.timestamp).toLocaleString("pt-BR")}</time>
                    <strong>{assessment?.name ?? "Avaliação"}</strong>
                    <span>
                      {entry.previousValue === null
                        ? "Sem lançamento"
                        : formatScore(Number(entry.previousValue))}{" "}
                      → {formatScore(Number(entry.newValue))}
                    </span>
                    <small>
                      Aluno: {student.name} · Origem: {entry.source} · Ator:{" "}
                      {data?.teachers.find((teacher) => teacher.id === entry.actorId)?.name ??
                        entry.actorId}
                    </small>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
