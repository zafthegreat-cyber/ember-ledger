// Shared with the existing modal effect so cold and already-loaded forms choose
// the same active step and field. A pending form is itself a focusable status.
export function focusFlowModalContent(modal, type) {
  const scope = modal?.querySelector(".scout-report-step-card.active")
    || modal?.querySelector("[data-active-step='true']")
    || modal?.querySelector(".flow-modal-body")
    || modal;
  if (!["multiDestinationAdd", "scoutSubmit"].includes(type)) scope?.scrollIntoView?.({ block: "nearest" });
  const pending = scope?.querySelector("[data-deferred-modal-loading]");
  const stepHeading = type === "scoutSubmit" ? scope?.querySelector("[data-scout-step-heading]") : null;
  const selector = type === "scoutSubmit"
    ? "input[placeholder='Search store, city, ZIP, or nickname']:not([disabled]), input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not(.modal-close-button):not([disabled]), [href], summary, [tabindex]:not([tabindex='-1'])"
    : "input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not(.modal-close-button):not([disabled]), [href], summary, [tabindex]:not([tabindex='-1'])";
  const target = pending || stepHeading || scope?.querySelector(selector)
    || modal?.querySelector("button:not(.modal-close-button):not([disabled]), [href], input:not([type='hidden']):not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex='-1'])");
  if (target && target === stepHeading) {
    const body = modal?.querySelector(".flow-modal-body");
    if (body) body.scrollTop = 0;
    target.focus({ preventScroll: true });
  } else {
    target?.focus?.();
  }
}
