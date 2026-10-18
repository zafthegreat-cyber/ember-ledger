export const SUPPORT_TOPICS = Object.freeze({
  general: { label: "General help", request: "I need help with Code 3 TCG." },
  access: { label: "Account access", request: "I need help accessing my Code 3 TCG account." },
  records: { label: "Saved records or device sync", request: "I need help with saved records or device sync. Please help me keep my existing data." },
  privacy: { label: "Privacy, export, or correction", request: "I have a question about my information, an export, or a correction." },
  deletion: { label: "Account deletion", request: "I need help completing account deletion." },
  ownership: { label: "Ownership transfer before deletion", request: "Account deletion is blocked by ownership. Please help me review the required ownership transfer without removing other people's records." },
  pending: { label: "Deletion started but is not confirmed", request: "Account deletion may have started, but completion is not confirmed. Please help me check its status and finish safely." },
});

export function deletionHelpState(review, errorCode = "") {
  const codes = new Set([errorCode, ...(review?.blockers || []).map((item) => item.code)]);
  if (review?.state === "pending" || codes.has("account_deletion_pending") || codes.has("outcome_unknown")) return {
    topic: "pending", title: "Check the deletion status",
    explanation: "Deletion may already have removed some cloud files. A missing confirmation does not mean it was cancelled.",
    steps: ["Check again, then follow the account verification steps to finish any pending deletion.", "If the service stays unavailable, contact support with the message below. Keep any backups you want to retain; avoid restoring them while deletion is pending."],
  };
  if (codes.has("account_shared_workspace") || codes.has("account_protected_owner")) return {
    topic: "ownership", title: "Arrange an ownership review",
    explanation: "Another owner must be verified before this account can be deleted. This page does not transfer ownership or remove a shared workspace.",
    steps: ["Contact support from your account email to review the workspace or service ownership that is blocking deletion.", "After the transfer is confirmed, return here and check again. You will still review the deletion scope and confirm it yourself."],
  };
  if (codes.has("account_storage_review_required") || codes.has("account_data_review_required")) return {
    topic: "deletion", title: "Ask for a record ownership review",
    explanation: "Some records or files need review before account deletion can continue. Their ownership cannot be safely decided from this screen.",
    steps: ["Contact support from your account email using the message below. Do not attach private backups or receipts.", "Return here after the ownership review and check again. The support draft itself does not change or delete records."],
  };
  if (codes.has("account_sign_in_required")) return {
    topic: "access", title: "Verify your account access",
    explanation: "The account service could not verify this sign-in.",
    steps: ["Sign in again to the account you want to delete. Use password reset if needed.", "If you cannot regain access, contact support from your account email for a verification review."],
  };
  if (review && !review.available || errorCode && !["account_reauthentication_failed", "invalid_confirmation"].includes(errorCode)) return {
    topic: "deletion", title: "Deletion is not available right now",
    explanation: "The app has not confirmed that your account was deleted. You can check again or ask support for help.",
    steps: ["If you want to keep a copy, use Settings → Cloud saving & recovery to export available backups.", "Open or copy the support message below, then send it from your email app. A draft or email is not confirmation that deletion is complete."],
  };
  return null;
}

// No account identifiers, messages from the server, stored records, credentials,
// browser history, or device fingerprint are accepted into a support draft.
export function privacySupportDraft({ topic = "general", note = "", recipient = "" } = {}) {
  const selected = Object.hasOwn(SUPPORT_TOPICS, topic) ? SUPPORT_TOPICS[topic] : SUPPORT_TOPICS.general;
  const cleanNote = typeof note === "string" ? note.trim().slice(0, 600) : "";
  const subject = `Code 3 TCG: ${selected.label}`;
  const body = [
    selected.request,
    "",
    cleanNote ? `What happened:\n${cleanNote}` : "What happened: [add the screen, device type, and what happened]",
    "",
    "I will send this from my account email. Please tell me how to verify ownership if needed.",
  ].join("\n");
  const validRecipient = /^[^\s@<>?,;:]+@[^\s@<>?,;:]+\.[^\s@<>?,;:]+$/.test(recipient);
  return { subject, body, text: `To: ${validRecipient ? recipient : "Support contact unavailable"}\nSubject: ${subject}\n\n${body}`,
    mailto: validRecipient ? `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` : "" };
}
