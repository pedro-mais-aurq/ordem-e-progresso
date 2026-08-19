import type {
  AssessmentStatus,
  AssessmentType,
} from "@/src/types/academic";

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  exam: "Prova",
  assignment: "Trabalho",
  activity: "Atividade",
  seminar: "Seminário",
  recovery: "Recuperação",
  other: "Outro",
};

export const ASSESSMENT_STATUS_LABELS: Record<AssessmentStatus, string> = {
  draft: "Rascunho",
  reviewed: "Conferido",
  closed: "Fechado",
};

export function formatAcademicDate(date: string): string {
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return date;
  }
  return new Intl.DateTimeFormat("pt-BR").format(parsed);
}
