export function parsePtBrScore(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (normalized.length === 0) {
    return null;
  }
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateScoreInput(
  value: string,
  maxScore: number,
): { ok: true; score: number } | { ok: false; message: string } {
  if (value.trim().length === 0) {
    return {
      ok: false,
      message:
        "A nota não pode ficar vazia. A remoção de lançamento não faz parte desta P2.",
    };
  }

  const score = parsePtBrScore(value);
  if (score === null) {
    return { ok: false, message: "Digite uma nota numérica válida." };
  }

  if (score < 0 || score > maxScore) {
    return {
      ok: false,
      message: `A nota deve estar entre 0 e ${formatScore(maxScore)}.`,
    };
  }

  return { ok: true, score };
}

export function formatScore(value: number | null, maximumFractionDigits = 2): string {
  if (value === null) {
    return "—";
  }
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}
