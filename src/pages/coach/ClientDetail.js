import React from "react";
import GraphWeight from "../../components/GraphWeight";

export default function ClientDetail({ client, onUpdateClient }) {
  return (
    <div>
      <h3>Détails de {client.name}</h3>
      <p>Email : {client.email}</p>
      <p>Objectif : {client.goal || "N/A"}</p>

      <h4>Suivi du poids</h4>
      {client.history && client.history.length > 0 ? (
        <GraphWeight data={client.history} />
      ) : (
        <p>Aucun poids enregistré.</p>
      )}
    </div>
  );
}