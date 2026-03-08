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
          Bonjour {user?.name || "client"}, active ton abonnement pour acceder a ton suivi nutrition complet.
        </p>

        <div className="auth-form">
          {error ? <p className="error-text">{error}</p> : null}

          <button className="primary full-width" type="button" disabled={busy} onClick={() => onSubscribe("essential")}>
            {busy ? "Redirection..." : "Essentiel - 29€/mois (1 visio 60 min)"}
          </button>
          <button className="primary full-width" type="button" disabled={busy} onClick={() => onSubscribe("premium")}>
            {busy ? "Redirection..." : "Premium - 79€/mois (4 visios + WhatsApp)"}
          </button>
        </div>
      </section>
    </main>
  );
}
