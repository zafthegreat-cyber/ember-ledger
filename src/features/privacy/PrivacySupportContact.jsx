import { useId, useRef, useState } from "react";
import { PRIVACY_PUBLISHER } from "../../config/privacyPolicy.js";
import { privacySupportDraft, SUPPORT_TOPICS } from "./privacySupport.js";

export default function PrivacySupportContact({ topic: initialTopic = "general", allowTopicChoice = false, publisher = PRIVACY_PUBLISHER }) {
  const [topic, setTopic] = useState(() => Object.hasOwn(SUPPORT_TOPICS, initialTopic) ? initialTopic : "general");
  const [note, setNote] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const messageRef = useRef(null);
  const detailsRef = useRef(null);
  const id = useId();
  const draft = privacySupportDraft({ topic, note, recipient: publisher.supportEmail });

  async function copyMessage() {
    setCopyStatus("");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Manual copy needed");
      await navigator.clipboard.writeText(draft.text);
      setCopyStatus("Support message copied. Paste it into your email app, review it, and send when ready.");
    } catch {
      if (detailsRef.current) detailsRef.current.open = true;
      messageRef.current?.focus();
      messageRef.current?.select();
      setCopyStatus("The message is selected below. Use your device's Copy action, then paste it into your email app.");
    }
  }

  return <section className="code3-support-contact" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Contact Code 3 TCG support</h3>
    {publisher.supportEmail ? <p>Send from your account email to <strong>{publisher.supportEmail}</strong>. Support verifies ownership before disclosing or removing private information.</p> : <p>Support contact information is currently unavailable. You can copy the message and keep it until a verified contact is available.</p>}
    {allowTopicChoice && <><label htmlFor={`${id}-topic`}>Help topic</label><select id={`${id}-topic`} value={topic} onChange={(event) => { setTopic(event.target.value); setCopyStatus(""); }}>
      {Object.entries(SUPPORT_TOPICS).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}
    </select></>}
    <label htmlFor={`${id}-note`}>What happened? <span className="code3-privacy-meta">Optional · {note.length}/600 characters</span></label>
    <textarea id={`${id}-note`} value={note} onChange={(event) => { setNote(event.target.value); setCopyStatus(""); }} maxLength={600} rows={3} placeholder="For example: I cannot review account deletion on my Android phone." aria-describedby={`${id}-privacy`} />
    <p id={`${id}-privacy`} className="code3-privacy-meta">Keep passwords, app passwords, payment details, and private backups out of this message. Nothing is attached automatically.</p>
    <div className="code3-privacy-actions">
      {draft.mailto && <a href={draft.mailto}>Open email draft</a>}
      <button type="button" onClick={() => void copyMessage()}>Copy support message</button>
    </div>
    <p className="code3-privacy-meta">Opening or copying a draft does not send it. Review and send it in your email app. It does not submit or complete account deletion.</p>
    <details ref={detailsRef} className="code3-support-message"><summary>Read or manually copy the message</summary>
      <label htmlFor={`${id}-message`}>Support message</label><textarea id={`${id}-message`} ref={messageRef} readOnly value={draft.text} rows={9} />
    </details>
    {copyStatus && <p role="status">{copyStatus}</p>}
  </section>;
}
