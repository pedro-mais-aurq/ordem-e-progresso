"use client";

import { useMemo, useState } from "react";
import { getAcademicServices } from "@/src/config/services";
import {
  createGradeCsvTemplate,
  parseGradeCsv,
  validateGradeCsvFile,
  type CsvGradeRow,
  type CsvImportIssue,
} from "@/src/modules/grades/csv-import";
import { formatScore } from "@/src/modules/grades/input";
import type {
  GradeConflictResolution,
  GradeImportPreview,
  GradeImportPreviewRow,
  GradeImportResult,
} from "@/src/services/grade-import-service";
import type { Assessment, Grade, Student } from "@/src/types/academic";

interface GradeCsvImportProps {
  assessments: readonly Assessment[];
  students: readonly Student[];
  teacherId: string;
  disabled?: boolean;
  onApplyingChange?: (applying: boolean) => void;
  onImported: (grades: readonly Grade[]) => void;
}

type GradeImportUiState = "idle" | "previewing" | "applying";

const STATUS_LABELS = {
  new: "NOVA",
  unchanged: "SEM ALTERAÇÃO",
  conflict: "CONFLITO",
  error: "ERRO",
} as const;

export function GradeCsvImport({
  assessments,
  students,
  teacherId,
  disabled = false,
  onApplyingChange,
  onImported,
}: GradeCsvImportProps) {
  const initialAssessment = assessments.find((item) => item.status !== "closed")?.id ?? assessments[0]?.id ?? "";
  const [open, setOpen] = useState(false);
  const [assessmentId, setAssessmentId] = useState(initialAssessment);
  const [rows, setRows] = useState<CsvGradeRow[]>([]);
  const [issues, setIssues] = useState<CsvImportIssue[]>([]);
  const [preview, setPreview] = useState<GradeImportPreview | null>(null);
  const [resolutions, setResolutions] = useState<Record<string, GradeConflictResolution>>({});
  const [importState, setImportState] = useState<GradeImportUiState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GradeImportResult | null>(null);

  const selectedAssessment = assessments.find((item) => item.id === assessmentId);
  const busy = importState !== "idle";
  const unresolvedConflicts = useMemo(
    () => preview?.rows.filter(
      (row) => row.status === "conflict" && !resolutions[row.registration],
    ).length ?? 0,
    [preview, resolutions],
  );

  function resetPreview(nextAssessmentId = assessmentId) {
    setAssessmentId(nextAssessmentId);
    setRows([]);
    setIssues([]);
    setPreview(null);
    setResolutions({});
    setError(null);
    setResult(null);
  }

  async function handleFile(file: File | undefined) {
    setImportState("previewing");
    setError(null);
    setResult(null);
    setPreview(null);
    setResolutions({});
    try {
      if (!file) {
        setRows([]);
        setIssues([]);
        return;
      }
      if (!assessmentId) {
        throw new Error("Selecione uma avaliação antes do arquivo.");
      }
      const fileIssue = validateGradeCsvFile(file.name, file.size);
      if (fileIssue) {
        setRows([]);
        setIssues([fileIssue]);
        return;
      }
      const parsed = parseGradeCsv({
        name: file.name,
        size: file.size,
        text: await file.text(),
      });
      setRows(parsed.rows);
      setIssues(parsed.issues);
      if (parsed.issues.length > 0) return;

      const nextPreview = await getAcademicServices().gradeImports.preview(
        teacherId,
        assessmentId,
        parsed.rows,
      );
      setPreview(nextPreview);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível ler o arquivo CSV.");
    } finally {
      setImportState("idle");
    }
  }

  async function applyImport() {
    if (!preview || disabled || importState !== "idle") return;
    setImportState("applying");
    onApplyingChange?.(true);
    setError(null);
    setResult(null);
    try {
      const nextResult = await getAcademicServices().gradeImports.apply({
        teacherId,
        assessmentId,
        rows,
        resolutions,
      });
      onImported(nextResult.grades);
      setResult(nextResult);
      setPreview(null);
      setRows([]);
      setResolutions({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "A importação não pôde ser concluída.");
    } finally {
      onApplyingChange?.(false);
      setImportState("idle");
    }
  }

  function replaceAllConflicts() {
    if (
      !preview ||
      disabled ||
      busy ||
      !window.confirm("Substituir todas as notas em conflito pelos valores do CSV?")
    ) {
      return;
    }
    setResolutions(Object.fromEntries(
      preview.rows
        .filter((row) => row.status === "conflict")
        .map((row) => [row.registration, "replace" as const]),
    ));
  }

  function downloadTemplate() {
    const blob = new Blob(
      [createGradeCsvTemplate(students.map((student) => student.registration))],
      { type: "text/csv;charset=utf-8" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "modelo-notas.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section
      className="grade-csv-import"
      aria-labelledby="csv-import-title"
      aria-busy={importState === "applying"}
    >
      <div className="grade-csv-import__summary">
        <div>
          <span className="academic-kicker">Importação assistida</span>
          <h2 id="csv-import-title">Notas por CSV</h2>
          <p>Uma avaliação por arquivo, com prévia, conflitos explícitos e auditoria.</p>
        </div>
        <div className="grade-csv-import__actions">
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled || busy}
            onClick={downloadTemplate}
          >
            Baixar modelo CSV
          </button>
          <button
            type="button"
            className="button"
            disabled={disabled || busy}
            onClick={() => setOpen((current) => !current)}
          >
            {open ? "Fechar importação" : "Importar CSV"}
          </button>
        </div>
      </div>

      {open ? (
        <div className="grade-csv-import__panel">
          <div className="grade-csv-import__fields">
            <label>
              <span>Avaliação</span>
              <select
                value={assessmentId}
                disabled={disabled || busy}
                onChange={(event) => resetPreview(event.target.value)}
              >
                {assessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id}>
                    {assessment.name}{assessment.status === "closed" ? " — fechada" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Arquivo CSV · até 5 MB</span>
              <input
                key={`${assessmentId}:${rows.length}:${result ? "done" : "ready"}`}
                type="file"
                accept=".csv,text/csv"
                disabled={
                  !assessmentId ||
                  selectedAssessment?.status === "closed" ||
                  disabled ||
                  busy
                }
                onChange={(event) => void handleFile(event.target.files?.[0])}
              />
            </label>
          </div>

          {selectedAssessment?.status === "closed" ? (
            <p className="academic-alert academic-alert--error" role="alert">
              Avaliação fechada — a importação está bloqueada.
            </p>
          ) : null}
          {busy ? (
            <p className="academic-alert" role="status">
              {importState === "applying" ? "Aplicando lote de notas…" : "Processando CSV…"}
            </p>
          ) : null}
          {error ? <p className="academic-alert academic-alert--error" role="alert">{error}</p> : null}
          {issues.length > 0 ? (
            <div className="grade-csv-import__issues" role="alert">
              <strong>Corrija o arquivo antes de continuar:</strong>
              <ul>
                {issues.map((issue, index) => (
                  <li key={`${issue.line ?? "file"}-${index}`}>
                    {issue.line ? `Linha ${issue.line}: ` : ""}{issue.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {result ? (
            <div className="grade-csv-import__result" role="status">
              <strong>Importação concluída</strong>
              <span>{result.added} notas adicionadas</span>
              <span>{result.updated} notas atualizadas</span>
              <span>{result.kept} mantidas</span>
            </div>
          ) : null}
          {preview ? (
            <>
              <div className="grade-csv-import__preview-heading">
                <div>
                  <strong>Prévia da importação</strong>
                  <span>{preview.rows.length} linha(s) validada(s)</span>
                </div>
                {preview.conflictCount > 0 ? (
                  <button type="button" disabled={disabled || busy} onClick={replaceAllConflicts}>
                    Substituir todos os conflitos
                  </button>
                ) : null}
              </div>
              <div className="grade-csv-import__table-wrap">
                <table className="grade-csv-import__table">
                  <thead>
                    <tr>
                      <th scope="col">Estudante</th>
                      <th scope="col">CSV</th>
                      <th scope="col">Atual</th>
                      <th scope="col">Status / decisão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <PreviewRow
                        key={`${row.line}:${row.registration}`}
                        row={row}
                        disabled={disabled || busy}
                        resolution={resolutions[row.registration]}
                        onResolution={(resolution) => setResolutions((current) => ({
                          ...current,
                          [row.registration]: resolution,
                        }))}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grade-csv-import__confirm">
                <span>
                  {preview.hasErrors
                    ? "Existem erros que bloqueiam a importação."
                    : unresolvedConflicts > 0
                      ? `${unresolvedConflicts} conflito(s) aguardando decisão.`
                      : "Prévia pronta para confirmação."}
                </span>
                <button
                  type="button"
                  className="button"
                  disabled={
                    preview.hasErrors ||
                    unresolvedConflicts > 0 ||
                    disabled ||
                    busy
                  }
                  onClick={() => void applyImport()}
                >
                  Confirmar importação
                </button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PreviewRow({
  row,
  disabled,
  resolution,
  onResolution,
}: {
  row: GradeImportPreviewRow;
  disabled: boolean;
  resolution: GradeConflictResolution | undefined;
  onResolution: (resolution: GradeConflictResolution) => void;
}) {
  const visualStatus = row.status === "conflict" && resolution === "replace" ? "ALTERAÇÃO" : STATUS_LABELS[row.status];
  return (
    <tr>
      <th scope="row">
        <strong>{row.studentName ?? "Matrícula não resolvida"}</strong>
        <small>{row.registration}</small>
      </th>
      <td>{formatScore(row.score)}</td>
      <td>{formatScore(row.currentScore)}</td>
      <td>
        <span className={`csv-status csv-status--${row.status}`}>{visualStatus}</span>
        {row.message ? <small className="csv-row-error">{row.message}</small> : null}
        {row.status === "conflict" ? (
          <fieldset>
            <legend className="sr-only">Decisão para {row.registration}</legend>
            <label>
              <input
                type="radio"
                name={`conflict-${row.registration}`}
                disabled={disabled}
                checked={resolution === "keep"}
                onChange={() => onResolution("keep")}
              />
              Manter atual
            </label>
            <label>
              <input
                type="radio"
                name={`conflict-${row.registration}`}
                disabled={disabled}
                checked={resolution === "replace"}
                onChange={() => onResolution("replace")}
              />
              Substituir
            </label>
          </fieldset>
        ) : null}
      </td>
    </tr>
  );
}
