import { INSTITUTIONAL_EVIDENCE } from "@/src/config/institutional-evidence";

export function InstitutionalEvidence() {
  const evidence = INSTITUTIONAL_EVIDENCE;

  return (
    <section
      className="section institutional-evidence"
      id="resultados"
      aria-labelledby="evidence-title"
    >
      <div className="institutional-container">
        <header className="evidence-heading">
          <span className="eyebrow eyebrow--green">Prova de valor</span>
          <h2 id="evidence-title">{evidence.title}</h2>
          <p>{evidence.subtitle}</p>
        </header>

        <div className="evidence-grid">
          <article className="evidence-card evidence-card--community">
            <header className="evidence-card__header">
              <span>{evidence.community.category}</span>
              <strong>{evidence.community.source}</strong>
            </header>
            <div className="evidence-card__lead">
              <h3>{evidence.community.position}</h3>
              <p>{evidence.community.context}</p>
            </div>
            <div className="evidence-card__primary-stat">
              <span>{evidence.community.publicationAverageLabel}</span>
              <strong>{evidence.community.publicationAverage}</strong>
            </div>
            <div className="evidence-card__review-summary">
              <strong>{evidence.community.reviews}</strong>
              <span>Média detalhada: {evidence.community.detailedAverage}</span>
            </div>
            <dl className="evidence-metrics">
              {evidence.community.metrics.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.label}</dt>
                  <dd>{metric.value}</dd>
                </div>
              ))}
            </dl>
            <p className="evidence-card__notice">{evidence.community.disclaimer}</p>
          </article>

          <article className="evidence-card evidence-card--academic">
            <header className="evidence-card__header">
              <span>{evidence.academic.category}</span>
              <strong>{evidence.academic.title}</strong>
            </header>
            <div className="evidence-card__lead">
              <span className="evidence-card__badge">{evidence.academic.badge}</span>
              <h3>{evidence.academic.position}</h3>
              <p>{evidence.academic.context}</p>
            </div>
            <dl className="evidence-academic-stats">
              <div>
                <dt>{evidence.academic.generalAverageLabel}</dt>
                <dd>{evidence.academic.generalAverage}</dd>
              </div>
              <div>
                <dt>{evidence.academic.essayAverageLabel}</dt>
                <dd>{evidence.academic.essayAverage}</dd>
              </div>
            </dl>
            <div className="evidence-card__source">
              <strong>Fonte: {evidence.academic.source}</strong>
              <p>{evidence.academic.provenance}</p>
            </div>
          </article>
        </div>

        <p className="evidence-sources">{evidence.sources}</p>
      </div>
    </section>
  );
}
