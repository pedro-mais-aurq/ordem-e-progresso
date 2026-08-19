"use client";

import { useAcademicData } from "./AcademicDataProvider";

export function DataState({ children }: { children: React.ReactNode }) {
  const { status, error, reload } = useAcademicData();

  if (status === "loading") {
    return (
      <div className="state-panel state-panel--loading" role="status" aria-live="polite">
        <span className="state-spinner" aria-hidden="true" />
        <div><strong>Preparando seu ambiente</strong><p>Carregando a base acadêmica demonstrativa…</p></div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="state-panel state-panel--error" role="alert">
        <span aria-hidden="true">!</span>
        <div><strong>Não foi possível carregar os dados</strong><p>{error}</p></div>
        <button type="button" onClick={() => void reload()}>Tentar novamente</button>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="state-panel">
        <span aria-hidden="true">○</span>
        <div><strong>Nenhum dado demonstrativo encontrado</strong><p>Recarregue a base local para continuar.</p></div>
        <button type="button" onClick={() => void reload()}>Recarregar</button>
      </div>
    );
  }

  return children;
}

