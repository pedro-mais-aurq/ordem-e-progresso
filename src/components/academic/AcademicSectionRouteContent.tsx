"use client";

import { useSearchParams } from "next/navigation";
import { AcademicSectionPage } from "@/src/components/academic/AcademicSectionPage";
import { DataState } from "@/src/components/platform/DataState";
import type { PlatformSection } from "@/src/config/profile-capabilities";
import type { UserProfile } from "@/src/types/academic";

export function AcademicSectionRouteContent({
  profile,
  section,
}: {
  profile: UserProfile;
  section: PlatformSection;
}) {
  const searchParams = useSearchParams();
  const classId = searchParams.get("classId");
  const subjectId = searchParams.get("subjectId");
  const period = searchParams.get("period") ?? undefined;
  const content = (
    <AcademicSectionPage
      profile={profile}
      section={section}
      initialGradebookContext={
        classId && subjectId ? { classId, subjectId, period } : undefined
      }
    />
  );

  return section === "comunicados" ? content : <DataState>{content}</DataState>;
}
