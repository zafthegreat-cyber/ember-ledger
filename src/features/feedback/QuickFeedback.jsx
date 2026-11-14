// Quick feedback (MUST-10, 2026-11-13). One tap from anywhere: "Something's
// broken / This is confusing / I wish…", a sentence, send. The row goes to the
// existing `beta_feedback` table with the screen, app version and device
// attached, then a fire-and-forget call to the `feedback-discord` edge
// function posts a card in Discord. Offline or failed sends are queued on the
// device and retried on the next open. Never attaches record contents.
// The send/queue helpers live beside the button so the MUST-10 test can load them directly.
/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState } from "react";
import "./quick-feedback.css";

const QUEUE_KEY = "code3-quick-feedback-queue-v1";
const KINDS = [
  { key: "bug", label: "Something's broken", type: "Bug", severity: "normal" },
  { key: "confusing", label: "This is confusing", type: "Other", severity: "low" },
  { key: "wish", label: "I wish it could…", type: "Feature request", severity: "low" },
  { key: "praise", label: "I like this", type: "Other", severity: "low" },
];
const MAX_MESSAGE = 1200;

function readQueue() { try { return JSON.parse(window.localStorage.getItem(QUEUE_KEY) || "[]"); } catch { return []; } }
function writeQueue(rows) { try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(rows.slice(-20))); } catch { /* storage unavailable */ } }

function deviceSummary() {
  if (typeof window === "undefined") return {};
  return {
    source: "quick_feedback",
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    pixelRatio: window.devicePixelRatio || 1,
    theme: document.documentElement.getAttribute("data-theme") || document.querySelector(".app[data-theme]")?.getAttribute("data-theme") || "",
    online: navigator.onLine,
    language: navigator.language,
    standalone: Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches),
  };
}

function scrub(text) {
  // Keep people from pasting secrets into a bug report by accident.
  return String(text || "")
    .replace(/\b(?:\d[ -]?){13,19}\b/g, "[card number removed]")
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[ssn removed]")
    .replace(/(password|passcode|pwd)\s*[:=]\s*\S+/gi, "$1: [removed]")
    .slice(0, MAX_MESSAGE);
}

export async function sendQuickFeedback({ supabase, row }) {
  if (!supabase) return { ok: false, reason: "offline" };
  const { data, error } = await supabase.from("beta_feedback").insert(row).select("id").single();
  if (error) return { ok: false, reason: error.message || "insert-failed" };
  try {
    // Discord relay is best effort; the row is already saved.
    await supabase.functions.invoke("feedback-discord", { body: { id: data?.id, title: row.title, description: row.description, page: row.page, feedback_type: row.feedback_type, severity: row.severity, app_version: row.app_version, guest_email: row.guest_email ? "(provided)" : "", device_info: row.device_info } });
  } catch { /* Discord down or function missing: ignore */ }
  return { ok: true, id: data?.id };
}

export async function flushQuickFeedbackQueue(supabase) {
  const queue = readQueue();
  if (!queue.length || !supabase || !navigator.onLine) return 0;
  const remaining = [];
  let sent = 0;
  for (const row of queue) {
    const result = await sendQuickFeedback({ supabase, row });
    if (result.ok) sent += 1; else remaining.push(row);
  }
  writeQueue(remaining);
  return sent;
}

export default function QuickFeedback({ supabase, user, route = "", appVersion = "", workspaceId = null, hidden = false, kidSafe = false }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("bug");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState({ status: "idle", text: "" });
  const busy = useRef(false);
  const textareaRef = useRef(null);

  useEffect(() => { if (supabase) flushQuickFeedbackQueue(supabase).catch(() => {}); }, [supabase]);
  useEffect(() => { if (open) window.setTimeout(() => textareaRef.current?.focus(), 50); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (hidden || kidSafe) return null;

  const uuidLike = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));

  async function submit(event) {
    event.preventDefault();
    if (busy.current) return;
    const clean = scrub(message).trim();
    if (clean.length < 4) { setState({ status: "error", text: "Tell us a little more so we can act on it." }); return; }
    busy.current = true;
    setState({ status: "sending", text: "" });
    const chosen = KINDS.find((entry) => entry.key === kind) || KINDS[0];
    const row = {
      user_id: user?.id && uuidLike(user.id) ? user.id : null,
      workspace_id: uuidLike(workspaceId) ? workspaceId : null,
      guest_email: !user?.id && email.trim() ? email.trim().slice(0, 200) : null,
      feedback_type: chosen.type,
      page: route || "unknown",
      title: `${chosen.label}: ${clean.slice(0, 60)}${clean.length > 60 ? "…" : ""}`,
      description: clean,
      expected_result: null,
      severity: chosen.severity,
      status: "new",
      screenshot_url: "",
      device_info: { ...deviceSummary(), kind: chosen.key, route },
      browser_info: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : "",
      app_version: appVersion || "",
      related_entity_type: "quick_feedback",
      related_entity_id: null,
    };
    let result;
    try { result = await sendQuickFeedback({ supabase, row }); } catch (error) { result = { ok: false, reason: error?.message || "failed" }; }
    busy.current = false;
    if (result.ok) {
      setState({ status: "success", text: "Sent. Thank you — we read every one." });
      setMessage("");
      window.setTimeout(() => { setOpen(false); setState({ status: "idle", text: "" }); }, 1600);
    } else {
      writeQueue([...readQueue(), row]);
      setState({ status: "queued", text: "Saved on this device; it will send the next time the app is online." });
      setMessage("");
      window.setTimeout(() => { setOpen(false); setState({ status: "idle", text: "" }); }, 2200);
    }
  }

  return <>
    <button type="button" className="quick-feedback-fab" aria-label="Send feedback" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 5h16v11H8l-4 4V5Z" /><path d="M8 9h8M8 12h5" /></svg>
      <span>Feedback</span>
    </button>
    {open ? <div className="quick-feedback-backdrop" onClick={() => setOpen(false)} aria-hidden="true" /> : null}
    {open ? <form className="quick-feedback-sheet" role="dialog" aria-modal="true" aria-labelledby="quick-feedback-title" onSubmit={submit}>
      <div className="quick-feedback-head">
        <h2 id="quick-feedback-title">What's on your mind?</h2>
        <button type="button" className="quick-feedback-close" aria-label="Close" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="quick-feedback-kinds" role="radiogroup" aria-label="Kind of feedback">
        {KINDS.map((entry) => <button type="button" key={entry.key} role="radio" aria-checked={kind === entry.key} className={kind === entry.key ? "is-selected" : ""} onClick={() => setKind(entry.key)}>{entry.label}</button>)}
      </div>
      <textarea ref={textareaRef} value={message} maxLength={MAX_MESSAGE} onChange={(event) => setMessage(event.target.value)} placeholder={kind === "bug" ? "What were you doing, and what happened instead?" : kind === "wish" ? "What would you like the app to do?" : "Tell us what you saw."} rows={4} />
      {!user?.id ? <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email (optional, if you'd like a reply)" autoComplete="email" /> : null}
      <small className="quick-feedback-meta">We attach the screen you're on ({route || "unknown"}), the app version and your device type. Please don't include passwords or card numbers.</small>
      {state.text ? <p className={`quick-feedback-status is-${state.status}`} role="status">{state.text}</p> : null}
      <div className="quick-feedback-actions">
        <button type="button" className="quick-feedback-secondary" onClick={() => setOpen(false)}>Cancel</button>
        <button type="submit" className="quick-feedback-primary" disabled={state.status === "sending"}>{state.status === "sending" ? "Sending…" : "Send"}</button>
      </div>
    </form> : null}
  </>;
}
