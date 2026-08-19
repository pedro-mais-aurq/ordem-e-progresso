"use client";

import Link from "next/link";
import { AssessmentManager } from "@/src/components/academic/AssessmentManager";
import {
  CoordinationAssessmentsPage,
  CoordinationClassesPage,
} from "@/src/components/academic/CoordinationAcademicPages";
import { GradebookPage } from "@/src/components/academic/GradebookPage";
import {
  StudentAssessmentsPage,
  StudentGradesPage,
} from "@/src/components/academic/StudentAcademicPages";
import { TeacherClassesPage } from "@/src/components/academic/TeacherClassesPage";
import { SECTION_DEFINITIONS, type PlatformSection } from "@/src/config/profile-capabilities";
import type { UserProfile } from "@/src/types/academic";

export function AcademicSectionPage({
  profile,
  section,
}: {
  profile: UserProfile;
  section: PlatformSection;
}) {
  if (profile === "professor") {
    if (section === "turmas") return <TeacherClassesPage />;
    if (section === "avaliacoes") return <AssessmentManager />;
    if (section === "notas") return <GradebookPage />;
  }

  if (profile === "coordenacao") {
    if (section === "turmas") return <CoordinationClassesPage />;
    if (section === "avaliacoes") return <CoordinationAssessmentsPage />;
    if (section === "notas") return <GradebookPage readOnly />;
  }

  if (profile === "aluno") {
    if (section === "avaliacoes") return <StudentAssessmentsPage />;
    if (section === "notas") return <StudentGradesPage />;
  }

  const content = SECTION_DEFINITIONS[section];

  return (
    <section className="placeholder-page">
      <span className="placeholder-page__kicker">Módulo preparado</span>
      <div className="placeholder-page__icon" aria-hidden="true">
        {content.label.slice(0, 1)}
      </div>
      <h1>{content.label}</h1>
      <p>{content.description}</p>
      <div className="placeholder-page__status">
        <span /> Em desenvolvimento planejado
      </div>
      <Link href={`/plataforma/${profile}`}>← Voltar ao painel</Link>
    </section>
  );
}
