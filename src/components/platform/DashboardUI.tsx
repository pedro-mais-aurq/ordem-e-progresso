import Link from "next/link";
import {
  getProfileSections,
  SECTION_DEFINITIONS,
} from "@/src/config/profile-capabilities";
import type { UserProfile } from "@/src/types/academic";

export function DashboardHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header className="dashboard-heading">
      <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      <div className="dashboard-heading__date"><small>Ano letivo</small><strong>2026</strong></div>
    </header>
  );
}

export function StatsGrid({ items }: { items: Array<{ label: string; value: number | string; detail: string; accent?: "green" | "blue" | "amber" }> }) {
  return (
    <section className="stats-grid" aria-label="Resumo acadêmico">
      {items.map((item) => (
        <article className={`stat-card stat-card--${item.accent ?? "blue"}`} key={item.label}>
          <div className="stat-card__icon" aria-hidden="true">{item.label.slice(0, 1)}</div>
          <div><span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div>
        </article>
      ))}
    </section>
  );
}

export function QuickAccess({ profile }: { profile: UserProfile }) {
  const sections = getProfileSections(profile);

  return (
    <section className="dashboard-section" aria-labelledby="quick-access-title">
      <div className="dashboard-section__heading"><div><span>Atalhos</span><h2 id="quick-access-title">Acesso rápido</h2></div><small>{sections.length} recursos</small></div>
      <div className="quick-grid">
        {sections.map((section) => {
          const definition = SECTION_DEFINITIONS[section];
          return (
            <Link href={`/plataforma/${profile}/${section}`} key={section}>
              <div><strong>{definition.label}</strong><span>{definition.quickDetail}</span></div><b aria-hidden="true">→</b>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export function AcademicCoreNotice() {
  return (
    <aside className="foundation-notice">
      <span aria-hidden="true">i</span>
      <div>
        <strong>P2 — Academic Core ativo</strong>
        <p>
          Notas, médias, pendências e indicadores são calculados a partir do
          mesmo dataset local para professor, coordenação e aluno.
        </p>
      </div>
    </aside>
  );
}
