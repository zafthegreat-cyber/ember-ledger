// Receipt PDFs (Nov 19 2026): read a receipt PDF on this device.
// Most emailed or downloaded receipts carry real text, so that is read first.
// A scanned PDF (pictures only) is drawn page by page and read like a photo.
// Nothing leaves the device; the person checks every line before saving.

export const RECEIPT_PDF_LIMITS = { maxBytes: 20 * 1024 * 1024, maxPages: 4, renderWidth: 1600 };

/** Groups pdf.js text items into reading-order lines (top to bottom, left to right). */
export function pdfTextItemsToLines(items = []) {
  const rows = [];
  for (const item of items) {
    const text = String(item?.str ?? "");
    if (!text.trim()) continue;
    const x = Number(item.transform?.[4]) || 0;
    const y = Number(item.transform?.[5]) || 0;
    const size = Math.abs(Number(item.transform?.[3])) || Number(item.height) || 10;
    const row = rows.find((candidate) => Math.abs(candidate.y - y) <= Math.max(2, size * 0.4));
    if (row) row.parts.push({ x, text });
    else rows.push({ y, parts: [{ x, text }] });
  }
  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text.trim()).join(" ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 2);
}

export function countPricedLines(text = "") {
  return String(text).split("\n").filter((line) => /\d+[.,]\d{2}\b/.test(line)).length;
}

function finish(text, source) {
  const clean = String(text || "").slice(0, 20_000);
  const priced = countPricedLines(clean);
  const how = source === "text" ? "from the PDF" : "from the scanned PDF";
  return {
    status: priced ? "complete" : "low_confidence",
    code: "receipt_pdf_read",
    source,
    text: clean,
    message: priced
      ? `Read ${priced} priced line${priced === 1 ? "" : "s"} ${how}. Check them below before reviewing.`
      : "Could not find prices in this PDF. Type or paste the receipt lines below.",
  };
}

async function loadPdfjs() {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.min.mjs"),
    import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

function pageToPngFile(canvas, index) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(new File([blob], `receipt-page-${index}.png`, { type: "image/png" })) : reject(new Error("render_failed"))), "image/png");
  });
}

/**
 * Reads a receipt PDF. `readPhoto` is the on-device photo reader, used only
 * for pages that have no text (scanned receipts).
 */
export async function readReceiptPdf(file, { readPhoto, signal } = {}) {
  if (!file || String(file.type).toLowerCase() !== "application/pdf") return { status: "invalid", code: "file_invalid", text: "", message: "Choose a PDF receipt." };
  if (!Number.isFinite(file.size) || file.size <= 0) return { status: "invalid", code: "file_invalid", text: "", message: "That PDF is empty. Choose another file." };
  if (file.size > RECEIPT_PDF_LIMITS.maxBytes) return { status: "invalid", code: "file_invalid", text: "", message: "Choose a PDF no larger than 20 MB, or type the lines below." };
  let doc;
  try {
    const pdfjs = await loadPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    doc = await pdfjs.getDocument({ data, isEvalSupported: false, disableFontFace: true }).promise;
    const pageCount = Math.min(doc.numPages, RECEIPT_PDF_LIMITS.maxPages);
    const textLines = [];
    for (let index = 1; index <= pageCount; index += 1) {
      if (signal?.aborted) return { status: "cancelled", code: "cancelled", text: "", message: "Reading stopped. Type the receipt lines below." };
      const page = await doc.getPage(index);
      const content = await page.getTextContent();
      textLines.push(...pdfTextItemsToLines(content.items));
      page.cleanup();
    }
    if (textLines.length >= 2) return finish(textLines.join("\n"), "text");
    if (typeof readPhoto !== "function" || typeof document === "undefined") return finish("", "text");

    // No text layer: draw each page and read it like a photo.
    const pageTexts = [];
    for (let index = 1; index <= pageCount; index += 1) {
      if (signal?.aborted) return { status: "cancelled", code: "cancelled", text: "", message: "Reading stopped. Type the receipt lines below." };
      const page = await doc.getPage(index);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: Math.min(4, RECEIPT_PDF_LIMITS.renderWidth / Math.max(1, base.width)) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, canvas, viewport }).promise;
      const png = await pageToPngFile(canvas, index);
      canvas.width = 0;
      page.cleanup();
      const read = await readPhoto(png, { signal });
      if (read?.text) pageTexts.push(read.text);
    }
    return finish(pageTexts.join("\n"), "scan");
  } catch {
    return { status: "failed", code: "pdf_failed", text: "", message: "This PDF could not be read automatically. Type or paste the receipt lines below." };
  } finally {
    doc?.destroy?.();
  }
}
