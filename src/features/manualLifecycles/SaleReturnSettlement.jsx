import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { PrimaryButton, QuietButton, SectionHeader, StatusBadge } from "../../components/operations/OperationsUI.jsx";
import { DetailList } from "../../components/operations/RecordExperience.jsx";
import SaleReturnCorrection, { ReturnCorrectionHistory } from "./SaleReturnCorrection.jsx";
import { returnMoney } from "./returnPresentation.js";

export default function SaleReturnSettlement({ record, service, isOwnerAuthorized, onApplied }) {
  const [preview, setPreview] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [correctionMode, setCorrectionMode] = useState("");
  const pending = useRef(false);
  const alive = useRef(true);
  const sectionRef = useRef(null), focusRequest = useRef("");
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useLayoutEffect(() => {
    if (!focusRequest.current || busy) return;
    const target = sectionRef.current?.querySelector(`[data-return-focus="${focusRequest.current}"]`);
    focusRequest.current = "";
    if (isOwnerAuthorized()) target?.focus();
  }, [preview, error, busy, correctionMode, isOwnerAuthorized]);
  const requestFocus = (target) => {
    if (document.activeElement === document.body || sectionRef.current?.contains(document.activeElement)) focusRequest.current = target;
  };

  const run = async (operation) => {
    if (pending.current || !isOwnerAuthorized()) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await operation(); }
    catch (failure) {
      if (alive.current && isOwnerAuthorized()) {
        requestFocus("error");
        setError(failure.message || "This return could not be applied. Review the latest saved records and try again.");
        setPreview(null);
        setConfirmed(false);
      }
    } finally { pending.current = false; if (alive.current) setBusy(false); }
  };
  const review = () => run(async () => {
    const next = await service.previewReturn(record.id);
    if (alive.current && isOwnerAuthorized()) { requestFocus("review"); setPreview(next); setConfirmed(false); }
  });
  const apply = () => run(async () => {
    if (!confirmed || !preview || preview.blockers?.length || preview.alreadyApplied) return;
    const result = await service.applyReturn({ returnId: record.id, expectedVersion: preview.expectedVersion, confirmed: true });
    if (alive.current && isOwnerAuthorized()) onApplied(result);
  });
  const inspected = ["Inspected", "Closed"].includes(record.status);
  return <section ref={sectionRef} className="manual-return-settlement" aria-label="Return settlement">
    <SectionHeader title="Stock & refund review" description="Apply the inspected disposition and record the manual refund together. Original sale amounts and acquisition history remain available." />
    <p className="manual-lifecycle-note">This records a refund already handled outside the app. It does not send money. Only a reviewed restock returns units to available Inventory.</p>
    {error ? <p data-return-focus="error" tabIndex={-1} className="manual-lifecycle-error" role="alert">{error}</p> : null}
    {!isOwnerAuthorized() ? <p role="status">Owner access is required to review and apply a return.</p> : !inspected ? <p role="status">Receive and inspect this return before reviewing its stock and refund effects.</p> : <>
      {!preview ? <QuietButton data-return-focus="start" disabled={busy} onClick={review}>{busy ? "Reviewing…" : "Review stock & refund"}</QuietButton> : <>
        <h3 data-return-focus="review" tabIndex={-1}>{preview.alreadyApplied ? "Applied return totals" : "Review return totals"}</h3>
        <StatusBadge tone={preview.alreadyApplied ? "success" : preview.blockers?.length ? "warning" : "info"}>{preview.alreadyApplied ? "Applied once" : preview.blockers?.length ? "Needs attention" : "Ready for your review"}</StatusBadge>
        <DetailList items={[
          { label: "Returned quantity", value: preview.quantity },
          { label: preview.alreadyApplied ? "Units restocked" : "Units to restock", value: preview.restockedQuantity },
          { label: "Manual refund", value: returnMoney(preview.refundMinor, preview.currency) },
          { label: "Refund reference", value: preview.refundReference },
          { label: "Inspected disposition", value: preview.disposition },
          { label: "Cost restored to Inventory", value: returnMoney(preview.cogsReversalMinor, preview.currency) },
          ...(preview.alreadyApplied
            ? [{ label: "Available units now", value: preview.availableAfter }]
            : [{ label: "Available units before", value: preview.availableBefore }, { label: "Available units after", value: preview.availableAfter }]),
        ]} />
        {preview.blockers?.length ? <ul className="manual-lifecycle-error" role="alert">{preview.blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}</ul> : null}
        {preview.alreadyApplied ? <>
          <p role="status">This return is already recorded. These totals include its saved corrections. Reviewing it again cannot add stock or issue another refund record.</p>
          <ReturnCorrectionHistory preview={preview} />
          {correctionMode ? <SaleReturnCorrection record={record} current={preview} mode={correctionMode} service={service} isOwnerAuthorized={isOwnerAuthorized} onApplied={(result) => { requestFocus("start"); setCorrectionMode(""); setPreview(null); setConfirmed(false); onApplied({ ...result, correctionApplied: true }); }} onCancel={() => { requestFocus(correctionMode); setCorrectionMode(""); }} /> : <div className="manual-lifecycle-actions"><QuietButton data-return-focus="correct" onClick={() => setCorrectionMode("correct")}>Correct applied return</QuietButton><QuietButton data-return-focus="reverse" onClick={() => setCorrectionMode("reverse")}>Reverse applied return</QuietButton><QuietButton disabled={busy} onClick={review}>Refresh review</QuietButton></div>}
        </> : !preview.blockers?.length ? <>
          <label className="manual-return-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={(event) => setConfirmed(event.target.checked)} /><span>I checked the inspection, stock disposition, and manual refund reference.</span></label>
          <div className="manual-lifecycle-actions"><PrimaryButton disabled={busy || !confirmed} onClick={apply}>{busy ? "Applying…" : "Apply return & close record"}</PrimaryButton><QuietButton disabled={busy} onClick={() => { requestFocus("start"); setPreview(null); setConfirmed(false); }}>Cancel review</QuietButton></div>
        </> : <QuietButton disabled={busy} onClick={review}>Refresh review</QuietButton>}
      </>}
    </>}
  </section>;
}
