"use client";

import { useMemo, useState } from "react";
import { useAcademicData } from "@/src/components/platform/AcademicDataProvider";
import {
  ACADEMIC_PERIODS,
  DEMO_PROFILE_IDS,
  type AcademicPeriod,
} from "@/src/config/academic-demo";
import { getAcademicServices } from "@/src/config/services";
import { formatLocalDateInput } from "@/src/modules/assessments/date";
import {
  ASSESSMENT_STATUS_LABELS,
  ASSESSMENT_TYPE_LABELS,
  formatAcademicDate,
} from "@/src/modules/assessments/presentation";
import type {
  Assessment,
  AssessmentStatus,
  AssessmentType,
} from "@/src/types/academic";

interface AssessmentFormState {
  name: string;
  assignmentKey: string;
  period: AcademicPeriod;
  date: string;
  type: AssessmentType;
  maxScore: string;
  weight: string;
  status: AssessmentStatus;
}

function createEmptyForm(): AssessmentFormState {
  return {
    name: "",
    assignmentKey: "",
    period: ACADEMIC_PERIODS[0],
    date: formatLocalDateInput(),
    type: "exam" as AssessmentType,
    maxScore: "10",
    weight: "1",
    status: "draft" as AssessmentStatus,
  };
}

export function AssessmentManager() {
  const { data, updateAssessmentSnapshot } = useAcademicData();
  const [form, setForm] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const assignments = useMemo(
    () =>
      (data?.teachingAssignments ?? []).filter(
        (assignment) =>
          assignment.teacherId === DEMO_PROFILE_IDS.professor &&
          assignment.active,
      ),
    [data],
  );

  const allowedPairKeys = useMemo(
    () =>
      new Set(
        assignments.map(
          (assignment) => `${assignment.classId}::${assignment.subjectId}`,
        ),
      ),
    [assignments],
  );

  const assessments = useMemo(
    () =>
      (data?.assessments ?? [])
        .filter((assessment) =>
          allowedPairKeys.has(`${assessment.classId}::${assessment.subjectId}`),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data, allowedPairKeys],
  );

  const assignmentOptions = assignments.map((assignment) => {
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
    };
  });

  const effectiveAssignmentKey =
    form.assignmentKey || assignmentOptions[0]?.key || "";

  function resetForm() {
    setEditingId(null);
    setForm({
      ...createEmptyForm(),
      assignmentKey: assignmentOptions[0]?.key ?? "",
    });
    setFeedback(null);
  }

  function startEditing(assessment: Assessment) {
    setEditingId(assessment.id);
    setForm({
      name: assessment.name,
      assignmentKey: `${assessment.classId}::${assessment.subjectId}`,
      period: assessment.period,
      date: assessment.date,
      type: assessment.type,
      maxScore: String(assessment.maxScore),
      weight: String(assessment.weight),
      status: assessment.status,
    });
    setFeedback(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);

    const [classId, subjectId] = effectiveAssignmentKey.split("::");
    const maxScore = Number(form.maxScore.replace(",", "."));
    const weight = Number(form.weight.replace(",", "."));
    const services = getAcademicServices();

    setSaving(true);
    try {
      if (editingId) {
        const existing = assessments.find(
          (assessment) => assessment.id === editingId,
        );
        if (!existing) {
          throw new Error("Avaliação não encontrada para edição.");
        }
        const updated = await services.assessments.update(
          {
            ...existing,
            name: form.name,
            classId,
            subjectId,
            period: form.period,
            date: form.date,
            type: form.type,
            maxScore,
            weight,
            status: form.status,
          },
          DEMO_PROFILE_IDS.professor,
        );
        updateAssessmentSnapshot(updated);
        setFeedback("Avaliação atualizada com sucesso.");
      } else {
        const created = await services.assessments.create(
          {
            name: form.name,
            classId,
            subjectId,
            period: form.period,
            date: form.date,
            type: form.type,
            maxScore,
            weight,
          },
          DEMO_PROFILE_IDS.professor,
        );
        updateAssessmentSnapshot(created);
        setFeedback("Avaliação criada como Rascunho.");
      }

      if (!editingId) {
        setForm({
          ...createEmptyForm(),
          assignmentKey: effectiveAssignmentKey,
        });
      }
    } catch (cause) {
      setFeedback(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar a avaliação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="academic-page">
      <header className="academic-page__header">
        <div>
          <span className="academic-kicker">Academic Core</span>
          <h1>Avaliações</h1>
          <p>
            Crie e acompanhe avaliações somente nas combinações de turma e
            disciplina atribuídas a este professor.
          </p>
        </div>
        <button className="button button--blue" type="button" onClick={resetForm}>
          Nova avaliação
        </button>
      </header>

      <div className="assessment-layout">
        <section className="academic-card" aria-labelledby="assessment-list-title">
          <div className="academic-card__heading">
            <div>
              <span>Visão do professor</span>
              <h2 id="assessment-list-title">Avaliações cadastradas</h2>
            </div>
            <strong>{assessments.length}</strong>
          </div>

          {assessments.length === 0 ? (
            <div className="academic-empty">
              <strong>Nenhuma avaliação cadastrada</strong>
              <p>Crie a primeira avaliação para iniciar o lançamento de notas.</p>
            </div>
          ) : (
            <div className="assessment-list">
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
                        {assessment.maxScore.toLocaleString("pt-BR")} pts · peso{" "}
                        {assessment.weight.toLocaleString("pt-BR")}
                      </span>
                      <button
                        type="button"
                        onClick={() => startEditing(assessment)}
                        disabled={assessment.status === "closed"}
                      >
                        {assessment.status === "closed" ? "Fechada" : "Editar"}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="academic-card assessment-form-card">
          <div className="academic-card__heading">
            <div>
              <span>{editingId ? "Edição" : "Criação"}</span>
              <h2>{editingId ? "Editar avaliação" : "Nova avaliação"}</h2>
            </div>
          </div>

          <form className="academic-form" onSubmit={submit}>
            <label>
              <span>Nome</span>
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Ex.: Prova bimestral"
              />
            </label>

            <label>
              <span>Turma e disciplina</span>
              <select
                value={effectiveAssignmentKey}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    assignmentKey: event.target.value,
                  }))
                }
              >
                {assignmentOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="academic-form__row">
              <label>
                <span>Período</span>
                <select
                  value={form.period}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      period: event.target.value as AcademicPeriod,
                    }))
                  }
                >
                  {ACADEMIC_PERIODS.map((period) => (
                    <option key={period}>{period}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Data</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="academic-form__row">
              <label>
                <span>Tipo</span>
                <select
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value as AssessmentType,
                    }))
                  }
                >
                  {Object.entries(ASSESSMENT_TYPE_LABELS).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label>
                <span>Valor máximo</span>
                <input
                  inputMode="decimal"
                  value={form.maxScore}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      maxScore: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className="academic-form__row">
              <label>
                <span>Peso</span>
                <input
                  inputMode="decimal"
                  value={form.weight}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weight: event.target.value,
                    }))
                  }
                />
              </label>
              {editingId ? (
                <label>
                  <span>Status</span>
                  <select
                    value={form.status}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        status: event.target.value as AssessmentStatus,
                      }))
                    }
                  >
                    {Object.entries(ASSESSMENT_STATUS_LABELS).map(
                      ([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
              ) : (
                <div className="form-hint">
                  <span>Status inicial</span>
                  <strong>Rascunho</strong>
                </div>
              )}
            </div>

            {feedback ? (
              <p className="form-feedback" role="status" aria-live="polite">
                {feedback}
              </p>
            ) : null}

            <div className="academic-form__actions">
              {editingId ? (
                <button type="button" onClick={resetForm}>
                  Cancelar
                </button>
              ) : null}
              <button className="button button--blue" type="submit" disabled={saving}>
                {saving ? "Salvando…" : editingId ? "Salvar alterações" : "Criar avaliação"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}
