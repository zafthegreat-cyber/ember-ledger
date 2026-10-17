import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PrimaryButton, QuietButton, SectionHeader } from "../../components/operations/OperationsUI.jsx";
import { DetailList, SelectField, TextField } from "../../components/operations/RecordExperience.jsx";
import { minorUnitsFromInput } from "./contracts.js";
import { returnMoney } from "./returnPresentation.js";

export function ReturnCorrectionHistory({ preview }) {
  if (!preview.corrections?.length) return null;
  return <details className="manual-return-history"><summary>Correction history · {preview.corrections.length}</summary>
    <p className="manual-lifecycle-note">Original application: {returnMoney(preview.application.refundMinor, preview.currency)} refunded, {preview.application.restockedQuantity} units restocked. Original inspection and sale records are retained.</p>
    <ol className="manual-lifecycle-history">{preview.corrections.map((entry) => <li key={entry.id}>
      <strong>{entry.reason}</strong>
      <DetailList items={[
        { label: "Recorded", value: entry.appliedAt },
        { label: "Refund total after correction", value: returnMoney(entry.after.refundMinor, preview.currency) },
        { label: "Restocked quantity after correction", value: entry.after.restockedQuantity },
        { label: "Manual refund reference", value: entry.after.refundReference || "None" },
      ]} />
    </li>)}</ol>
  </details>;
}

