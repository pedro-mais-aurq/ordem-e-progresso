import type { AcademicDataset } from "@/src/types/academic";
import { ensureAcademicDatasetIntegrity } from "./academic-integrity";

interface AcademicInitializationDependencies {
  seed: () => Promise<unknown>;
  load: () => Promise<AcademicDataset>;
}

export async function initializeAcademicData({
  seed,
  load,
}: AcademicInitializationDependencies): Promise<AcademicDataset> {
  await seed();
  const dataset = await load();
  ensureAcademicDatasetIntegrity(dataset);
  return dataset;
}
