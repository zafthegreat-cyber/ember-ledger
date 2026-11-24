import { lazy, Suspense, useId, useRef, useState } from "react";
import { BINDER_LAYOUTS, binderCells, pocketLabel } from "../utils/binderPage.mjs";
import "./multi-card-scanner.css";

const CardCameraFrame = lazy(() => import("./CardCameraFrame.jsx"));
const loadReader = () => import("../utils/cardPhotoReader.mjs");

// Multi-card scanning (Nov 17 2026). Two ways to fill the card rows below it:
// - Keep scanning: the card-frame camera stays open; every card scanned
//   becomes a row with its name and number filled in.
// - Binder page: one photo of a binder page is split into pockets and each
//   pocket is read as its own card.
// Everything is read on the device. Rows still need a printing check and a
// review before anything is saved.
export default function MultiCardScanner({ onRows }) {
  const id = useId();
  const [mode, setMode] = useState("");
  const [layout, setLayout] = useState("3x3");
  const [status, setStatus] = useState("");
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);

  const rowFrom = (read, extra = {}) => ({
    cardName: read.name || "",
    cardNumber: read.number || "",
    scanNote: read.certainty === "name-and-number" ? "" : read.certainty === "none" ? "Not read: type the details" : read.certainty === "number-only" ? "Name not read" : "Number not read",
    ...extra,
  });

  async function readCamera(file) {
    setStatus("Reading the card…");
    try {
      const { readCardPhoto } = await loadReader();
      const read = await readCardPhoto(file, { framed: true });
      onRows?.([rowFrom(read)]);
      setCount((value) => value + 1);
      setStatus(read.query ? `Added: ${read.query}. Line up the next card.` : "Could not read that card; a blank row was added. Line up the next card.");
    } catch {
      // Nov 24 2026: a failed read no longer leaves "Reading the card…" on screen.
      setStatus("That card could not be read. Line it up again and tap Scan this card.");
    }
  }

  async function readBinder(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const grid = BINDER_LAYOUTS.find((item) => item.key === layout) || BINDER_LAYOUTS[0];
    stopRef.current = false;
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      const cells = binderCells(bitmap.width, bitmap.height, grid);
      const { readCardPhoto } = await loadReader();
      const rows = [];
      for (const cell of cells) {
        if (stopRef.current) break;
        setStatus(`Reading ${pocketLabel(cell).toLowerCase()} (${cell.index + 1} of ${cells.length})…`);
        const canvas = document.createElement("canvas");
        canvas.width = cell.width;
        canvas.height = cell.height;
        canvas.getContext("2d").drawImage(bitmap, cell.x, cell.y, cell.width, cell.height, 0, 0, cell.width, cell.height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        canvas.width = 0;
        if (!blob) continue;
        const read = await readCardPhoto(new File([blob], `pocket-${cell.index + 1}.jpg`, { type: "image/jpeg" }), { framed: true });
        // Empty pockets read as nothing; they are skipped instead of adding blank rows.
        if (read.certainty !== "none") rows.push(rowFrom(read, { pocket: pocketLabel(cell) }));
      }
      bitmap.close?.();
      onRows?.(rows);
      setCount((value) => value + rows.length);
      setStatus(rows.length ? `Added ${rows.length} card${rows.length === 1 ? "" : "s"} from the page. Check each row below.` : "No cards could be read from that photo. Try a straighter, closer photo of the page.");
    } catch {
      setStatus("That photo could not be read. Try another photo of the page.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="multi-card-scanner" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Scan several cards</h3>
    {count ? <p className="multi-card-scanner__count" role="status">{count} card{count === 1 ? "" : "s"} added below this session.</p> : null}
    {mode === "camera" ? <Suspense fallback={<p role="status">Opening the camera…</p>}>
      <CardCameraFrame onCapture={readCamera} onCancel={() => { setMode(""); setStatus(""); }} />
      <p className="multi-card-scanner__status" role="status">{status || "Line up a card in the frame and tap Scan this card. The camera stays open for the next one."}</p>
      <button type="button" className="multi-card-scanner__done" onClick={() => { setMode(""); setStatus(""); }}>Done scanning</button>
    </Suspense> : null}
    {mode === "binder" ? <div className="multi-card-scanner__binder">
      <label htmlFor={`${id}-layout`}>Page layout
        <select id={`${id}-layout`} value={layout} disabled={busy} onChange={(event) => setLayout(event.target.value)}>
          {BINDER_LAYOUTS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select>
      </label>
      <p className="multi-card-scanner__help">Photograph the page straight on so it fills the photo, with the pockets lined up with the edges.</p>
      <div className="multi-card-scanner__pickers">
        <label className="multi-card-scanner__pick">Take photo of page<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={readBinder} /></label>
        <label className="multi-card-scanner__pick">Choose photo<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={readBinder} /></label>
      </div>
      {busy ? <button type="button" className="multi-card-scanner__done" onClick={() => { stopRef.current = true; }}>Stop reading</button> : <button type="button" className="multi-card-scanner__done" onClick={() => { setMode(""); setStatus(""); }}>Close</button>}
      {status ? <p className="multi-card-scanner__status" role="status">{status}</p> : null}
    </div> : null}
    {!mode ? <div className="multi-card-scanner__choices">
      <button type="button" onClick={() => setMode("camera")}><strong>Keep scanning</strong><small>Camera stays open; each card becomes a row</small></button>
      <button type="button" onClick={() => setMode("binder")}><strong>Binder page</strong><small>One photo of a page; each pocket becomes a row</small></button>
    </div> : null}
  </section>;
}
