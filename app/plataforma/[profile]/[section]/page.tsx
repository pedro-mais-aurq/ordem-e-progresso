import { notFound } from "next/navigation";
import { AcademicSectionPage } from "@/src/components/academic/AcademicSectionPage";
import { DataState } from "@/src/components/platform/DataState";
import { PlatformShell } from "@/src/components/platform/PlatformShell";
import {
  canAccessSection,
  isPlatformSection,
  isUserProfile,
} from "@/src/config/profile-capabilities";

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
      <DataState>
        <AcademicSectionPage profile={profile} section={section} />
      </DataState>
    </PlatformShell>
  );
}
