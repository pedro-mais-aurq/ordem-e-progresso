import Link from "next/link";
import { SchoolBrand } from "@/src/components/brand/SchoolBrand";
import { InstitutionalEvidence } from "@/src/components/institutional/InstitutionalEvidence";
import { InstitutionalHeader } from "@/src/components/institutional/InstitutionalHeader";
import { withBasePath } from "@/src/config/base-path";
import type { CSSProperties } from "react";

const schoolPrinciples = [
  {
    number: "01",
    title: "Aprendizagem com propósito",
    description: "Uma rotina escolar orientada à formação, à autonomia e ao desenvolvimento de cada estudante.",
  },
  {
    number: "02",
    title: "Comunidade presente",
    description: "Escola, famílias e profissionais conectados por uma comunicação clara e responsável.",
  },
  {
    number: "03",
    title: "Progresso visível",
    description: "Informações acadêmicas organizadas para apoiar decisões pedagógicas mais conscientes.",
  },
];

export default function Home() {
  return (
    <main className="institutional-site">
      <InstitutionalHeader />

      <section
        className="institutional-hero"
        aria-labelledby="hero-title"
        style={{
          "--campus-image": `url("${withBasePath("/assets/escola-campus.webp")}")`,
        } as CSSProperties}
      >
        <div className="institutional-hero__glow" aria-hidden="true" />
        <div className="institutional-container institutional-hero__content">
          <div className="institutional-hero__copy">
            <span className="eyebrow eyebrow--light">
              Educação pública · Belo Horizonte
            </span>
            <h1 id="hero-title">
              Escola Estadual
              <span>Ordem e Progresso</span>
            </h1>
            <p>
              Conhecimento, acompanhamento e comunidade para transformar cada etapa
              da jornada escolar em avanço real.
            </p>
            <div className="institutional-hero__actions">
              <Link className="button button--green" href="/plataforma">
                Acessar plataforma <span aria-hidden="true">↗</span>
              </Link>
              <a className="text-link text-link--light" href="#quem-somos">
                Conheça a escola <span aria-hidden="true">↓</span>
              </a>
            </div>
          </div>

          <aside className="institutional-hero__note" aria-label="Apresentação institucional">
            <span>Ordem + Progresso</span>
            <p>Uma escola que organiza o presente para ampliar possibilidades no futuro.</p>
          </aside>
        </div>

        <div
          className="campus-strip"
          role="img"
          aria-label="Vista do campus da Escola Estadual Ordem e Progresso"
        >
          <span>Nosso espaço, nossa comunidade.</span>
        </div>
      </section>

      <section className="section section--intro" id="quem-somos" aria-labelledby="about-title">
        <div className="institutional-container intro-grid">
          <div>
            <span className="eyebrow">Quem somos</span>
            <h2 id="about-title">Educação que prepara para o mundo.</h2>
          </div>
          <div className="intro-copy">
            <p className="intro-copy__lead">
              A Escola Estadual Ordem e Progresso é um espaço de aprendizagem,
              convivência e formação cidadã.
            </p>
            <p>
              Nossa apresentação digital valoriza uma experiência institucional
              simples e acessível. Informações acadêmicas ficam em um ambiente
              próprio, criado para apoiar professores, estudantes e coordenação.
            </p>
            <a className="text-link" href="#escola">
              Nossa proposta <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>
      </section>

      <InstitutionalEvidence />

      <section className="section section--principles" id="escola" aria-labelledby="school-title">
        <div className="institutional-container">
          <div className="section-heading">
            <span className="eyebrow eyebrow--green">A escola</span>
            <h2 id="school-title">Princípios que acompanham cada trajetória.</h2>
            <p>
              Uma base institucional clara, acolhedora e comprometida com a evolução
              contínua da comunidade escolar.
            </p>
          </div>

          <div className="principles-grid">
            {schoolPrinciples.map((principle) => (
              <article className="principle-card" key={principle.number}>
                <span>{principle.number}</span>
                <div>
                  <h3>{principle.title}</h3>
                  <p>{principle.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section platform-presentation" id="plataforma-ordem" aria-labelledby="platform-title">
        <div className="institutional-container platform-presentation__grid">
          <div className="platform-presentation__visual" aria-hidden="true">
            <div className="visual-orbit visual-orbit--one" />
            <div className="visual-orbit visual-orbit--two" />
            <SchoolBrand context="platform" theme="dark" className="visual-brand" />
          </div>
          <div className="platform-presentation__copy">
            <span className="eyebrow eyebrow--light">Plataforma Ordem</span>
            <h2 id="platform-title">Informação acadêmica que gera ação.</h2>
            <p>
              Um ambiente desenvolvido para simplificar o acompanhamento escolar e
              transformar dados em informação útil para professores, estudantes e
              coordenação.
            </p>
            <ul className="platform-features" aria-label="Recursos da fundação da plataforma">
              <li><span>✓</span> Acesso demonstrativo por perfil</li>
              <li><span>✓</span> Dados acadêmicos fictícios e locais</li>
              <li><span>✓</span> Experiência responsiva e acessível</li>
            </ul>
            <Link className="button button--white" href="/plataforma">
              Entrar na plataforma <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </section>

      <section className="section section--contact" id="contato" aria-labelledby="contact-title">
        <div className="institutional-container contact-card">
          <div className="contact-card__heading">
            <span className="eyebrow">Contato institucional</span>
            <h2 id="contact-title">A escola mais perto da comunidade.</h2>
            <p>
              Canais preparados para apresentar a estrutura de atendimento da escola
              nesta demonstração institucional.
            </p>
            <p className="contact-card__warning">
              <strong>Dados demonstrativos</strong> — estes canais não representam os
              contatos oficiais da instituição.
            </p>
          </div>

          <div className="contact-grid">
            <article className="contact-item">
              <span>Telefone</span>
              <strong>(31) 3257-7148</strong>
            </article>
            <article className="contact-item">
              <span>E-mail</span>
              <strong>atendimento@ordemeprogresso.example</strong>
            </article>
            <article className="contact-item">
              <span>Endereço</span>
              <address> R. Oscár Negrão de Lima, 29 - Nova Gameleira <br />Belo Horizonte — MG</address>
            </article>
            <article className="contact-item">
              <span>Atendimento</span>
              <strong>Segunda a sexta<br />7h às 17h</strong>
            </article>
          </div>

          <Link className="button button--blue contact-card__action" href="/plataforma">
            Acessar ambiente acadêmico <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>

      <footer className="institutional-footer">
        <div className="institutional-container institutional-footer__content">
          <div className="brand brand--footer">
            <SchoolBrand theme="dark" />
          </div>
          <p>Protótipo institucional · Todos os dados acadêmicos são fictícios.</p>
          <a href="#inicio">Voltar ao topo ↑</a>
        </div>
      </footer>
    </main>
  );
}
