import { useEffect, useRef } from "react";
import "./scout-delete-report-dialog.css";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export default function ScoutDeleteReportDialog({ storeName, onCancel, onConfirm, returnFocusRef }) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const confirmedRef = useRef(false);

  useEffect(() => {
    const opener = returnFocusRef?.current || document.activeElement;
    const openerDialog = opener?.closest?.('[role="dialog"]');
    const previousOverflow = document.body.style.overflow;
    // A parent report dialog already owns its lock; do not release it on cancel.
    const ownsScrollLock = previousOverflow !== "hidden";
    if (ownsScrollLock) document.body.style.overflow = "hidden";
    cancelRef.current?.focus({ preventScroll: true });

    const containFocus = (event) => {
      if (dialogRef.current && !dialogRef.current.contains(event.target)) {
        cancelRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("focusin", containFocus);
    return () => {
      document.removeEventListener("focusin", containFocus);
      if (ownsScrollLock) document.body.style.overflow = previousOverflow;
      if (!confirmedRef.current) {
        // Let the parent remove its inert state before returning keyboard focus.
        window.requestAnimationFrame(() => {
          if (!opener?.isConnected || opener.closest?.('[inert], [aria-hidden="true"]')) return;
          const newerModal = [...document.querySelectorAll('[role="dialog"][aria-modal="true"]')]
            .some((node) => node !== openerDialog && node.getClientRects().length && !node.closest('[inert], [aria-hidden="true"]'));
          const activeElement = document.activeElement;
          const focusMovedElsewhere = activeElement && activeElement !== document.body && activeElement !== opener && !openerDialog?.contains(activeElement);
          if (!newerModal && !focusMovedElsewhere) opener.focus({ preventScroll: true });
        });
      }
    };
  }, [returnFocusRef]);

  function handleKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll(FOCUSABLE)]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== "hidden");
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) {
      event.preventDefault();
      dialogRef.current.focus();
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="scout-delete-report-backdrop" role="presentation" onClick={onCancel}>
      <section
        ref={dialogRef}
        className="scout-delete-confirm-sheet scout-delete-report-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scout-page-delete-title"
        aria-describedby="scout-page-delete-description"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="scout-delete-report-dialog__header">
          <div>
            <p>Delete Scout report</p>
            <h2 id="scout-page-delete-title">Delete this report?</h2>
          </div>
          <button type="button" className="scout-delete-report-dialog__close" aria-label="Close delete confirmation" onClick={onCancel}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="scout-delete-report-dialog__body" id="scout-page-delete-description">
          <p>This will delete the report for <strong>{storeName || "the selected store"}</strong>.</p>
          <p>Choose Cancel to keep this report.</p>
        </div>
        <footer className="scout-delete-report-dialog__footer">
          <button ref={cancelRef} type="button" className="scout-delete-report-dialog__cancel" onClick={onCancel}>Cancel</button>
          <button type="button" className="scout-delete-report-dialog__confirm delete-button" onClick={() => {
            confirmedRef.current = true;
            onConfirm();
          }}>Delete Report</button>
        </footer>
      </section>
    </div>
  );
}
