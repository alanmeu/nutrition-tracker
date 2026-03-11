import logoUrl from "../assets/brand-mark-v3.svg";

let logoPngDataUrlPromise = null;

async function getLogoPngDataUrl() {
  if (logoPngDataUrlPromise) return logoPngDataUrlPromise;

  logoPngDataUrlPromise = new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas context unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Failed to load logo"));
    img.src = logoUrl;
  });

  return logoPngDataUrlPromise;
}

export async function addPdfBranding(doc) {
  try {
    const image = await getLogoPngDataUrl();
    doc.addImage(image, "PNG", 14, 8, 20, 20);
    doc.setFontSize(18);
    doc.setTextColor(30, 62, 48);
    doc.text("Nutri Cloud", 39, 17);
    doc.setFontSize(10);
    doc.setTextColor(103, 123, 109);
    doc.text("Bilan nutritionnel", 39, 24);
  } catch {
    doc.setFontSize(16);
    doc.setTextColor(15, 33, 54);
    doc.text("Nutri Cloud", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(94, 110, 132);
    doc.text("Rapport nutritionnel", 14, 24);
  }

  doc.setDrawColor(219, 230, 240);
  doc.line(14, 34, 196, 34);
  doc.setTextColor(20, 20, 20);
  return 42;
}
