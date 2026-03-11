import React, { useState } from "react";
import { signIn, signUp } from "../services";
import nutriCloudLogo from "../assets/nutri-cloud-logo.svg";

export default function Login({ busy, onError, onSuccess, error }) {
  const [mode, setMode] = useState("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [info, setInfo] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    onError("");
    setInfo("");

    try {
      if (mode === "signin") {
        await signIn({ email: email.trim(), password });
        await onSuccess();
        return;
      }

      const data = await signUp({
        email: email.trim(),
        password,
        name: name.trim(),
        role: "client"
      });

      if (data.session) {
        await onSuccess();
      } else {
        setInfo("Compte cree. Verifie ton email pour confirmer la connexion.");
      }
    } catch (err) {
      onError(err.message || "Erreur de connexion.");
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand-row">
          <img src={nutriCloudLogo} alt="Nutri Cloud" className="auth-logo" />
          <div className="auth-brand-text">
            <strong className="auth-brand-name">Nutri Cloud</strong>
            <span className="auth-brand-tagline">Coaching nutrition moderne</span>
          </div>
        </div>
        <h1>{mode === "signin" ? "Connexion" : "Inscription"}</h1>
        <p className="auth-subtitle">Plateforme moderne de coaching nutrition.</p>

        <div className="mode-switch">
          <button
            type="button"
            className={mode === "signin" ? "switch-active" : "switch-idle"}
            onClick={() => setMode("signin")}
          >
            Se connecter
          </button>
          <button
            type="button"
            className={mode === "signup" ? "switch-active" : "switch-idle"}
            onClick={() => setMode("signup")}
          >
            Creer un compte
          </button>
        </div>

        <form onSubmit={submit} className="auth-form">
          {mode === "signup" ? (
            <>
              <label>
                Nom
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Ton nom"
                  required
                />
              </label>
            </>
          ) : null}

          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="toi@email.com"
              required
            />
          </label>

          <label>
            Mot de passe
            <input
              type="password"
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="minimum 6 caracteres"
              required
            />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          {info ? <p className="info-text">{info}</p> : null}

          <button className="primary full-width" type="submit" disabled={busy}>
            {busy ? "Traitement..." : mode === "signin" ? "Connexion" : "Inscription"}
          </button>
        </form>

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
