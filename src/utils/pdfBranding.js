import logoUrl from "../assets/nutri-cloud-logo.svg";

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
    doc.addImage(image, "PNG", 14, 8, 86, 24);
  } catch {
    doc.setFontSize(16);
    doc.setTextColor(15, 33, 54);
    doc.text("Nutri Cloud", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(94, 110, 132);
    doc.text("Rapport nutritionnel", 14, 24);
  }

  doc.setDrawColor(219, 230, 240);
  doc.line(14, 36, 196, 36);
  doc.setTextColor(20, 20, 20);
  return 44;
}
