"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getAcademicServices } from "@/src/config/services";
import { seedDatabase } from "@/src/database/seed/seed";
import type { AcademicDataset } from "@/src/types/academic";

type DataStatus = "loading" | "success" | "empty" | "error";

interface AcademicDataContextValue {
  status: DataStatus;
  data: AcademicDataset | null;
  error: string | null;
  reload: () => Promise<void>;
  refreshSnapshot: () => Promise<void>;
}

const AcademicDataContext = createContext<AcademicDataContextValue | null>(null);

async function loadAcademicData(): Promise<AcademicDataset> {
  await seedDatabase();
  const services = getAcademicServices();

  const [
    students,
    teachers,
    classes,
    subjects,
    assessments,
    auditEntries,
    teachingAssignments,
  ] = await Promise.all([
    services.students.getAll(),
    services.teachers.getAll(),
    services.classes.getAll(),
    services.subjects.getAll(),
    services.assessments.getAll(),
    services.audit.getAll(),
    services.teachingAssignments.getAll(),
  ]);

  // Não usa grades.getAll(): o snapshot é montado pelas avaliações e pelos
  // índices assessmentId já existentes.
  const gradeGroups = await Promise.all(
    assessments.map((assessment) => services.grades.getByAssessment(assessment.id)),
  );

  return {
    students,
    teachers,
    classes,
    subjects,
    assessments,
    grades: gradeGroups.flat(),
    auditEntries,
    teachingAssignments,
  };
}

export function AcademicDataProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [status, setStatus] = useState<DataStatus>("loading");
  const [data, setData] = useState<AcademicDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const snapshotVersion = useRef(0);

  const applySnapshot = useCallback((nextData: AcademicDataset) => {
    setData(nextData);
    setStatus(nextData.students.length === 0 ? "empty" : "success");
    setError(null);
  }, []);

  const reload = useCallback(async () => {
    const version = ++snapshotVersion.current;
    setStatus("loading");
    setError(null);

    try {
      const nextData = await loadAcademicData();
      if (snapshotVersion.current === version) {
        applySnapshot(nextData);
      }
    } catch (cause) {
      if (snapshotVersion.current !== version) return;
      console.error("Falha ao carregar a base acadêmica local:", cause);
      setData(null);
      setStatus("error");
      setError(
        cause instanceof Error
          ? cause.message
          : "Erro inesperado ao carregar os dados locais.",
      );
    }
  }, [applySnapshot]);

  const refreshSnapshot = useCallback(async () => {
    const version = ++snapshotVersion.current;
    try {
      const nextData = await loadAcademicData();
      if (snapshotVersion.current === version) {
        applySnapshot(nextData);
      }
    } catch (cause) {
      if (snapshotVersion.current !== version) return;
      console.error("Falha ao atualizar a base acadêmica local:", cause);
      setError(
        cause instanceof Error
          ? cause.message
          : "Erro inesperado ao atualizar os dados locais.",
      );
    }
  }, [applySnapshot]);

  useEffect(() => {
    let isActive = true;
    const version = ++snapshotVersion.current;

    void loadAcademicData()
      .then((nextData) => {
        if (!isActive || snapshotVersion.current !== version) return;
        applySnapshot(nextData);
      })
      .catch((cause: unknown) => {
        if (!isActive || snapshotVersion.current !== version) return;
        console.error("Falha ao carregar a base acadêmica local:", cause);
        setStatus("error");
        setError(
          cause instanceof Error
            ? cause.message
            : "Erro inesperado ao carregar os dados locais.",
        );
      });

    return () => {
      isActive = false;
    };
  }, [applySnapshot]);

  const value = useMemo(
    () => ({ status, data, error, reload, refreshSnapshot }),
    [status, data, error, reload, refreshSnapshot],
  );

  return (
    <AcademicDataContext.Provider value={value}>
      {children}
    </AcademicDataContext.Provider>
  );
}

export function useAcademicData(): AcademicDataContextValue {
  const context = useContext(AcademicDataContext);
  if (!context) {
    throw new Error(
      "useAcademicData deve ser utilizado dentro de AcademicDataProvider.",
    );
  }
  return context;
}
