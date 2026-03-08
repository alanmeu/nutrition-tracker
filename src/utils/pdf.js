import jsPDF from "jspdf";
import { addPdfBranding } from "./pdfBranding";

export async function generatePDF(clientName, history) {
  const doc = new jsPDF();
  const contentStartY = await addPdfBranding(doc);
  doc.setFontSize(18);
  doc.text(`Suivi de ${clientName}`, 10, contentStartY);

  let y = contentStartY + 10;
  history.forEach((entry) => {
    doc.text(`${entry.date} : ${entry.weight} kg`, 10, y);
    y += 10;
  });

  doc.save("suivi.pdf");
}
