import { useEffect, useId, useRef, useState } from "react";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";
import { extractScoutScreenshotText, validateScoutScreenshotFile } from "../utils/scoutScreenshotOcr.mjs";
import { createStockScreenshotPatch, parseStockScreenshotText } from "../utils/stockScreenshotDraft.mjs";
import "./stock-screenshot-import.css";

const EMPTY_STORES = Object.freeze([]);
const FLAG_LABELS = {
  observed_time_required: "Confirm when the stock was seen. The screenshot's clock is not the observation time.",
  source_time_not_observed_time: "A post time or relative date needs your review.",
  store_choice_required: "More than one store may match. Choose the exact location.",
  store_not_identified: "Choose the store; it could not be identified from the text.",
  status_needs_review: "Choose the stock status.", status_conflict: "The text mentions conflicting stock states. Choose the one you are reporting.",
  indirect_or_future_claim: "A prediction or secondhand claim is not confirmed stock.",
  multiple_product_categories: "More than one game may be mentioned. Review the category and items.",
  screenshot_text_truncated: "This is a long screenshot. Crop to one stock update for a better result.",
  text_needs_review: "Review the extracted text and enter any details that were missed.",
};
const categoryOptions = ["Pokemon TCG", ...COLLECTIBLE_GAMES.filter((game) => game.id !== "pokemon").map((game) => game.name), "Other"];
const storeId = (store) => String(store.id || store.storeId || store.store_id || "");
const storeName = (store) => store.name || store.storeName || store.store_name || store.retailer || "Store";

