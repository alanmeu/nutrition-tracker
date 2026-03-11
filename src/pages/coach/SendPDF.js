import React, { useState } from "react";
import { generatePDF } from "../../utils/pdf";

export default function SendPDF({ client, onUpdateClient }) {
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");

  const handleSend = async () => {
    // Générer un PDF simple avec le message du coach
    const pdfContent = [{ date: new Date().toLocaleDateString(), weight: message }];
    await generatePDF(client.name, pdfContent);

    // Ajouter le PDF au client dans localStorage
    const updatedClient = { ...client, pdfs: [...(client.pdfs || []), { message, date: new Date().toLocaleDateString() }] };
    onUpdateClient(updatedClient);
    setMessage("");
    setStatus("PDF envoye.");
  };

  return (
    <div style={{ marginTop: 20 }}>
      <h4>Envoyer un PDF au client</h4>
      {status ? <p style={{ color: "#236d7d", margin: "0 0 8px" }}>{status}</p> : null}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Message ou plan nutritionnel"
        style={{ width: "100%", height: 60 }}
      />
      <button onClick={handleSend} style={{ marginTop: 5 }}>Envoyer PDF</button>
    </div>
  );
}
