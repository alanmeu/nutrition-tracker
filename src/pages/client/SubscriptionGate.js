import React from "react";
import nutriCloudLogo from "../../assets/nutri-cloud-logo.svg";

export default function SubscriptionGate({
  user,
  busy,
  error,
  onSubscribe
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img src={nutriCloudLogo} alt="Nutri Cloud" className="auth-logo" />
        <h1>Abonnement requis</h1>
        <p className="auth-subtitle">
          Bonjour {user?.name || "client"}, la version gratuite reste disponible (blog + calculateurs + menu type). Passe en Pro pour le menu personnalise et toutes les fonctionnalites.
        </p>

        <div className="auth-form">
          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary full-width" type="button" disabled={busy} onClick={() => onSubscribe("premium")}>
            {busy ? "Redirection..." : "Pro - 59€/mois"}
          </button>
        </div>

        <div className="legal-links">
          <a href="/mentions-legales.html" target="_blank" rel="noreferrer">Mentions legales</a>
          <a href="/cgv.html" target="_blank" rel="noreferrer">CGV</a>
          <a href="/politique-confidentialite.html" target="_blank" rel="noreferrer">Confidentialite</a>
          <a href="/politique-remboursement.html" target="_blank" rel="noreferrer">Remboursement</a>
        </div>
      </section>
    </main>
  );
}
