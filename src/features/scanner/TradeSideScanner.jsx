import { lazy, Suspense, useState } from "react";
import BarcodeScanner from "../../components/BarcodeScanner.jsx";
import { tradeSideSummary } from "../../utils/scannerExtras.mjs";
import "./scanner-extras.css";

const ProductPhotoLookup = lazy(() => import("../../components/ProductPhotoLookup.jsx"));

// Trade mode (Nov 19 2026): build one side of a trade by scanning cards and
// barcodes or searching by name. Each line carries a market value you can edit;
// the side's total feeds the Trade Compass reading. Nothing is saved here.

let lineId = 0;
const nextLineId = () => `trade-line-${Date.now()}-${(lineId += 1)}`;

export default function TradeSideScanner({ label, lines, onLines, searchCatalog, money }) {
  const [mode, setMode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState("");
  const summary = tradeSideSummary(lines);

  async function runSearch(value) {
    const text = String(value || "").trim();
    if (!text) return;
    setQuery(text);
    setMode("");
    setStatus("Searching…");
    try {
      const found = await searchCatalog(text);
      setResults(found);
      setStatus(found.length ? "Pick the match, or add it as typed." : "No match. Add it as typed and type its value.");
    } catch {
      setResults([]);
      setStatus("Search is unavailable. Add it as typed.");
    }
  }

  function addLine(line) {
    onLines([...lines, { id: nextLineId(), quantity: 1, ...line }]);
    setResults([]);
    setQuery("");
    setStatus(`Added ${line.name}.`);
    try { navigator.vibrate?.(30); } catch { /* Optional feedback. */ }
  }

  const update = (id, patch) => onLines(lines.map((line) => (line.id === id ? { ...line, ...patch } : line)));

  return (
    <div className="trade-scan" aria-label={`${label} items`}>
      <div className="trade-scan__total">
        <span>{summary.count} item{summary.count === 1 ? "" : "s"}</span>
        <strong>{money(summary.total)}</strong>
      </div>
      {lines.length ? (
        <ul className="trade-scan__lines">
          {lines.map((line) => (
            <li key={line.id}>
              <div className="trade-scan__name">
                <strong>{line.name}</strong>
                {line.detail ? <small>{line.detail}</small> : null}
              </div>
              <label className="trade-scan__value">
                <span className="sr-only">Value each for {line.name}</span>
                <input inputMode="decimal" value={line.value ?? ""} placeholder="Value" onChange={(event) => update(line.id, { value: event.target.value })} />
              </label>
              <div className="scanner-batch__count" role="group" aria-label={`Quantity for ${line.name}`}>
                <button type="button" aria-label="One less" onClick={() => (Number(line.quantity) <= 1 ? onLines(lines.filter((entry) => entry.id !== line.id)) : update(line.id, { quantity: Number(line.quantity) - 1 }))}>−</button>
                <span>{line.quantity}</span>
                <button type="button" aria-label="One more" onClick={() => update(line.id, { quantity: Number(line.quantity) + 1 })}>+</button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {summary.missing ? <p className="trade-scan__note">{summary.missing} item{summary.missing === 1 ? " has" : "s have"} no value yet, so the total is low.</p> : null}

      <div className="trade-scan__add">
        <button type="button" className="secondary-button" aria-pressed={mode === "card"} onClick={() => setMode(mode === "card" ? "" : "card")}>Scan a card</button>
        <button type="button" className="secondary-button" aria-pressed={mode === "barcode"} onClick={() => setMode(mode === "barcode" ? "" : "barcode")}>Scan a barcode</button>
      </div>
      {mode === "card" ? (
        <Suspense fallback={<p role="status">Opening the card reader…</p>}>
          <ProductPhotoLookup key={`trade-card-${label}`} kind="card" onQuery={runSearch} />
        </Suspense>
      ) : null}
      {mode === "barcode" ? (
        <BarcodeScanner title="Scan a barcode" readyLabel="Camera on. Looking for a barcode…" manualLabel="Close camera" onScan={runSearch} onClose={() => setMode("")} />
      ) : null}
      {/* Not a <form>: this sits inside the Trade Compass form, and forms cannot nest. */}
      <div className="trade-scan__search" role="search">
        <label>
          <span className="sr-only">Search {label}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void runSearch(query); } }}
            placeholder="Or type a name, number or barcode"
          />
        </label>
        <button type="button" className="secondary-button" onClick={() => void runSearch(query)}>Search</button>
      </div>
      {status ? <p className="trade-scan__note" role="status">{status}</p> : null}
      {results.length || query ? (
        <ul className="trade-scan__results">
          {results.map((result) => (
            <li key={result.id}>
              <button type="button" onClick={() => addLine({ name: result.name, detail: result.detail, value: result.value || "", catalogItemId: result.id })}>
                <strong>{result.name}</strong>
                <small>{[result.detail, result.value ? money(result.value) : "No price"].filter(Boolean).join(" · ")}</small>
              </button>
            </li>
          ))}
          {query ? (
            <li>
              <button type="button" onClick={() => addLine({ name: query, value: "" })}>
                <strong>Add “{query}” as typed</strong>
                <small>Type its value after</small>
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
