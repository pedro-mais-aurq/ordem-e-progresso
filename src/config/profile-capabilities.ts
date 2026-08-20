import type { UserProfile } from "@/src/types/academic";

export type PlatformSection =
  | "turmas"
  | "avaliacoes"
  | "notas"
  | "comunicados";

export const PROFILE_CAPABILITIES = {
  professor: ["turmas", "avaliacoes", "notas"],
  coordenacao: ["turmas", "avaliacoes", "notas"],
  aluno: ["avaliacoes", "notas", "comunicados"],
} as const satisfies Record<UserProfile, readonly PlatformSection[]>;

export const SECTION_DEFINITIONS: Record<
  PlatformSection,
  {
    label: string;
    glyph: string;
    quickDetail: string;
    description: string;
  }
> = {
  turmas: {
    label: "Turmas",
    glyph: "▦",
    quickDetail: "Contexto acadêmico e indicadores",
    description:
      "Consulte turmas, vínculos acadêmicos e indicadores derivados do Academic Core.",
  },
  avaliacoes: {
    label: "Avaliações",
    glyph: "◇",
    quickDetail: "Crie e acompanhe avaliações",
    description:
      "Gerencie avaliações e seus estados no contexto acadêmico permitido.",
  },
  notas: {
    label: "Notas",
    glyph: "✓",
    quickDetail: "Lançamento e acompanhamento dinâmico",
    description:
      "Acesse o Painel Dinâmico de Notas, cálculos, filtros e pendências.",
  },
  comunicados: {
    label: "Comunicados",
    glyph: "✦",
    quickDetail: "Avisos institucionais ao estudante",
    description:
      "Este módulo será responsável pelos avisos institucionais destinados ao estudante.",
  },
};

export function isUserProfile(value: string): value is UserProfile {
  return value === "professor" || value === "coordenacao" || value === "aluno";
}

export function isPlatformSection(value: string): value is PlatformSection {
  return value in SECTION_DEFINITIONS;
}

export function canAccessSection(
  profile: UserProfile,
  section: PlatformSection,
): boolean {
  return PROFILE_CAPABILITIES[profile].some((capability) => capability === section);
}

export function getProfileSections(profile: UserProfile): readonly PlatformSection[] {
  return PROFILE_CAPABILITIES[profile];
}

export function getStaticAcademicRouteParams(): Array<{
  profile: UserProfile;
  section: PlatformSection;
}> {
  return (Object.keys(PROFILE_CAPABILITIES) as UserProfile[]).flatMap(
    (profile) =>
      PROFILE_CAPABILITIES[profile].map((section) => ({ profile, section })),
  );
}