export default function SaleReturnCorrection({ record, current, mode, service, isOwnerAuthorized, onApplied, onCancel }) {
  const reversing = mode === "reverse";
  const [values, setValues] = useState(() => ({ refund: reversing ? "0.00" : (current.refundMinor / 100).toFixed(2), refundReference: reversing ? "" : current.refundReference || "", restockedQuantity: reversing ? "0" : String(current.restockedQuantity), disposition: reversing ? "No physical return" : current.disposition, reason: "", physicalReturnConfirmed: false, inspection: "" }));
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false), alive = useRef(true), key = useRef("");
  const sectionRef = useRef(null), focusRequest = useRef("form");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    if (!focusRequest.current || busy) return;
    const target = focusRequest.current === "form" ? sectionRef.current : sectionRef.current?.querySelector(`[data-correction-focus="${focusRequest.current}"]`);
    focusRequest.current = "";
    if (isOwnerAuthorized()) target?.focus();
  }, [preview, error, busy, isOwnerAuthorized]);
  const requestFocus = (target) => {
    // A finished request should not pull focus back after someone moves elsewhere.
    if (document.activeElement === document.body || sectionRef.current?.contains(document.activeElement)) focusRequest.current = target;
  };
  const update = (field) => (value) => {
    if (pending.current) return;
    key.current = ""; setPreview(null); setConfirmed(false); setError("");
    setValues((previous) => ({ ...previous, [field]: value }));
  };
  const run = async (operation) => {
    if (pending.current || !isOwnerAuthorized()) return;
    pending.current = true; setBusy(true); setError("");
    try { await operation(); }
    catch (failure) {
      if (alive.current && isOwnerAuthorized()) { requestFocus("error"); setError(failure.message || "The correction could not be saved. Your draft is still here."); setPreview(null); setConfirmed(false); }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const review = (event) => {
    event.preventDefault();
    return run(async () => {
      key.current ||= globalThis.crypto.randomUUID();
      const proposal = { idempotencyKey: key.current, refundMinor: minorUnitsFromInput(values.refund), refundReference: values.refundReference.trim(), restockedQuantity: Number(values.restockedQuantity), disposition: values.disposition, reason: values.reason.trim(), physicalReturnConfirmed: values.physicalReturnConfirmed, inspection: values.inspection.trim() };
      const next = await service.previewReturnCorrection(record.id, proposal);
      if (alive.current && isOwnerAuthorized()) { requestFocus("review"); setPreview(next); setConfirmed(false); }
    });
  };
  const apply = () => run(async () => {
    if (!confirmed || !preview?.canApply || preview.alreadyApplied) return;
    const result = await service.applyReturnCorrection({ returnId: record.id, proposal: preview.proposal, expectedVersion: preview.expectedVersion, confirmed: true });
    if (alive.current && isOwnerAuthorized()) onApplied(result);
  });
  const increasingStock = Number(values.restockedQuantity) > current.restockedQuantity;
  return <section ref={sectionRef} tabIndex={-1} className="manual-return-correction" aria-label="Return correction">
    <SectionHeader title={reversing ? "Reverse applied return" : "Correct applied return"} description="Save a new history entry with the reason for this change. The original sale, inspection, and application remain unchanged." />
    <p className="manual-lifecycle-note">{reversing ? "A reversal sets this return’s recorded refund and restocked quantity to zero. Stock removal is blocked if those units are no longer available." : "Enter the corrected totals for this return, including any earlier corrections."} This only updates your records; it does not send or recover money.</p>
    {error ? <p data-correction-focus="error" tabIndex={-1} className="manual-lifecycle-error" role="alert">{error}</p> : null}
    {!preview ? <form className="manual-lifecycle-form" onSubmit={review}>
      <fieldset disabled={busy}><legend className="sr-only">Correction details</legend><div className="manual-lifecycle-fields">
        <TextField label={`Corrected refund total (${current.currency || "USD"})`} value={values.refund} onChange={update("refund")} type="number" min="0" step="0.01" required readOnly={reversing} helper="The full refund total for this return, not an additional amount." />
        <TextField label="Manual refund reference" value={values.refundReference} onChange={update("refundReference")} maxLength={2000} helper="Include a reference for any changed refund total, including a reversal to zero." />
        <TextField label="Corrected restocked quantity" value={values.restockedQuantity} onChange={update("restockedQuantity")} type="number" min="0" max={current.quantity} step="1" required readOnly={reversing} />
        <SelectField label="Corrected disposition" value={values.disposition} onChange={update("disposition")} options={["Restock review", "Dispose", "No physical return"]} />
        <TextField label="Reason for correction" value={values.reason} onChange={update("reason")} multiline required maxLength={2000} />
        {increasingStock ? <TextField label="New inspection findings" value={values.inspection} onChange={update("inspection")} multiline required maxLength={2000} /> : null}
      </div>{increasingStock ? <label className="manual-return-confirm"><input type="checkbox" checked={values.physicalReturnConfirmed} onChange={(event) => update("physicalReturnConfirmed")(event.target.checked)} required /><span>I have these physical units and checked they can return to available Inventory.</span></label> : null}</fieldset>
      <div className="manual-lifecycle-actions"><PrimaryButton type="submit" disabled={busy}>{busy ? "Reviewing…" : "Review correction"}</PrimaryButton><QuietButton disabled={busy} onClick={onCancel}>Cancel correction</QuietButton></div>
    </form> : <>
      <h3 data-correction-focus="review" tabIndex={-1}>Review correction totals</h3>
      <div className="manual-return-comparison">{[
        { title: "Before", values: preview.before },
        { title: "Change", values: { refundMinor: preview.deltas.refundMinor, restockedQuantity: preview.deltas.stockQuantity, cogsReversalMinor: preview.deltas.cogsReversalMinor } },
        { title: "After", values: preview.after },
      ].map((column) => <section key={column.title} aria-label={column.title}><h3>{column.title}</h3><DetailList items={[
        { label: "Recorded refund", value: returnMoney(column.values.refundMinor, preview.currency) },
        { label: "Restocked units", value: column.values.restockedQuantity },
        { label: "Cost restored", value: returnMoney(column.values.cogsReversalMinor, preview.currency) },
      ]} /></section>)}</div>
      <DetailList items={[{ label: "Reason", value: preview.proposal.reason }, { label: "Corrected disposition", value: preview.after.disposition }, { label: "Manual refund reference", value: preview.after.refundReference || "None" }, { label: "Available units before", value: preview.availableBefore }, { label: "Available units after", value: preview.availableAfter }]} />
      {preview.alreadyApplied ? <p role="status">This correction is already recorded. It will not be applied again.</p> : <label className="manual-return-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>I reviewed the before and after totals, the physical stock, and the correction reason.</span></label>}
      <div className="manual-lifecycle-actions">{!preview.alreadyApplied ? <PrimaryButton disabled={busy || !confirmed || !preview.canApply} onClick={apply}>{busy ? "Applying…" : reversing ? "Apply reversal" : "Apply correction"}</PrimaryButton> : null}<QuietButton disabled={busy} onClick={() => { requestFocus("form"); setPreview(null); setConfirmed(false); }}>Edit correction</QuietButton><QuietButton disabled={busy} onClick={onCancel}>Cancel correction</QuietButton></div>
    </>}
  </section>;
}
