import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AcademicSectionRouteContent } from "@/src/components/academic/AcademicSectionRouteContent";
import { PlatformShell } from "@/src/components/platform/PlatformShell";
import {
  canAccessSection,
  getStaticAcademicRouteParams,
  isPlatformSection,
  isUserProfile,
} from "@/src/config/profile-capabilities";

export const dynamicParams = false;

export function generateStaticParams() {
  return getStaticAcademicRouteParams();
}

export default async function AcademicSectionRoute({
  params,
}: {
  params: Promise<{ profile: string; section: string }>;
}) {
  const { profile, section } = await params;

  if (!isUserProfile(profile) || !isPlatformSection(section)) {
    notFound();
  }

  if (!canAccessSection(profile, section)) {
    notFound();
  }

  return (
    <PlatformShell profile={profile}>
      <Suspense
        fallback={
          <div className="state-panel state-panel--loading" role="status">
            <span className="state-spinner" aria-hidden="true" />
            <div>
              <strong>Preparando módulo acadêmico</strong>
              <p>Carregando o contexto da rota…</p>
            </div>
          </div>
        }
      >
        <AcademicSectionRouteContent profile={profile} section={section} />
      </Suspense>
    </PlatformShell>
  );
}
