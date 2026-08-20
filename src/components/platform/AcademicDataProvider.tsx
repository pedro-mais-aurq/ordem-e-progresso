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
import {
  resetDemoDatabase,
  seedDatabase,
} from "@/src/database/seed/seed";
import {
  upsertAssessmentInSnapshot,
  upsertGradeInSnapshot,
  upsertGradesInSnapshot,
} from "@/src/modules/academic/snapshot";
import { initializeAcademicData } from "@/src/services/academic-initialization";
import { isAcademicIntegrityError } from "@/src/services/academic-integrity";
import type {
  AcademicDataset,
  Assessment,
  Grade,
} from "@/src/types/academic";

type DataStatus = "loading" | "success" | "empty" | "error";
type DataErrorKind = "load" | "integrity";

interface AcademicDataContextValue {
  status: DataStatus;
  data: AcademicDataset | null;
  error: string | null;
  errorKind: DataErrorKind | null;
  reload: () => Promise<void>;
  restoreDemo: () => Promise<void>;
  updateGradeSnapshot: (grade: Grade) => void;
  updateGradesSnapshot: (grades: readonly Grade[]) => void;
  updateAssessmentSnapshot: (assessment: Assessment) => void;
}

const AcademicDataContext = createContext<AcademicDataContextValue | null>(null);

async function loadAcademicData(): Promise<AcademicDataset> {
  const services = getAcademicServices();

  const [
    students,
    teachers,
    classes,
    subjects,
    assessments,
    grades,
    teachingAssignments,
  ] = await Promise.all([
    services.students.getAll(),
    services.teachers.getAll(),
    services.classes.getAll(),
    services.subjects.getAll(),
    services.assessments.getAll(),
    services.grades.getAll(),
    services.teachingAssignments.getAll(),
  ]);

  return {
    students,
    teachers,
    classes,
    subjects,
    assessments,
    grades,
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
  const [errorKind, setErrorKind] = useState<DataErrorKind | null>(null);
  const snapshotVersion = useRef(0);

  const applySnapshot = useCallback((nextData: AcademicDataset) => {
    setData(nextData);
    setStatus(nextData.students.length === 0 ? "empty" : "success");
    setError(null);
    setErrorKind(null);
  }, []);

  const runInitialization = useCallback(async (
    seed: () => Promise<unknown>,
  ) => {
    const version = ++snapshotVersion.current;
    setStatus("loading");
    setError(null);
    setErrorKind(null);

    try {
      const nextData = await initializeAcademicData({
        seed,
        load: loadAcademicData,
      });
      if (snapshotVersion.current === version) {
        applySnapshot(nextData);
      }
    } catch (cause) {
      if (snapshotVersion.current !== version) return;
      console.error("Falha ao carregar a base acadêmica local:", cause);
      setData(null);
      setStatus("error");
      setErrorKind(isAcademicIntegrityError(cause) ? "integrity" : "load");
      setError(
        cause instanceof Error
          ? cause.message
          : "Erro inesperado ao carregar os dados locais.",
      );
    }
  }, [applySnapshot]);

  const reload = useCallback(
    () => runInitialization(seedDatabase),
    [runInitialization],
  );

  const restoreDemo = useCallback(
    () => runInitialization(resetDemoDatabase),
    [runInitialization],
  );

  const updateGradeSnapshot = useCallback((grade: Grade) => {
    setData((current) =>
      current ? upsertGradeInSnapshot(current, grade) : current,
    );
    setError(null);
    setErrorKind(null);
  }, []);

  const updateGradesSnapshot = useCallback((grades: readonly Grade[]) => {
    setData((current) =>
      current ? upsertGradesInSnapshot(current, grades) : current,
    );
    setError(null);
    setErrorKind(null);
  }, []);

  const updateAssessmentSnapshot = useCallback((assessment: Assessment) => {
    setData((current) =>
      current ? upsertAssessmentInSnapshot(current, assessment) : current,
    );
    setError(null);
    setErrorKind(null);
  }, []);

  useEffect(() => {
    const version = ++snapshotVersion.current;

    void initializeAcademicData({
      seed: seedDatabase,
      load: loadAcademicData,
    })
      .then((nextData) => {
        if (snapshotVersion.current === version) {
          applySnapshot(nextData);
        }
      })
      .catch((cause: unknown) => {
        if (snapshotVersion.current !== version) return;
        console.error("Falha ao carregar a base acadêmica local:", cause);
        setData(null);
        setStatus("error");
        setErrorKind(isAcademicIntegrityError(cause) ? "integrity" : "load");
        setError(
          cause instanceof Error
            ? cause.message
            : "Erro inesperado ao carregar os dados locais.",
        );
      });

    return () => {
      snapshotVersion.current += 1;
    };
  }, [applySnapshot]);

  const value = useMemo(
    () => ({
      status,
      data,
      error,
      errorKind,
      reload,
      restoreDemo,
      updateGradeSnapshot,
      updateGradesSnapshot,
      updateAssessmentSnapshot,
    }),
    [
      status,
      data,
      error,
      errorKind,
      reload,
      restoreDemo,
      updateGradeSnapshot,
      updateGradesSnapshot,
      updateAssessmentSnapshot,
    ],
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
