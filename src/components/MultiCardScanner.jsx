import { lazy, Suspense, useEffect, useId, useRef, useState } from "react";
import { BINDER_LAYOUTS, binderCells, pocketLabel } from "../utils/binderPage.mjs";
import { lastScanSummary, sameSlabListed } from "../utils/cardScanRows.mjs";
import { isCardScanGraded } from "../utils/cardScanDetails.mjs";
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
// autoStart (Nov 25 2026): open the camera straight away, one less tap.
// Nov 25 2026 (owner: "continuous scanner improvement"): the camera no longer waits
// for a card to be read. Each picture joins a line and is read in the background, so
// the next card can be shown at once. A card that could not be read adds nothing and
// gets one more automatic try. The last card shows right under the camera with its
// price and an Undo button. rows: the list below (to show the last card's match).
// Nov 27 2026: when the list offers one card for the last scan ("Is this your card?"),
// the question and a Yes button show here too, so nobody has to scroll down mid-scan.
// onPick(row, choice) files that card, the same as tapping it in the list.
function buzz(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* Optional feedback. */ }
}
const scanKey = (name, number) => `${String(name || "").trim().toLowerCase()}|${String(number || "").trim().toLowerCase()}`;

export default function MultiCardScanner({ onRows, autoStart = false, rows = [], onUndo, onPick, money }) {
  const id = useId();
  const [mode, setMode] = useState(autoStart ? "camera" : "");
  const [layout, setLayout] = useState("3x3");
  const [status, setStatus] = useState("");
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const stopRef = useRef(false);
  const [pending, setPending] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [last, setLast] = useState(null); // { cardName, cardNumber } of the newest card
  const queueRef = useRef([]);
  const runningRef = useRef(false);
  const seqRef = useRef(0);
  const retryNextRef = useRef(false);
  const lastKeyRef = useRef(""); // the newest card read, to tell a drifted card from a new one
  const aliveRef = useRef(true);
  const onRowsRef = useRef(onRows);
  const rowsRef = useRef(rows);
  useEffect(() => { onRowsRef.current = onRows; rowsRef.current = rows; });
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false; queueRef.current = []; }; }, []);
  // Load the reader while the first card is being lined up, so the first read is not the slow one.
  useEffect(() => { if (mode === "camera") loadReader().then((module) => module.warmCardReader?.()).catch(() => {}); }, [mode]);

  const rowFrom = (read, extra = {}) => ({
    cardName: read.name || "",
    cardNumber: read.number || "",
    scanNote: read.certainty === "name-and-number" ? "" : read.certainty === "none" ? "Not read: type the details" : read.certainty === "number-only" ? "Name not read" : "Number not read",
    // Nov 26 2026: what else was read from the card (year, HP, attack names, pieces of the
    // number), so the list can still match a card whose number is hidden. Letters only, kept short.
    scanClues: read.clues && typeof read.clues === "object" ? read.clues : null,
    scanText: String(read.text || "").toLowerCase().replace(/[^a-zà-ž]+/g, " ").trim().slice(0, 2500),
    // Nov 27 2026: a slab's label gave its grader, grade and certificate (the row's grading button shows them).
    ...(read.gradedSlab ? { graded: true, gradingCompany: read.gradedSlab.gradingCompany || "", grade: read.gradedSlab.grade || "", certificationNumber: read.gradedSlab.certificationNumber || "" } : {}),
    ...extra,
  });

  // The camera hands over the picture and is free again straight away.
  function readCamera(file, { sameCardGuard = false } = {}) {
    seqRef.current += 1;
    queueRef.current.push({ file, seq: seqRef.current, isRetry: retryNextRef.current, sameCardGuard });
    retryNextRef.current = false;
    setPending(queueRef.current.length + (runningRef.current ? 1 : 0));
    setStatus("");
    void readQueue();
  }

  async function readQueue() {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const { readCardPhoto } = await loadReader();
      while (queueRef.current.length && aliveRef.current) {
        const job = queueRef.current.shift();
        let read = null;
        try { read = await readCardPhoto(job.file, { framed: true }); } catch { read = null; }
        if (!aliveRef.current) return;
        setPending(queueRef.current.length);
        if (read?.certainty && read.certainty !== "none") {
          const row = rowFrom(read, { scanned: true });
          const key = scanKey(row.cardName, row.cardNumber);
          // The picture followed only a small change in view and reads as the card
          // just added: it is that card again (the hand drifted), not another copy.
          if (job.sameCardGuard && key === lastKeyRef.current) { setStatus(row.graded ? "That's the same slab." : "That's the same card. Have another copy? Tap One more."); continue; }
          // A certificate number is one slab: shown again, it is not a second copy.
          if (sameSlabListed(rowsRef.current, row)) { setStatus("That slab is already in the list."); continue; }
          lastKeyRef.current = key;
          onRowsRef.current?.([row]);
          setLast({ cardName: row.cardName, cardNumber: row.cardNumber });
          setCount((value) => value + 1);
          buzz([30, 50, 30]);
          setStatus("");
        } else {
          buzz(220);
          // Only the newest picture is tried again, and only once, so a card that
          // cannot be read does not loop.
          const canRetry = job.seq === seqRef.current && !job.isRetry;
          if (canRetry) { retryNextRef.current = true; setRetryKey((value) => value + 1); }
          setStatus(canRetry
            ? "Couldn't read that one. Hold it still, a little closer: trying once more."
            : "Still couldn't read that card. Try brighter light, or add it by hand below.");
        }
      }
    } catch {
      queueRef.current = [];
      if (aliveRef.current) { setPending(0); setStatus("The card reader could not start. Check your connection and try again."); }
    } finally {
      runningRef.current = false;
    }
  }

  const lastRow = last ? [...rows].reverse().find((row) => scanKey(row.cardName, row.cardNumber) === scanKey(last.cardName, last.cardNumber)) : null;
  const lastQuantity = Math.max(1, Number(lastRow?.quantity) || 1);
  // One card offered: the question and Yes show here. Two or more are picked in the list.
  const { matched: lastMatched, offer: lastOffer, detail: lastDetail, name: lastName, title: lastTitle } = lastScanSummary(lastRow, { canPick: Boolean(onPick) });
  const reading = pending > 0 ? <p className="multi-card-scanner__pending" role="status">Reading {pending === 1 ? "1 card" : `${pending} cards`}…</p> : null;
  const lastCard = lastRow ? <div className="multi-card-scanner__last" role="status">
    <div>
      <small>{lastQuantity > 1 ? `Same card again: you now have ${lastQuantity}` : "Just scanned"}</small>
      <strong>{lastTitle}{lastQuantity > 1 ? ` ×${lastQuantity}` : ""}</strong>
      <span>{lastDetail}{lastMatched && lastRow.matchedValue && money ? <b className="multi-card-scanner__price"> · {money(lastRow.matchedValue)}{lastQuantity > 1 ? " each" : ""}</b> : null}{lastOffer?.value && money ? <b className="multi-card-scanner__price"> · {money(lastOffer.value)}</b> : null}</span>
    </div>
    <div className="multi-card-scanner__last-actions">
      {/* While the card is in question, Yes takes the place of One more: a copy is added once the card is known. */}
      {/* A slab is one of a kind (its own certificate), so it has no One more. */}
      {lastOffer
        ? <button type="button" className="multi-card-scanner__yes" aria-label={`Yes, this is ${lastOffer.name || "my card"}`} onClick={() => { onPick(lastRow, lastOffer); buzz(30); setStatus(""); }}>Yes</button>
        : isCardScanGraded(lastRow) ? null : <button type="button" aria-label={`One more copy of ${lastName || "this card"}`} onClick={() => { onRowsRef.current?.([{ cardName: lastRow.cardName, cardNumber: lastRow.cardNumber, scanNote: "", scanned: true }]); setCount((value) => value + 1); setStatus(""); }}>One more</button>}
      {onUndo ? <button type="button" onClick={() => { onUndo(last); if (lastQuantity <= 1) setLast(null); setCount((value) => Math.max(0, value - 1)); setStatus("Removed that scan."); }}>Undo</button> : null}
    </div>
  </div> : null;

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
    <h3 id={`${id}-title`}>Scan with your camera</h3>
    {count ? <p className="multi-card-scanner__count" role="status">{count} card{count === 1 ? "" : "s"} scanned. They are listed below.</p> : null}
    {mode === "camera" ? <Suspense fallback={<p role="status">Opening the camera…</p>}>
      <CardCameraFrame continuous retryKey={retryKey} onCapture={readCamera} onCancel={() => { setMode(""); setStatus(""); }} below={lastCard || reading ? <>{lastCard}{reading}</> : null} />
      {status ? <p className="multi-card-scanner__status" role="status">{status}</p> : null}
      <button type="button" className="multi-card-scanner__done" onClick={() => { setMode(""); setStatus(""); }}>Done scanning</button>
    </Suspense> : null}
    {mode !== "camera" ? reading : null}
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
      <button type="button" className="multi-card-scanner__start" onClick={() => setMode("camera")}><strong>Start scanning</strong><small>Show your cards to the camera one at a time</small></button>
      <button type="button" onClick={() => setMode("binder")}><strong>Scan a binder page</strong><small>One photo reads every card on the page</small></button>
    </div> : null}
  </section>;
}
