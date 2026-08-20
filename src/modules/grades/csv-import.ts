import { parsePtBrScore } from "./input";

export const CSV_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
export const CSV_IMPORT_MAX_ROWS = 5_000;

export interface CsvFileInput {
  name: string;
  size: number;
  text: string;
}

export interface CsvGradeRow {
  line: number;
  registration: string;
  score: number;
}

export interface CsvImportIssue {
  line: number | null;
  message: string;
}

export interface ParsedGradeCsv {
  rows: CsvGradeRow[];
  issues: CsvImportIssue[];
}

export function validateGradeCsvFile(
  name: string,
  size: number,
): CsvImportIssue | null {
  if (!name.toLocaleLowerCase("pt-BR").endsWith(".csv")) {
    return { line: null, message: "Selecione um arquivo com extensão .csv." };
  }
  if (size > CSV_IMPORT_MAX_BYTES) {
    return { line: null, message: "O arquivo excede o limite de 5 MB." };
  }
  return null;
}

export function parseGradeCsv(file: CsvFileInput): ParsedGradeCsv {
  const fileIssue = validateGradeCsvFile(file.name, file.size);
  if (fileIssue) {
    return { rows: [], issues: [fileIssue] };
  }

  const normalizedText = file.text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (normalizedText.trim().length === 0) {
    return { rows: [], issues: [{ line: null, message: "O arquivo CSV está vazio." }] };
  }

  const lines = normalizedText.split("\n");
  while (lines.at(-1)?.trim() === "") lines.pop();
  const header = lines.shift()?.split(";").map((field) => field.trim()) ?? [];
  if (header.length !== 2 || header[0] !== "matricula" || header[1] !== "nota") {
    return {
      rows: [],
      issues: [{ line: 1, message: 'O cabeçalho deve ser exatamente "matricula;nota".' }],
    };
  }
  if (lines.length > CSV_IMPORT_MAX_ROWS) {
    return {
      rows: [],
      issues: [{ line: null, message: `O arquivo excede o limite de ${CSV_IMPORT_MAX_ROWS} linhas de dados.` }],
    };
  }

  const rows: CsvGradeRow[] = [];
  const issues: CsvImportIssue[] = [];
  const registrations = new Set<string>();

  lines.forEach((line, index) => {
    const lineNumber = index + 2;
    if (line.trim().length === 0) {
      issues.push({ line: lineNumber, message: "A linha está vazia." });
      return;
    }
    const fields = line.split(";");
    if (fields.length !== 2) {
      issues.push({ line: lineNumber, message: "A linha deve conter somente matrícula e nota." });
      return;
    }
    const registration = fields[0].trim();
    const rawScore = fields[1].trim();
    if (!/^\d{8}$/.test(registration)) {
      issues.push({ line: lineNumber, message: "A matrícula deve possuir exatamente 8 dígitos." });
      return;
    }
    if (registrations.has(registration)) {
      issues.push({ line: lineNumber, message: `A matrícula ${registration} está duplicada no arquivo.` });
      return;
    }
    registrations.add(registration);
    if (rawScore.length === 0) {
      issues.push({ line: lineNumber, message: `A nota da matrícula ${registration} está vazia.` });
      return;
    }
    const score = parsePtBrScore(rawScore);
    if (score === null) {
      issues.push({ line: lineNumber, message: `A nota da matrícula ${registration} é inválida.` });
      return;
    }
    rows.push({ line: lineNumber, registration, score });
  });

  if (lines.length === 0) {
    issues.push({ line: null, message: "O arquivo não contém linhas de notas." });
  }

  return { rows, issues };
}

export function createGradeCsvTemplate(registrations: readonly string[] = []): string {
  const body = registrations.map((registration) => `${registration};`).join("\n");
  return `\uFEFFmatricula;nota${body ? `\n${body}` : ""}\n`;
}
