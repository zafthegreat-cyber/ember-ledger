import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { EmptyState, PrimaryButton, QuietButton, SecondaryButton, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { OWNER_SESSION_STATES } from "../../services/ownerSession.js";
import { fetchPurchaseEmailImportStatus, previewPurchaseEmails } from "../../services/purchaseEmailApi.js";
import { formatMoneyForDisplay, minorUnitsToMajorString, parseMajorMoney } from "../intelligence/money.js";
import { receiptDuplicate } from "./emailImport.js";
import PurchaseOrderBrowser from "./PurchaseOrderBrowser.jsx";
import "./purchase-email-import.css";

const PROVIDER_LABELS = { aol: "AOL", gmail: "Gmail", yahoo: "Yahoo" };
const APP_PASSWORD_HELP = {
  aol: "https://help.aol.com/articles/create-and-manage-app-password",
  gmail: "https://support.google.com/accounts/answer/185833?hl=en",
  yahoo: "https://help.yahoo.com/kb/SLN15241.html",
};
const EMPTY_ITEM = { title: "", quantity: "", unitPrice: "" };
const moneyText = (value) => Number.isSafeInteger(value) ? minorUnitsToMajorString(value) : "";
const words = (value) => String(value || "").replaceAll("_", " ").toLowerCase();

function dateLabel(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Date needs review";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
}

function initialReview(receipt) {
  return {
    receipt, retailerLabel: receipt.retailerLabel || "", externalOrderId: receipt.orderId || "",
    purchasedAt: receipt.orderedAt?.slice(0, 10) || "", currency: receipt.currency || "", total: moneyText(receipt.totalMinorUnits),
    tax: "", shipping: "", fees: "", discount: "",
    items: receipt.items.length ? receipt.items.map((item) => {
      const exactUnitPrice = item.unitPriceMinorUnits ?? (item.quantity > 0 && Number.isSafeInteger(item.lineTotalMinorUnits) && item.lineTotalMinorUnits % item.quantity === 0 ? item.lineTotalMinorUnits / item.quantity : null);
      return { title: item.description, quantity: item.quantity == null ? "" : String(item.quantity), unitPrice: moneyText(exactUnitPrice) };
    }) : [{ ...EMPTY_ITEM }],
  };
}

function totalsForReview(review) {
  if (!review.currency || !review.total) return null;
  try {
    let subtotal = 0n;
    for (const item of review.items) {
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1 || !item.unitPrice.trim()) return null;
      subtotal += BigInt(parseMajorMoney(item.unitPrice, { currency: review.currency }).minorUnits) * BigInt(quantity);
      if (subtotal > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    }
    const amount = (field) => review[field].trim() ? BigInt(parseMajorMoney(review[field], { currency: review.currency }).minorUnits) : 0n;
    const calculated = subtotal + amount("tax") + amount("shipping") + amount("fees") - amount("discount");
    const total = BigInt(parseMajorMoney(review.total, { currency: review.currency }).minorUnits);
    if (calculated > BigInt(Number.MAX_SAFE_INTEGER) || calculated < -BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return { subtotal: Number(subtotal), calculated: Number(calculated), total: Number(total), matches: calculated === total };
  } catch { return null; }
}

function ReceiptReview({ review, busy, onChange, onSave, onCancel, error }) {
  const id = useId();
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const change = (field) => (event) => onChange({ ...review, [field]: event.target.value });
  const itemChange = (index, field, value) => onChange({ ...review, items: review.items.map((item, position) => position === index ? { ...item, [field]: value } : item) });
  const totals = totalsForReview(review);
  const displayMoney = (minorUnits) => formatMoneyForDisplay({ minorUnits, currency: review.currency });

  return <form className="purchase-email-review" aria-label="Review receipt" onSubmit={(event) => { event.preventDefault(); onSave(); }} aria-busy={busy}>
    <div><h3 ref={heading} tabIndex={-1}>Review receipt</h3><p>Check these details against your order. Missing amounts and quantities need your input.</p></div>
    <div className="purchase-email-grid">
      <label htmlFor={`${id}-retailer`}><span>Retailer or store</span><input id={`${id}-retailer`} value={review.retailerLabel} onChange={change("retailerLabel")} maxLength={500} required disabled={busy} /></label>
      <label htmlFor={`${id}-order`}><span>Order number</span><input id={`${id}-order`} value={review.externalOrderId} onChange={change("externalOrderId")} maxLength={256} disabled={busy} /></label>
      <label htmlFor={`${id}-date`}><span>Purchase date</span><input id={`${id}-date`} type="date" value={review.purchasedAt} onChange={change("purchasedAt")} required disabled={busy} /></label>
      <label htmlFor={`${id}-currency`}><span>Currency</span><select id={`${id}-currency`} aria-label="Receipt currency" value={review.currency} onChange={change("currency")} required disabled={busy}><option value="">Choose currency</option>{[...new Set(["USD", "CAD", "GBP", "EUR", "AUD", "NZD", review.currency].filter(Boolean))].map((currency) => <option key={currency} value={currency}>{currency}</option>)}</select></label>
    </div>
    <div className="purchase-email-items">{review.items.map((item, index) => <fieldset key={index} disabled={busy}><legend>Item {index + 1}</legend>
      <label htmlFor={`${id}-title-${index}`}><span>Item {index + 1} name</span><input id={`${id}-title-${index}`} value={item.title} onChange={(event) => itemChange(index, "title", event.target.value)} maxLength={500} required /></label>
      <div className="purchase-email-grid"><label htmlFor={`${id}-qty-${index}`}><span>Item {index + 1} quantity</span><input id={`${id}-qty-${index}`} type="number" min={1} max={1000000} step={1} inputMode="numeric" value={item.quantity} onChange={(event) => itemChange(index, "quantity", event.target.value)} required /></label><label htmlFor={`${id}-price-${index}`}><span>Item {index + 1} unit price</span><input id={`${id}-price-${index}`} inputMode="decimal" value={item.unitPrice} onChange={(event) => itemChange(index, "unitPrice", event.target.value)} maxLength={20} placeholder="0.00" required /></label></div>
      {review.items.length > 1 ? <QuietButton onClick={() => onChange({ ...review, items: review.items.filter((_, position) => position !== index) })} aria-label={`Remove item ${index + 1}`}>Remove item</QuietButton> : null}
    </fieldset>)}</div>
    <div><SecondaryButton disabled={busy || review.items.length >= 100} onClick={() => onChange({ ...review, items: [...review.items, { ...EMPTY_ITEM }] })}>Add item</SecondaryButton></div>
    <fieldset className="purchase-email-costs" disabled={busy}><legend>Order costs</legend><p>Enter tax, shipping, fees, or a discount when they apply. The calculated total must match your order total.</p><div className="purchase-email-grid">{[["tax", "Tax"], ["shipping", "Shipping"], ["fees", "Fees"], ["discount", "Discount"]].map(([field, label]) => <label htmlFor={`${id}-${field}`} key={field}><span>{label}</span><input id={`${id}-${field}`} inputMode="decimal" value={review[field]} onChange={change(field)} maxLength={20} placeholder="Not added" /></label>)}<label htmlFor={`${id}-total`}><span>Order total</span><input id={`${id}-total`} inputMode="decimal" value={review.total} onChange={change("total")} maxLength={20} placeholder="0.00" required /></label></div></fieldset>
    {totals ? <div className={`purchase-email-totals${totals.matches ? "" : " has-difference"}`} role="status"><span>Items: <strong>{displayMoney(totals.subtotal)}</strong></span><span>Calculated total: <strong>{displayMoney(totals.calculated)}</strong></span><span>{totals.matches ? "Matches your order total" : "Amounts do not match. Review item prices and order costs before saving."}</span></div> : null}
    <p className="purchase-email-note">This creates a draft for review. Confirming a purchase and recording received items are separate steps.</p>
    {error ? <p className="purchase-email-error" role="alert">{error}</p> : null}
    <div className="purchase-email-actions"><PrimaryButton type="submit" disabled={busy || totals?.matches === false}>{busy ? "Saving draft…" : "Save purchase draft"}</PrimaryButton><SecondaryButton onClick={onCancel} disabled={busy}>Back to receipts</SecondaryButton></div>
  </form>;
}

export default function PurchaseEmailImport(props) {
  const session = props.session;
  const lifetime = session?.status === OWNER_SESSION_STATES.AUTHORIZED ? JSON.stringify([session.provider || "", session.identityKey || session.userId || session.user?.id || session.displayIdentity || "owner"]) : "restricted";
  return <PurchaseEmailImportContent key={lifetime} {...props} />;
}

function PurchaseEmailImportContent({ session, onCreateDraft, onOpenDraft, existingDrafts = [], purchases = [], onClose }) {
  const authorized = session?.status === OWNER_SESSION_STATES.AUTHORIZED;
  const id = useId();
  const passwordRef = useRef(null);
  const setPasswordInput = useCallback((node) => {
    if (passwordRef.current && passwordRef.current !== node) passwordRef.current.value = "";
    passwordRef.current = node;
  }, []);
  const alive = useRef(true);
  const pullRef = useRef(null);
  const pullSequence = useRef(0);
  const saveInFlight = useRef(false);
  const resultsHeading = useRef(null);
  const [runtime, setRuntime] = useState({ state: "loading", providers: [] });
  const [statusAttempt, setStatusAttempt] = useState(0);
  const [provider, setProvider] = useState("aol");
  const [mailboxAddress, setMailboxAddress] = useState("");
  const [days, setDays] = useState(30);
  const [pulling, setPulling] = useState(false);
  const [preview, setPreview] = useState(null);
  const [connectionOpen, setConnectionOpen] = useState(true);
  const [reviews, setReviews] = useState({});
  const [selectedId, setSelectedId] = useState("");
  const [receiptSelection, setReceiptSelection] = useState("");
  const [savedDrafts, setSavedDrafts] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => { if (preview && !receiptSelection) resultsHeading.current?.focus(); }, [preview, receiptSelection]);

  useLayoutEffect(() => {
    alive.current = authorized;
    return () => {
      alive.current = false;
      pullSequence.current += 1;
      pullRef.current?.abort();
    };
  }, [authorized]);

  useEffect(() => {
    if (!authorized) return undefined;
    const controller = new AbortController();
    fetchPurchaseEmailImportStatus({ signal: controller.signal }).then((status) => {
      if (controller.signal.aborted || !alive.current) return;
      setRuntime({ state: status.available ? "available" : "unavailable", providers: status.providers });
      setProvider((current) => status.providers.includes(current) ? current : status.providers[0] || "aol");
    }).catch((requestError) => {
      if (controller.signal.aborted || !alive.current) return;
      setRuntime({ state: "error", providers: [], message: requestError?.message || "Email import availability could not be checked." });
    });
    return () => controller.abort();
  }, [authorized, statusAttempt]);

  async function pullEmails(event) {
    event.preventDefault();
    if (!alive.current || pulling || saveInFlight.current || runtime.state !== "available") return;
    const appPassword = passwordRef.current?.value || "";
    if (passwordRef.current) passwordRef.current.value = "";
    if (!appPassword.trim()) { setError("Enter an app password from your email provider for this pull."); return; }
    const controller = new AbortController();
    pullRef.current?.abort();
    pullRef.current = controller;
    const sequence = ++pullSequence.current;
    const timeout = setTimeout(() => controller.abort(), 60000);
    setPulling(true); setError(""); setMessage(""); setSelectedId("");
    try {
      const result = await previewPurchaseEmails({ provider, mailboxAddress, appPassword, days }, { signal: controller.signal });
      if (!alive.current || sequence !== pullSequence.current) return;
      setPreview(result); setReviews({}); setSavedDrafts({}); setReceiptSelection(""); setConnectionOpen(false);
      setMessage(`${result.candidates.length} ${result.candidates.length === 1 ? "receipt is" : "receipts are"} ready for review. No purchase was created.`);
    } catch (requestError) {
      if (!alive.current || sequence !== pullSequence.current) return;
      setError(requestError?.name === "AbortError" ? "The email pull timed out or was stopped. Your saved records are unchanged. Enter the app password again to retry." : `${requestError?.message || "Emails could not be pulled."} Enter the app password again to retry.`);
    } finally {
      clearTimeout(timeout);
      if (alive.current && sequence === pullSequence.current) { setPulling(false); pullRef.current = null; }
    }
  }

  function openReview(receipt) {
    if (saveInFlight.current) return;
    setReviews((current) => ({ ...current, [receipt.sourceId]: current[receipt.sourceId] || initialReview(receipt) }));
    setSelectedId(receipt.sourceId); setSaveError(""); setMessage("");
  }

  async function saveDraft() {
    if (!alive.current || saveInFlight.current || !selectedId) return;
    const review = reviews[selectedId];
    if (receiptDuplicate(review.receipt, { purchaseDrafts: existingDrafts, purchases }) || savedDrafts[selectedId]) { setSaveError("This receipt already has a saved draft or purchase. Open that record instead."); return; }
    saveInFlight.current = true; setSaving(true); setSaveError("");
    try {
      const result = await onCreateDraft(review);
      if (!alive.current) return;
      const draft = result?.draft || result;
      if (!draft?.id) throw new Error("Draft saving was not confirmed. Retry this receipt to check its saved status.");
      setSavedDrafts((current) => ({ ...current, [selectedId]: draft }));
      setSelectedId("");
      setReceiptSelection("");
      setMessage(result?.deduplicated ? "This receipt already has a purchase draft. The existing draft was kept; open it to continue review." : "Purchase draft saved. Review it in Drafts, then choose Confirm Purchase when the details are correct.");
    } catch (draftError) {
      if (!alive.current) return;
      if (draftError?.savedRecord) {
        const draft = draftError.savedRecord.draft || draftError.savedRecord;
        setSavedDrafts((current) => ({ ...current, [selectedId]: draft }));
        setSelectedId("");
        setReceiptSelection("");
        setMessage("The purchase draft was saved, but the list could not refresh. Reopen Purchases to review it.");
      } else setSaveError(draftError?.message || "The draft could not be saved. Your review details are still here.");
    } finally {
      saveInFlight.current = false;
      if (alive.current) setSaving(false);
    }
  }

  if (!authorized) return null;
  const selectedReview = selectedId ? reviews[selectedId] : null;
  const receiptRows = (preview?.candidates || []).map((receipt) => {
    const duplicate = receiptDuplicate(receipt, { purchaseDrafts: existingDrafts, purchases });
    const savedDraft = savedDrafts[receipt.sourceId] || (duplicate?.kind === "draft" ? duplicate.record : null);
    return { ...receipt, receipt, duplicate, savedDraft, savedStatus: duplicate?.kind === "purchase" ? "PURCHASE_SAVED" : savedDraft ? "DRAFT_SAVED" : "REVIEW_NEEDED" };
  });
  return <section className="purchase-email-import" aria-label="Purchase email import" data-testid="purchase-email-import">
    <header className="purchase-email-heading"><div><span className="ops-eyebrow">Email receipts</span><h2>{preview ? "Your receipt inbox" : "Pull purchase emails"}</h2><p>{preview ? "Choose a receipt to check its details or open its saved draft." : "Find order receipts in your inbox, review the details, and save selected purchase drafts."}</p></div><div className="purchase-email-actions">{preview ? <SecondaryButton onClick={() => setConnectionOpen((open) => !open)} disabled={saving || pulling} aria-expanded={connectionOpen} aria-controls={`${id}-connection`}>{connectionOpen ? "Hide email setup" : "Pull more emails"}</SecondaryButton> : null}{onClose ? <SecondaryButton onClick={onClose} disabled={saving} aria-label="Close purchase email import">Close</SecondaryButton> : null}</div></header>
    {runtime.state === "loading" ? <p role="status">Checking email import availability…</p> : null}
    {["unavailable", "error"].includes(runtime.state) ? <div className="purchase-email-unavailable"><p role="alert">{runtime.message || "Purchase email import is not available on this server yet. Your existing records are unchanged."}</p><SecondaryButton onClick={() => { setRuntime({ state: "loading", providers: [] }); setStatusAttempt((attempt) => attempt + 1); }}>Check again</SecondaryButton></div> : null}
    {runtime.state === "available" && connectionOpen ? <form id={`${id}-connection`} className="purchase-email-connect" aria-label="Pull purchase emails" onSubmit={pullEmails} aria-busy={pulling}>
      <div className="purchase-email-grid"><label htmlFor={`${id}-provider`}><span>Email provider</span><select id={`${id}-provider`} aria-label="Email provider" value={provider} onChange={(event) => { setProvider(event.target.value); if (passwordRef.current) passwordRef.current.value = ""; }} disabled={pulling || saving}>{runtime.providers.map((key) => <option key={key} value={key}>{PROVIDER_LABELS[key]}</option>)}</select></label><label htmlFor={`${id}-days`}><span>Look back</span><select id={`${id}-days`} aria-label="Look back" value={days} onChange={(event) => setDays(Number(event.target.value))} disabled={pulling || saving}>{[7, 30, 90].map((value) => <option key={value} value={value}>Last {value} days</option>)}</select></label><label htmlFor={`${id}-email`}><span>Mailbox email address</span><input id={`${id}-email`} type="email" autoComplete="email" value={mailboxAddress} onChange={(event) => setMailboxAddress(event.target.value)} required maxLength={320} disabled={pulling || saving} autoCapitalize="none" spellCheck={false} /></label><label htmlFor={`${id}-password`}><span>App password</span><input id={`${id}-password`} ref={setPasswordInput} type="password" autoComplete="off" required minLength={8} maxLength={256} disabled={pulling || saving} aria-describedby={`${id}-password-help`} /></label></div>
      <p className="purchase-email-note" id={`${id}-password-help`}>Use an app password generated by your email provider. It is used for this pull only, cleared from this form immediately, and never saved.</p>
      <div className="purchase-email-help"><a href={APP_PASSWORD_HELP[provider]} target="_blank" rel="noopener noreferrer">How to create an app password for {PROVIDER_LABELS[provider]}</a>{provider === "gmail" ? <p>Gmail requires 2-Step Verification. Some work, school, or protected accounts do not offer app passwords.</p> : null}</div>
      <p className="purchase-email-note">Reads your INBOX without changing messages. Each pull checks up to 500 messages and returns up to 25 possible receipts. Review matching receipts before adding a draft; older purchase records are kept.</p>
      <div className="purchase-email-actions"><PrimaryButton type="submit" disabled={pulling || saving}>{pulling ? "Reading inbox…" : "Pull purchase emails"}</PrimaryButton>{pulling ? <SecondaryButton onClick={() => pullRef.current?.abort()}>Stop pull</SecondaryButton> : null}</div>
    </form> : null}
    {error ? <p className="purchase-email-error" role="alert">{error}</p> : null}
    {message ? <p className="purchase-email-status" role="status">{message}</p> : null}
    {preview ? <section className="purchase-email-results" aria-label="Review receipts"><div><h3 ref={resultsHeading} tabIndex={-1}>Review receipts</h3><p>{preview.scannedMessages} messages checked · {preview.skippedMessages} skipped · Last {preview.days} days</p>{preview.truncated ? <p className="purchase-email-warning">The pull reached its message or receipt limit. This list may not include every order in that date range.</p> : null}</div>
      <PurchaseOrderBrowser records={receiptRows} kind="receipt" label="Receipts" selectedId={receiptSelection} onSelect={(value) => { setReceiptSelection(value); setSelectedId(""); setSaveError(""); }} disabled={saving || pulling} empty={<EmptyState title="No receipts found">No matching order receipts were found in the checked inbox messages. Try a different date range or mailbox.</EmptyState>} renderDetail={({ receipt, duplicate, savedDraft }) => selectedReview && selectedId === receipt.sourceId ? <ReceiptReview key={selectedId} review={selectedReview} busy={saving} onChange={(value) => setReviews((current) => ({ ...current, [selectedId]: value }))} onSave={saveDraft} onCancel={() => { setSelectedId(""); setReceiptSelection(""); setSaveError(""); }} error={saveError} /> : <article className="purchase-email-receipt" data-testid={`email-receipt-${receipt.sourceId}`}><div className="purchase-email-heading"><div><h4>{receipt.retailerLabel || "Retailer needs review"}</h4><p>{receipt.orderId ? `Order ${receipt.orderId}` : "Order number not found"}</p></div>{duplicate || savedDraft ? <StatusBadge tone="neutral">{duplicate?.kind === "purchase" ? "Purchase already saved" : "Draft already saved"}</StatusBadge> : <StatusBadge tone="warning">Review needed</StatusBadge>}</div><dl><div><dt>Purchase date</dt><dd>{dateLabel(receipt.orderedAt)}</dd></div><div><dt>Order total</dt><dd>{receipt.currency && receipt.totalMinorUnits !== null ? formatMoneyForDisplay({ minorUnits: receipt.totalMinorUnits, currency: receipt.currency }) : "Amount needs review"}</dd></div></dl><ul className="purchase-email-item-summary">{receipt.items.map((item, index) => <li key={index}><strong>{item.description}</strong><span>{item.quantity == null ? "Quantity needs review" : `Qty ${item.quantity}`}</span></li>)}</ul>{receipt.warnings.length ? <details><summary>Details to check ({receipt.warnings.length})</summary><ul>{receipt.warnings.map((warning, index) => <li key={index}>{words(warning)}</li>)}</ul></details> : null}<div className="purchase-email-actions">{savedDraft?.id ? <SecondaryButton onClick={() => onOpenDraft?.(savedDraft.id)}>Open purchase draft</SecondaryButton> : !duplicate ? <PrimaryButton onClick={() => openReview(receipt)} disabled={pulling}>Review receipt</PrimaryButton> : null}</div></article>} />
    </section> : null}
  </section>;
}
