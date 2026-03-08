import React, { useState, useEffect } from "react";
import { jsPDF } from "jspdf";
import Chart from "chart.js/auto";
import { addPdfBranding } from "../../utils/pdfBranding";

export default function PDFListClient({ user }) {
  const [pdfs, setPdfs] = useState(user.pdfs || []);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("userData"));
    if (storedUser) setPdfs(storedUser.pdfs || []);
  }, []);

  const handleDownload = async (pdf) => {
    const doc = new jsPDF();
    const contentStartY = await addPdfBranding(doc);
    const offset = contentStartY - 20;
    doc.setFontSize(16);
    doc.text(`Bilan Coach - ${user.name}`, 10, 20 + offset);
    doc.setFontSize(12);
    doc.text(`Date : ${pdf.date}`, 10, 30 + offset);
    doc.text(`Message : ${pdf.message}`, 10, 40 + offset);

    if (pdf.bilan) {
      doc.text(`BMR : ${pdf.bilan.bmr} kcal`, 10, 50 + offset);
      doc.text(`TDEE : ${pdf.bilan.tdee} kcal`, 10, 60 + offset);
      doc.text(`Calories déficit : ${pdf.bilan.deficitCalories} kcal`, 10, 70 + offset);
      doc.text(
        `Macros : Proteines ${pdf.bilan.macros.protein}g / Lipides ${pdf.bilan.macros.fat}g / Glucides ${pdf.bilan.macros.carbs}g`,
        10,
        80 + offset
      );
    }

    // Générer un petit graphique du poids si disponible
    if (user.history && user.history.length > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = 400;
      canvas.height = 200;
      const ctx = canvas.getContext("2d");

      new Chart(ctx, {
        type: "line",
        data: {
          labels: user.history.map(h => h.date),
          datasets: [{
            label: "Poids (kg)",
            data: user.history.map(h => h.weight),
            borderColor: "#3b5d3b",
            backgroundColor: "rgba(59,93,59,0.2)",
            tension: 0.3
          }]
        },
        options: { responsive: false, plugins: { legend: { display: false } } }
      });

      const imgData = canvas.toDataURL("image/png");
      doc.addImage(imgData, "PNG", 10, 90 + offset, 180, 90);
    }

    doc.save(`bilan_${pdf.date}.pdf`);
  };

  return (
    <div className="container">
      <h2>Mes PDF envoyés par le coach</h2>
      {pdfs.length === 0 && <p>Aucun PDF reçu.</p>}
      <ul>
        {pdfs.map((pdf, idx) => (
          <li key={idx} className="card">
            <p><strong>Date :</strong> {pdf.date}</p>
            <p>{pdf.message}</p>
            <button className="primary" onClick={() => handleDownload(pdf)}>Télécharger PDF</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