export default function StockScreenshotImport({ stores = EMPTY_STORES, reportDraft, onApply }) {
  const id = useId();
  const [mode, setMode] = useState(() => reportDraft?.screenshotEntry || reportDraft?.screenshotImportReviewed ? "screenshot" : "manual");
  const [platform, setPlatform] = useState("facebook");
  const [preview, setPreview] = useState("");
  const [fileName, setFileName] = useState("");
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState(null);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [chosenStore, setChosenStore] = useState("");
  const [observedTime, setObservedTime] = useState("");
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const sequence = useRef(0);
  const controller = useRef(null);
  const previewRef = useRef("");
  const inputRef = useRef(null);
  const edited = useRef(new Set());
  const knownStores = stores.map((row) => row.store || row).filter((row) => storeId(row));
  const candidates = suggestions?.storeCandidates || [];
  const candidateIds = new Set(candidates.map(storeId));
  const orderedStores = [...knownStores].sort((left, right) => Number(candidateIds.has(storeId(right))) - Number(candidateIds.has(storeId(left))) || storeName(left).localeCompare(storeName(right)));

  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function stop() { sequence.current += 1; controller.current?.abort(); controller.current = null; setBusy(false); setProgress(null); }
  function clearImage() {
    stop();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = ""; setPreview(""); setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }
  function clearSuggestions() {
    setText(""); setSuggestions(null);
    if (!edited.current.has("items")) setProductName("");
    if (!edited.current.has("category")) setCategory("");
    if (!edited.current.has("status")) setStatus("");
  }
  function suggest(value) {
    const parsed = parseStockScreenshotText(value, { stores: knownStores });
    setSuggestions(parsed);
    if (!edited.current.has("items")) setProductName(parsed.items.join("\n"));
    if (!edited.current.has("category")) setCategory(parsed.productCategory || "");
    if (!edited.current.has("status")) setStatus(parsed.reportType || "");
    return parsed;
  }
  async function readImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    clearImage(); clearSuggestions(); setError(""); setMessage("");
    const invalid = validateScoutScreenshotFile(file);
    if (invalid) { setError(invalid.message); return; }
    const imageUrl = URL.createObjectURL(file);
    previewRef.current = imageUrl; setPreview(imageUrl); setFileName(file.name);
    const generation = ++sequence.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setProgress({ label: "Preparing text reader", progress: null });
    const result = await extractScoutScreenshotText(file, { signal: abort.signal, onProgress: (next) => { if (generation === sequence.current) setProgress(next); } });
    if (generation !== sequence.current) return;
    controller.current = null; setBusy(false); setProgress(null);
    if (["complete", "low_confidence"].includes(result.status)) {
      setText(result.text); suggest(result.text);
      setMessage(result.status === "complete" ? "Text read. Check the suggestions below before using them." : "Some text may be missing. Correct the text or enter the details below.");
    } else if (result.status !== "cancelled") setError(result.message || "The screenshot could not be read. Paste the post text or enter details instead.");
  }
  function changeMode(next) { if (next === "manual") { clearImage(); setError(""); setMessage(""); } setMode(next); }
  function apply() {
    const result = createStockScreenshotPatch(reportDraft, {
      storeId: chosenStore || reportDraft.storeId || "", productName, productCategory: category,
      reportType: status, platform, reportDate: observedTime.slice(0, 10), reportTime: observedTime.slice(11, 16),
      observedTimeConfirmed: timeConfirmed, replaceEnteredFields: replace,
    }, { stores: knownStores });
    if (!result.ok) { setError(result.error); return; }
    const kept = (result.preservedFields || []).map((field) => ({ storeId: "store", productName: "product", productCategory: "category", reportType: "stock status" })[field]).filter(Boolean);
    onApply(result.patch); setError(""); setMessage(`Reviewed details added.${kept.length ? ` Your existing ${kept.join(", ")} ${kept.length > 1 ? "choices were" : "choice was"} kept.` : ""} The screenshot and raw text remain on this device; nothing has been posted.`);
  }

  return <section className="stock-screenshot-intake" aria-label="Start your restock report">
    <div className="stock-report-start-options" role="group" aria-label="How are you reporting?">
      <button className="stock-screenshot-button" type="button" aria-pressed={mode === "manual"} onClick={() => changeMode("manual")}><strong>I’m at the store</strong></button>
      <button className="stock-screenshot-button" type="button" aria-pressed={mode === "screenshot"} onClick={() => changeMode("screenshot")}><strong>Use a screenshot</strong></button>
    </div>
    {mode === "screenshot" ? <div className="stock-screenshot-panel">
      <header><h4>Add from a screenshot</h4><p>We read the image on your device. Review the store, products, and time before adding anything to your draft.</p></header>
      <div className="stock-screenshot-upload-row">
        <label className="stock-screenshot-upload" htmlFor={`${id}-file`}>Choose screenshot<input id={`${id}-file`} ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={readImage} /></label>
        {preview ? <button className="stock-screenshot-button" type="button" onClick={() => { clearImage(); clearSuggestions(); setError(""); setMessage("Screenshot removed. Nothing has been posted."); }}>Remove screenshot</button> : null}
        <label>Post source<select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="facebook">Facebook</option><option value="discord">Discord</option><option value="other">Other screenshot</option></select></label>
      </div>
      <p className="stock-screenshot-help">JPG, PNG, or WebP · up to 12 MB. Crop to one stock post for clearer text. No Facebook or Discord login is needed.</p>
      {preview ? <details className="stock-screenshot-preview"><summary>View chosen screenshot</summary><img src={preview} alt="Private screenshot for this draft" /><p>{fileName}</p></details> : null}
      {busy ? <div className="stock-screenshot-progress" role="status"><span>{progress?.label || "Reading screenshot"}</span><progress max="1" value={typeof progress?.progress === "number" ? progress.progress : undefined} aria-label="Screenshot text reading progress" /><button className="stock-screenshot-button" type="button" onClick={() => { stop(); setMessage("Text reading stopped. You can paste text or enter the details."); }}>Cancel text reading</button><small>The first use downloads the text reader. The screenshot stays on your device.</small></div> : null}
      <details className="stock-screenshot-source-text" open={!busy && Boolean(error) || undefined}><summary>Paste or correct post text</summary><label htmlFor={`${id}-text`}>Private screenshot text<textarea id={`${id}-text`} value={text} maxLength={20000} onChange={(event) => { if (busy) stop(); setText(event.target.value); }} placeholder="Paste a Facebook post or Discord message here, or correct text that was read from the image." /></label><button className="stock-screenshot-button" type="button" disabled={!text.trim() || busy} onClick={() => { suggest(text); setError(""); setMessage("Suggestions updated. Review the fields below."); }}>Find report details</button><p>This raw text is not included in your report. Keep names, avatars, and private conversation out of the product fields.</p></details>
      {suggestions?.flags?.length ? <ul className="stock-screenshot-review-flags">{[...new Set(suggestions.flags.map((flag) => FLAG_LABELS[flag]).filter(Boolean))].map((label) => <li key={label}>{label}</li>)}</ul> : null}
      <div className="stock-screenshot-review-fields">
        <label>Exact store<select value={chosenStore} onChange={(event) => setChosenStore(event.target.value)}><option value="">{reportDraft.storeId || reportDraft.manualLocation ? "Keep the store already entered in the report" : "Choose the exact location"}</option>{orderedStores.map((store) => <option key={storeId(store)} value={storeId(store)}>{[storeName(store), store.city, store.address].filter(Boolean).join(" · ")}</option>)}</select></label>
        <label>Products mentioned<textarea value={productName} maxLength={1200} onChange={(event) => { edited.current.add("items"); setProductName(event.target.value); }} placeholder="For example: Prismatic Evolutions ETBs" /></label>
        <label>Product category<select value={category} onChange={(event) => { edited.current.add("category"); setCategory(event.target.value); }}><option value="">Choose a category</option>{categoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Stock status in the post<select value={status} onChange={(event) => { edited.current.add("status"); setStatus(event.target.value); }}><option value="">Choose after reviewing</option><option value="stock_on_shelf">Stock seen</option><option value="low_stock">Low stock</option><option value="no_stock">No stock</option><option value="restock_happening_now">Stocking now</option></select></label>
        <label>When was the stock seen?<input type="datetime-local" value={observedTime} onChange={(event) => { setObservedTime(event.target.value); setTimeConfirmed(Boolean(event.target.value)); }} /><small>Enter the observation time, not the phone clock or when you uploaded the screenshot.</small></label>
        {reportDraft.reportDate && reportDraft.reportTime ? <button className="stock-screenshot-button" type="button" onClick={() => { setObservedTime(`${reportDraft.reportDate}T${reportDraft.reportTime}`); setTimeConfirmed(true); }}>Use the time already entered: {reportDraft.reportDate} {reportDraft.reportTime}</button> : null}
      </div>
      <label className="stock-screenshot-replace"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /><span>Replace report fields I already entered<small>Otherwise your existing store, product, and status choices are kept. Notes and photos are always kept.</small></span></label>
      <p className="stock-screenshot-privacy">This starts as a private report that needs review. The image and raw text are not attached. You can choose sharing on the final review screen.</p>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p className="stock-screenshot-error" role="alert">{error}</p> : null}
      <button type="button" className="stock-screenshot-apply" disabled={busy} onClick={apply}>Use reviewed details</button>
    </div> : null}
  </section>;
}
