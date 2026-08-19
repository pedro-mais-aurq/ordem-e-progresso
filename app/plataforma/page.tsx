import Link from "next/link";
import { SchoolBrand } from "@/src/components/brand/SchoolBrand";

const profiles = [
  { slug: "professor", label: "Professor", initials: "PR", description: "Turmas, avaliações e preparação do lançamento de notas.", color: "blue" },
  { slug: "coordenacao", label: "Coordenação", initials: "CO", description: "Visão geral da estrutura acadêmica e acompanhamento escolar.", color: "green" },
  { slug: "aluno", label: "Aluno", initials: "AL", description: "Identificação acadêmica e acesso demonstrativo do estudante.", color: "amber" },
];

export default function PlatformEntryPage() {
  return (
    <main className="profile-entry">
      <div className="profile-entry__bar">
        <Link className="platform-brand platform-brand--entry" href="/">
          <SchoolBrand context="platform" />
        </Link>
        <Link className="back-to-site" href="/">← Voltar ao site</Link>
      </div>

      <section className="profile-entry__content" aria-labelledby="profile-title">
        <div className="profile-entry__heading">
          <span className="profile-entry__kicker">Ambiente acadêmico demonstrativo</span>
          <h1 id="profile-title">Como você quer acessar?</h1>
          <p>Selecione um perfil para conhecer a fundação da Plataforma de Progresso.</p>
        </div>

        <div className="profile-grid">
          {profiles.map((profile) => (
            <Link className={`profile-card profile-card--${profile.color}`} href={`/plataforma/${profile.slug}`} key={profile.slug}>
              <span className="profile-card__badge" aria-hidden="true">{profile.initials}</span>
              <div><h2>{profile.label}</h2><p>{profile.description}</p></div>
              <b aria-hidden="true">→</b>
            </Link>
          ))}
        </div>

        <p className="profile-entry__disclaimer">
          <span aria-hidden="true">●</span> Sem login nesta fase · todos os dados são fictícios e ficam neste dispositivo
        </p>
      </section>
    </main>
  );
}
