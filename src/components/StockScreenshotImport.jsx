import { useEffect, useId, useRef, useState } from "react";
import { COLLECTIBLE_GAMES } from "../utils/collectibleGames.mjs";
import { extractScoutScreenshotText, validateScoutScreenshotFile } from "../utils/scoutScreenshotOcr.mjs";
import { createStockScreenshotPatch, parseStockScreenshotText } from "../utils/stockScreenshotDraft.mjs";
import ManualStoreAreaFields from "./ManualStoreAreaFields.jsx";
import "./stock-screenshot-import.css";

const EMPTY_STORES = Object.freeze([]);
const MANUAL_LOCATION = "__manual_location__";
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
  negated_status_needs_review: "The post denies a sold-out or stock claim (for example \"never sold out\"). Choose the status yourself.",
  unrelated_availability_ignored: "An in-stock or sold-out line was not about a recognized card product, so it was not used. Check the status.",
  product_list_truncated: "More products were recognized than fit the list. Review the full text and report the remaining products separately.",
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
  const [storeQuery, setStoreQuery] = useState("");
  const [sourceExpanded, setSourceExpanded] = useState(false);
  const [manualStore, setManualStore] = useState(() => ({ name: reportDraft.manualLocation || reportDraft.storeName || "", city: reportDraft.city || "", state: reportDraft.state || "" }));
  const [observedTime, setObservedTime] = useState("");
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  // F03: the text the current suggestions came from. If the source text changes,
  // the review is stale and Apply waits until "Find report details" runs again.
  const [reviewedText, setReviewedText] = useState("");
  const [stage, setStage] = useState("intake");
  const sequence = useRef(0);
  const controller = useRef(null);
  const previewRef = useRef("");
  const inputRef = useRef(null);
  const edited = useRef(new Set());
  const reviewHeadingRef = useRef(null);
  const editDetailsRef = useRef(null);
  const errorRef = useRef(null);
  const manualReviewRef = useRef(null);
  const pendingFocus = useRef(null);
  const knownStores = stores.map((row) => row.store || row).filter((row) => storeId(row));
  const candidates = suggestions?.storeCandidates || [];
  const candidateIds = new Set(candidates.map(storeId));
  const selectedStore = knownStores.find((store) => storeId(store) === String(chosenStore || reportDraft.storeId || ""));
  const selectedStoreLabel = selectedStore
    ? [storeName(selectedStore), selectedStore.city, selectedStore.state || selectedStore.stateCode, selectedStore.address].filter(Boolean).join(" · ")
    : !chosenStore ? [reportDraft.manualLocation || reportDraft.storeName, reportDraft.city, reportDraft.state].filter(Boolean).join(" · ") : "";
  const observedTimeInvalid = stage === "review" && Boolean(error) && (!observedTime || !timeConfirmed);
  const orderedStores = [...knownStores].sort((left, right) => Number(candidateIds.has(storeId(right))) - Number(candidateIds.has(storeId(left))) || storeName(left).localeCompare(storeName(right)));

  const matchingStores = orderedStores.filter(store => storeId(store) === chosenStore || storeId(store) === reportDraft.storeId || storeQuery.toLowerCase().trim().split(/\s+/).every(term => [storeName(store), store.city, store.state || store.stateCode, store.address].filter(Boolean).join(" ").toLowerCase().includes(term)));
  const productRows = productName.split("\n");
  const setProductRow = (index, value) => { edited.current.add("items"); setProductName(current => current.split("\n").map((row, rowIndex) => rowIndex === index ? value : row).join("\n")); };
  const reviewChoices = { storeId: chosenStore === MANUAL_LOCATION ? "" : chosenStore || reportDraft.storeId || "", productName: productRows.map(value => value.trim()).filter(Boolean).join("; "), productCategory: category, manualStore: chosenStore === MANUAL_LOCATION ? manualStore : undefined, reportType: status, platform, reportDate: observedTime.slice(0, 10), reportTime: observedTime.slice(11, 16), observedTimeConfirmed: timeConfirmed, replaceEnteredFields: replace };
  const reviewResult = createStockScreenshotPatch(reportDraft, reviewChoices, { stores: knownStores });
  const previewDraft = reviewResult.ok ? { ...reportDraft, ...reviewResult.patch } : null;
  const stockLabel = value => ({ stock_on_shelf: "Stock seen", low_stock: "Low stock", no_stock: "No stock", restock_happening_now: "Stocking now" })[value] || value || "Not entered";
  const comparisonStore = draft => { const row = knownStores.find(store => storeId(store) === draft.storeId); return row ? [storeName(row), row.city, row.state, row.address].filter(Boolean).join(" · ") : [draft.manualLocation || draft.storeName, draft.city, draft.state].filter(Boolean).join(" · ") || "Not entered"; };
  const comparison = previewDraft ? [["Store", comparisonStore(reportDraft), comparisonStore(previewDraft)], ["Products", reportDraft.productName || "Not entered", previewDraft.productName || "Not entered"], ["Category", reportDraft.productCategory || "Not entered", previewDraft.productCategory || "Not entered"], ["Stock status", stockLabel(reportDraft.reportType), stockLabel(previewDraft.reportType)], ["Observed time", [reportDraft.reportDate, reportDraft.reportTime].filter(Boolean).join(" ") || "Not entered", [previewDraft.reportDate, previewDraft.reportTime].join(" ")]] : [];

  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  useEffect(() => {
    const target = { review: reviewHeadingRef, applied: editDetailsRef, error: errorRef, manual: manualReviewRef }[pendingFocus.current];
    if (target?.current) { target.current.focus(); pendingFocus.current = null; }
  });

  function stop() { sequence.current += 1; controller.current?.abort(); controller.current = null; setBusy(false); setProgress(null); }
  function clearImage() {
    stop();
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = ""; setPreview(""); setFileName("");
    if (inputRef.current) inputRef.current.value = "";
  }
  function clearSuggestions() {
    setText(""); setSuggestions(null); setReviewedText("");
    if (!edited.current.has("items")) setProductName("");
    if (!edited.current.has("category")) setCategory("");
    if (!edited.current.has("status")) setStatus("");
  }
  // F02: a new screenshot is a new source. Its store, observed time, confirmation
  // and replacement choice must not carry over from the previous image.
  function resetSourceReview() {
    edited.current = new Set();
    setChosenStore(""); setStoreQuery(""); setSourceExpanded(false); setObservedTime(""); setTimeConfirmed(false); setReplace(false);
    setProductName(""); setCategory(""); setStatus("");
  }
  function suggest(value) {
    const parsed = parseStockScreenshotText(value, { stores: knownStores });
    setSuggestions(parsed); setReviewedText(value);
    if (!edited.current.has("items")) setProductName(parsed.items.join("\n"));
    if (!edited.current.has("category")) setCategory(parsed.productCategory || "");
    if (!edited.current.has("status")) setStatus(parsed.reportType || "");
    setStage("review");
    return parsed;
  }
  function openReview() {
    stop(); setError(""); setMessage("");
    pendingFocus.current = "review"; setStage("review");
  }
  async function readImage(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    clearImage(); clearSuggestions(); resetSourceReview(); setError(""); setMessage(""); setStage("intake");
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
      pendingFocus.current = "review"; setText(result.text); suggest(result.text);
      setMessage(result.status === "complete" ? "Text read. Check the suggestions below before using them." : "Some text may be missing. Correct the text or enter the details below.");
    } else if (result.status !== "cancelled") setError(result.message || "The screenshot could not be read. Paste the post text or enter details instead.");
  }
  function changeMode(next) { if (next === "manual") { clearImage(); setError(""); if (stage !== "applied") setMessage(""); } setMode(next); }
  const reviewStale = Boolean(suggestions) && text !== reviewedText;
  function apply() {
    if (reviewStale) { setError("The post text changed since the last review. Choose \"Find report details\" again and check the suggestions before using them."); return; }
    const result = createStockScreenshotPatch(reportDraft, reviewChoices, { stores: knownStores });
    if (!result.ok) { pendingFocus.current = "error"; setError(result.error); return; }
    const kept = (result.preservedFields || []).map((field) => ({ storeId: "store", productName: "product", productCategory: "category", reportType: "stock status" })[field]).filter(Boolean);
    onApply(result.patch); setError(""); setMessage(`Reviewed details added.${kept.length ? ` Your existing ${kept.join(", ")} ${kept.length > 1 ? "choices were" : "choice was"} kept.` : ""} The screenshot and raw text remain on this device; nothing has been posted.`);
    pendingFocus.current = "applied"; setStage("applied");
  }

  return <section className="stock-screenshot-intake" aria-label="Start your restock report">
    <div className="stock-report-start-options" role="group" aria-label="How are you reporting?">
      <button className="stock-screenshot-button" type="button" aria-pressed={mode === "manual"} onClick={() => changeMode("manual")}><strong>I’m at the store</strong></button>
      <button className="stock-screenshot-button" type="button" aria-pressed={mode === "screenshot"} onClick={() => changeMode("screenshot")}><strong>Use a screenshot</strong></button>
    </div>
    {mode === "screenshot" ? <div className="stock-screenshot-panel" data-stage={stage}>
      <ol className="stock-screenshot-steps" aria-label="Screenshot progress">{[["intake","Source"],["review","Review"],["applied","Draft"]].map(([value,label],index)=><li key={value} aria-current={stage===value?"step":undefined}><span aria-hidden="true">{index+1}</span>{label}</li>)}</ol>
      {stage === "applied" ? <div className="stock-screenshot-applied">
        <div role="status"><h4>Reviewed details added</h4><p>{message.replace(/^Reviewed details added\.\s*/, "")}</p></div>
        <button ref={editDetailsRef} type="button" className="stock-screenshot-button" onClick={openReview}>Edit details</button>
      </div> : <>
      {stage === "intake" ? <header><h4>Add from a screenshot</h4><p>Choose one stock post. You’ll review the store, items and time next.</p></header> : null}
      <details className="stock-screenshot-source" key={stage === "intake" ? "intake" : "review"} open={stage === "intake" || busy}>
      <summary>{stage === "review" ? "Change screenshot or source" : "Choose screenshot or paste text"}{fileName ? <small>{fileName}</small> : null}</summary>
      <div className="stock-screenshot-source__body">
      <div className="stock-screenshot-upload-row">
        <label className="stock-screenshot-upload" htmlFor={`${id}-file`}>Choose screenshot<input id={`${id}-file`} ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={readImage} /></label>
        {preview ? <button className="stock-screenshot-button" type="button" onClick={() => { clearImage(); clearSuggestions(); resetSourceReview(); setStage("intake"); setError(""); setMessage("Screenshot removed. Nothing has been posted."); inputRef.current?.focus(); }}>Remove screenshot</button> : null}
        <label>Post source<select value={platform} onChange={(event) => setPlatform(event.target.value)}><option value="facebook">Facebook</option><option value="discord">Discord</option><option value="other">Other screenshot</option></select></label>
      </div>
      <p className="stock-screenshot-help">JPG, PNG or WebP · up to 12 MB. No Facebook or Discord login needed.</p>
      {preview ? <details className="stock-screenshot-preview"><summary>View chosen screenshot</summary><img src={preview} alt="Private screenshot for this draft" /><p>{fileName}</p></details> : null}
      {busy ? <div className="stock-screenshot-progress" role="status"><span>{progress?.label || "Reading screenshot"}</span><progress max="1" value={typeof progress?.progress === "number" ? progress.progress : undefined} aria-label="Screenshot text reading progress" /><button className="stock-screenshot-button" type="button" onClick={() => { stop(); pendingFocus.current = "manual"; setMessage("Text reading stopped. You can paste text or enter the details."); }}>Cancel text reading</button><small>The first use downloads the text reader. The screenshot stays on your device.</small></div> : null}
      <details className="stock-screenshot-source-text" open={!busy && Boolean(error) || undefined}><summary>Paste or correct post text</summary><label htmlFor={`${id}-text`}>Private screenshot text<textarea id={`${id}-text`} value={text} maxLength={20000} onChange={(event) => { if (busy) stop(); setText(event.target.value); }} placeholder="Paste a Facebook post or Discord message here, or correct text that was read from the image." /></label><button className="stock-screenshot-button" type="button" disabled={!text.trim() || busy} onClick={() => { suggest(text); pendingFocus.current = "review"; setError(""); setMessage("Suggestions updated. Review the fields below."); }}>Find report details</button><p>This raw text is not included in your report. Keep names, avatars, and private conversation out of the product fields.</p></details>
      </div></details>
      {message ? <p className="stock-screenshot-status" role="status">{message}</p> : null}
      {error ? <p ref={errorRef} tabIndex={-1} className="stock-screenshot-error" role="alert">{error}</p> : null}
      {stage === "intake" ? <div className="stock-screenshot-manual-fallback"><p>{error ? "You can still make a report. Paste the text above, or enter the store and products yourself." : "No readable text? You can enter the report details yourself."}</p><button ref={manualReviewRef} className="stock-screenshot-button" type="button" onClick={openReview}>Enter details myself</button></div> : null}
      {stage === "review" ? <section className="stock-screenshot-review" aria-labelledby={`${id}-review-heading`}>
      <header><h4 id={`${id}-review-heading`} ref={reviewHeadingRef} tabIndex={-1}>Review screenshot details</h4><p>Confirm the exact store and when the stock was seen. Suggestions are a starting point.</p></header>
      {suggestions?.flags?.length ? <ul className="stock-screenshot-review-flags">{[...new Set(suggestions.flags.map((flag) => FLAG_LABELS[flag]).filter(Boolean))].map((label) => <li key={label}>{label}</li>)}</ul> : null}
      <div className="stock-screenshot-review-layout">
      {preview || reviewedText ? <aside className="stock-screenshot-compare-source"><button className="stock-screenshot-button stock-screenshot-source-toggle" type="button" aria-expanded={sourceExpanded} aria-controls={id + "-source-preview"} onClick={() => setSourceExpanded(value => !value)}>{sourceExpanded ? "Hide source" : "View source while reviewing"}</button><div id={id + "-source-preview"} className={sourceExpanded ? "is-expanded" : ""}><h5>Original source</h5>{preview ? <img src={preview} alt="Private screenshot being reviewed" /> : <pre>{reviewedText}</pre>}<small>Private reference. Not attached to the report.</small></div></aside> : null}
      <div className="stock-screenshot-review-fields">
        <label className="stock-screenshot-field--wide">Find a store<input type="search" value={storeQuery} onChange={event => setStoreQuery(event.target.value)} placeholder="Retailer, city or street" /></label>
        <label className="stock-screenshot-field--wide"><span id={`${id}-store-label`}>Exact store</span><select aria-labelledby={`${id}-store-label`} aria-describedby={selectedStoreLabel ? `${id}-store-help` : undefined} value={chosenStore} onChange={(event) => setChosenStore(event.target.value)}><option value="">{reportDraft.storeId || reportDraft.manualLocation ? "Keep current store" : "Choose the exact location"}</option><option value={MANUAL_LOCATION}>Enter a store not listed</option>{matchingStores.map((store) => <option key={storeId(store)} value={storeId(store)}>{[storeName(store), store.city, store.state || store.stateCode, store.address].filter(Boolean).join(" · ")}</option>)}</select>{selectedStoreLabel ? <small id={`${id}-store-help`} className="stock-screenshot-store-help">{chosenStore ? "Selected: " : "Current draft: "}{selectedStoreLabel}</small> : null}</label>
        {chosenStore === MANUAL_LOCATION ? <div className="scout-manual-store-panel">
          <label>Store name<input value={manualStore.name} maxLength={200} onChange={event => setManualStore(current => ({ ...current, name: event.target.value }))} /></label>
          <ManualStoreAreaFields value={manualStore} onChange={(field, value) => setManualStore(current => ({ ...current, [field]: value }))} />
        </div> : null}
        <fieldset className="stock-screenshot-product-rows stock-screenshot-field--wide"><legend>Products mentioned</legend>{productRows.map((value, index) => <div key={index}><label>Product {index + 1}<input value={value} maxLength={1200} onChange={event => setProductRow(index, event.target.value)} placeholder="Product name" /></label><button type="button" className="stock-screenshot-button" aria-label={"Remove product " + (index + 1)} onClick={() => { edited.current.add("items"); setProductName(current => current.split("\n").filter((_, rowIndex) => rowIndex !== index).join("\n")); }}>Remove</button></div>)}<button type="button" className="stock-screenshot-button" onClick={() => { edited.current.add("items"); setProductName(current => current + "\n"); }}>Add product</button><small>Review each name. All rows remain part of this single report.</small></fieldset>
        <label>Product category<select value={category} onChange={(event) => { edited.current.add("category"); setCategory(event.target.value); }}><option value="">Choose a category</option>{categoryOptions.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Stock status in the post<select value={status} onChange={(event) => { edited.current.add("status"); setStatus(event.target.value); }}><option value="">Choose after reviewing</option><option value="stock_on_shelf">Stock seen</option><option value="low_stock">Low stock</option><option value="no_stock">No stock</option><option value="restock_happening_now">Stocking now</option></select></label>
        <label className="stock-screenshot-field--wide stock-screenshot-observed-time"><span id={`${id}-time-label`}>When was the stock seen? <span className="stock-screenshot-required">Required</span></span><input aria-labelledby={`${id}-time-label`} aria-required="true" aria-invalid={observedTimeInvalid ? "true" : undefined} aria-describedby={`${id}-time-help${observedTimeInvalid ? ` ${id}-time-error` : ""}`} type="datetime-local" value={observedTime} onChange={(event) => { setObservedTime(event.target.value); setTimeConfirmed(Boolean(event.target.value)); setError(""); }} /><small id={`${id}-time-help`}>Enter the observation time, not the phone clock or when you uploaded the screenshot.</small>{observedTimeInvalid ? <small id={`${id}-time-error`} className="stock-screenshot-field-error">Enter when the stock was actually seen to continue.</small> : null}</label>
        {reportDraft.reportDate && reportDraft.reportTime ? <button className="stock-screenshot-button" type="button" onClick={() => { setObservedTime(`${reportDraft.reportDate}T${reportDraft.reportTime}`); setTimeConfirmed(true); }}>Use the time already entered: {reportDraft.reportDate} {reportDraft.reportTime}</button> : null}
      </div>
      </div>
      <label className="stock-screenshot-replace"><input type="checkbox" checked={replace} onChange={(event) => setReplace(event.target.checked)} /><span>Replace report fields I already entered<small>Otherwise your existing store, product, and status choices are kept. Notes and photos are always kept.</small></span></label>
      <div className="stock-screenshot-change-review"><h5>Changes to your draft</h5>{previewDraft ? <div className="stock-screenshot-change-table"><table><thead><tr><th scope="col">Field</th><th scope="col">Current</th><th scope="col">After review</th></tr></thead><tbody>{comparison.map(([label, before, after]) => <tr key={label}><th scope="row">{label}</th><td>{before}</td><td>{after}{before === after ? <small>Kept</small> : <small>Will change</small>}</td></tr>)}</tbody></table></div> : <p>Complete the exact store, stock status and observation time to preview the changes.</p>}<small>Personal notes and existing photos are always kept. Nothing is posted by applying these details.</small></div>
      <p className="stock-screenshot-privacy">This starts as a private report that needs review. The image and raw text are not attached. You can choose sharing on the final review screen.</p>
      {reviewStale ? <p className="stock-screenshot-error" role="status">The text changed after the last review. Run “Find report details” again before using these details.</p> : null}
      <button type="button" className="stock-screenshot-apply" disabled={busy || reviewStale} onClick={apply}>Use reviewed details</button>
      </section> : <p className="stock-screenshot-privacy">The screenshot and raw text stay on your device. Nothing is added to your draft until you review it.</p>}
      </>}
    </div> : null}
  </section>;
}
